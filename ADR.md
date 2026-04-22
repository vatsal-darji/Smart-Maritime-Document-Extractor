## Question 1 — Sync vs Async: which should be the default in production?

**Decision: async should be the default. Sync exists for convenience, not for production use.**

Here is the honest reason: LLM calls are slow. Gemini takes anywhere from 3 to 12 seconds
depending on document complexity, file size, and API load. In sync mode, your Node.js
server holds an open HTTP connection for that entire duration. If 10 users upload documents
at the same time, you have 10 threads sitting idle, each waiting on Gemini. Node.js handles
concurrency well, but holding connections open like this exhausts your connection pool,
makes timeouts harder to reason about, and gives users no feedback while they wait.

Async mode solves this cleanly. The user gets a 202 in under 100ms, a jobId to poll,
and the heavy work happens in the background. The connection is freed immediately.

That said, sync mode is genuinely useful for local testing, for single-document
integrations, for cases where the caller cannot implement polling. So we keep it, but
we document it as the non-default.

**When to force async regardless of the mode param:**

There are cases where you should ignore the mode param and force async even if the
caller asked for sync:

- File size exceeds 2MB. Larger files take longer to read, base64-encode, and transmit
  to Gemini. The latency becomes unacceptable for a synchronous response.
- Queue depth exceeds 20 active jobs. At this point the worker is under load and a
  sync request would effectively wait behind async work anyway — you might as well
  make that explicit.
- The file is a PDF. PDFs consistently take longer than images because Gemini processes
  them page by page internally. A 10-page certification document can take 15+ seconds.

A production implementation would check queue depth from Redis before processing the
mode param, override it silently if thresholds are exceeded, and include a note in the
202 response body explaining why async was chosen.

---

## Question 2 — Queue mechanism: why BullMQ?

**Decision: BullMQ backed by Redis.**

I evaluated three options:

**Option A — In-process queue (simple async array + worker loop)**
This is the simplest thing that works. You maintain a queue in memory, a setInterval
drains it, jobs run. Zero dependencies beyond what you already have.

The problem is persistence. If the server restarts — for a deploy, a crash, an OOM kill —
every queued job is gone. The user uploaded a document, got a 202, and their job silently
disappeared. In a document processing system that handles real seafarer credentials,
silent data loss is not acceptable.

**Option B — Database polling queue (pg-boss)**
Store jobs in Postgres, poll the table every few seconds, process them. This eliminates
the Redis dependency because you already have Postgres.

The problem is polling overhead and latency. Even polling every second adds up to a
second of unnecessary delay per job. Under load, frequent polling creates lock contention
on the jobs table. And implementing stalled job detection, retry backoff, and concurrency
control correctly on top of raw SQL is non-trivial work that pg-boss solves but adds
another dependency anyway.

**Option C — BullMQ (chosen)**
BullMQ uses Redis as a persistent, fast job store. Jobs survive process restarts because
they live in Redis, not in memory. The stalled job detection is built in — if the worker
process crashes mid-job, BullMQ detects that the lock expired and re-queues the job
automatically. Concurrency, retry with backoff, job prioritisation — all configuration,
not code.

The tradeoff is Redis becomes a required dependency. If Redis goes down, async extraction
stops entirely. We accept this tradeoff because Redis is operationally simple to run and
manage, and the alternative (losing jobs on restart) is worse than the failure mode of
Redis being unavailable.

**Current failure modes:**

- Redis is a single point of failure. Mitigation for production: use a managed Redis
  (Upstash, ElastiCache) or Redis Sentinel for automatic failover.
- The worker runs in the same process as the API server. Under sustained load, worker
  CPU competes with request handling. The clean fix is running the worker as a separate
  process — the code already supports this since the worker is fully isolated in
  `helpers/queue.ts`. Splitting it out is a one-line change to the entry point.

**Migration path to 500 concurrent extractions per minute:**

At that volume, a single worker process hits its ceiling. The path forward is:
1. Extract the worker into its own deployable service with its own entry point
2. Scale worker instances horizontally — BullMQ handles multiple workers on the same
   Redis queue natively, they compete for jobs without coordination code
3. Add a rate limiter on the Gemini side — at 500 extractions per minute you will hit
   Gemini's tokens-per-minute limit before you hit any infrastructure limit
4. Move to Redis Cluster if queue size grows large enough to need it


## Question 3 — LLM provider abstraction

**Decision: thin function interface with Gemini implemented. Swapping providers takes
one file.**

The abstraction lives entirely in `llmService.ts` behind this function signature:

```typescript
extractDocument(
  filePath: string,
  mimeType: SupportedMimeType,
  fileName: string,
): Promise<{ parsed: LLMExtractionResult; raw: string }>
```

Nothing outside `llmService.ts` knows or cares that Gemini is the provider. The
extraction service, the worker, and the controller all call `extractDocument` — they
have no Gemini imports, no Gemini types, no Gemini error handling. Provider, model,
and API key are all environment-variable driven via `LLM_PROVIDER`, `LLM_MODEL`,
and `LLM_API_KEY`.

Swapping to a different provider means writing a new implementation of `callLLM` and
`callLLMRepair` inside `llmService.ts` and adding a switch case to the factory. Zero
changes anywhere else in the codebase.

I deliberately kept the abstraction thin. A heavier interface — streaming support,
multi-modal variants, token counting, provider-specific configuration — would be
premature. We have one provider, one use case, one call pattern. The right time to
make the abstraction richer is when a second provider is actually needed and you can
see the concrete differences that the interface needs to hide.

**On error handling:**

One place where the abstraction does real work is error normalisation. Gemini returns
errors in a nested JSON structure with its own status codes and HTTP codes. The
`LLMServiceError` class normalises all of this into a consistent shape — `source`,
`code`, `message`, `httpStatus`, `retryable` — before it reaches the rest of the
system. This means the worker's retry logic and the controller's error response do not
need to know anything about how Gemini formats its errors.

---

## Question 4 — Schema design decisions

**Decision: promote queryable fields to typed columns. Use JSONB only for data that
is genuinely dynamic and never appears in a WHERE clause.**

The starter schema stored everything as TEXT blobs. That approach works until the
first time you need to query inside it — at which point you are writing `LIKE` queries
against JSON strings, which cannot be indexed and will full-scan the table.

**The principle I applied:**

If a field ever appears in a WHERE clause, an ORDER BY, or a GROUP BY — it must be
a real column with a real type and an index. Everything else can go in JSONB.

**What was promoted and why:**

| Column | Why it needs to be a real column |
|---|---|
| `document_type` | `WHERE document_type = 'COC'` — core compliance query |
| `confidence` | Worker retry logic reads this to decide whether to re-call the LLM |
| `applicable_role` | Session summary groups documents by role |
| `is_expired` | `WHERE is_expired = true` — Manning Agent dashboard filter |
| `date_of_expiry` | Range queries: expiring within 90 days |
| `days_until_expiry` | Pre-computed at extraction time, avoids re-parsing date strings |
| `fitness_result` | Validation logic checks for UNFIT directly |
| `drug_test_result` | Validation logic checks for POSITIVE directly |
| `holder_name`, `sirb_number`, `passport_number` | Cross-document consistency checks |

**What stayed in JSONB and why:**

`fields_json` — the fields array is document-type-specific. A COC has entirely
different fields than a PEME. Normalising this into a separate `extraction_fields`
table (EAV pattern) would add a join to every query and make inserts more complex,
with no benefit since we never query inside individual field values.

`flags_json`, `validity_json`, `medical_data_json`, `compliance_json` — these exist
primarily to serve the API response. The individual values that matter for queries are
already promoted as scalar columns. The JSONB blobs let us return the full nested
object to the client without reconstructing it from multiple columns.

**Why `document_type` is VARCHAR and not a Postgres ENUM:**

The taxonomy has 25 values today. Maritime certification standards evolve — the IMO
introduces new STCW endorsements regularly, flag states add their own requirements.
Adding a value to a Postgres ENUM requires `ALTER TYPE ADD VALUE`, which cannot run
inside a transaction. If that migration fails halfway through, you cannot roll it back.
On a table with millions of rows, that is a real operational risk.

VARCHAR with application-layer validation via a TypeScript const union gives us the
same compile-time safety with zero migration risk when a new document type is added.

Fields whose value sets are fully controlled by our own system — `status`, `confidence`,
`applicable_role`, `overall_status` — use Postgres ENUMs safely, because we control
when and how those values change.

**Indexes defined and why each exists:**

```sql
-- Powers every dedup check on upload
-- Partial index excludes soft-deleted rows — smaller, faster
CREATE INDEX idx_extractions_dedup
  ON extractions(session_id, file_hash)
  WHERE deleted_at IS NULL;

-- Every session page load hits this
CREATE INDEX idx_extractions_session_id ON extractions(session_id);

-- Expiry dashboard: WHERE is_expired = true
CREATE INDEX idx_extractions_is_expired ON extractions(is_expired);

-- Expiry window queries: WHERE date_of_expiry < NOW() + interval '90 days'
CREATE INDEX idx_extractions_date_expiry ON extractions(date_of_expiry);

-- Compliance queries: WHERE document_type = 'COC'
CREATE INDEX idx_extractions_document_type ON extractions(document_type);

-- Job polling: WHERE id = $1 (covered by PK, but status filter benefits)
CREATE INDEX idx_jobs_status ON jobs(status);

-- Session job listing
CREATE INDEX idx_jobs_session_id ON jobs(session_id);
```

**If full-text search across extracted fields were needed:**

Add a `tsvector` generated column over `fields_json` and `summary`, maintained
automatically by Postgres. Add a GIN index on it. Query with the `@@` operator.
This is purely additive — no existing columns or queries change.

**If the query "all sessions where any document has an expired COC" were needed:**

Already possible with the current schema, no changes required:

```sql
SELECT DISTINCT session_id
FROM extractions
WHERE document_type = 'COC'
  AND is_expired = TRUE
  AND deleted_at IS NULL;
```

This is exactly why `document_type` and `is_expired` are real columns.

---

## Question 5 — What was deliberately skipped and why

**1. Authentication and authorisation**

No auth on any endpoint. In production every endpoint needs at minimum an API key
header check, and session-scoped endpoints should verify the caller owns that session.
This was deprioritised because the assessment focuses on the extraction pipeline. Adding
JWT middleware or API key validation is straightforward but would not demonstrate
anything the evaluators are testing for.

**2. Webhook support — implemented as bonus**

Async job completion delivers a signed POST to an optional `webhookUrl` field
on the extract request. The payload is HMAC-SHA256 signed using `WEBHOOK_SECRET`
and sent with an `X-Maritime-Signature: sha256=<hex>` header so the receiver can
verify authenticity.

Delivery is fire-and-forget via `safeDeliverWebhook` — a failed delivery is
logged but never crashes the worker or affects the job result. This is intentional:
the job is already complete at delivery time, and retrying webhook delivery is a
separate concern from retrying extraction.

What is not implemented is webhook delivery retry. If the receiver is temporarily
down, the event is lost. A production implementation would push failed deliveries
to a dedicated retry queue with exponential backoff and a dead-letter store. This
was deprioritised because the core extraction pipeline was the assessment priority,
and the fire-and-forget pattern is an honest tradeoff worth documenting rather than
hiding.

**3. Redis-backed rate limiting**

The current rate limiter uses `express-rate-limit` with in-memory storage. This works
correctly for a single-instance deployment but resets on every restart and does not
share state across multiple instances. In production with horizontal scaling, each
instance has its own counter — a user can make 10 requests to instance A and 10 to
instance B for an effective limit of 100. The fix is `rate-limit-redis` as the store,
which is a three-line change. Skipped because the service currently runs as a single
instance and the behaviour is correct for that topology.

**4. Structured logging**

`console.log` and `console.error` are used throughout with structured JSON objects.
This is better than plain string logging but a production system needs a proper logger —
Pino or Winston — with log levels controlled by environment variable, request ID
injection, and log correlation across the async job lifecycle (so you can trace a single
document upload from the HTTP request through the queue to the worker completion in one
log query). Skipped because adding a logger is mechanical work that does not affect
correctness or the architecture decisions being evaluated.

**5. Runtime validation of LLM output shape**

The LLM response is parsed as JSON and cast to `LLMExtractionResult` via TypeScript.
TypeScript types are erased at runtime — if Gemini returns a valid JSON object that
does not match the expected shape, the cast succeeds silently and we write malformed
data to the database. The correct fix is a Zod schema that validates the parsed object
at runtime before any database write, with field-level error reporting so you know
exactly which fields are missing or wrong. This was skipped due to time constraints.
The TypeScript interface documents the contract even if it is not enforced at runtime,
and the `raw_llm_response` column means the original response is always available for
debugging when something looks wrong in the data.
```