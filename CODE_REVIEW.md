Hi, The basic shape is right the file upload, base64 conversion, LLM call, parse, respond. But there are several issues here that would block this from going to production. I have focused on the ones that actually matter rather than style preferences.

## Overall assessment

The prototype works for the happy path. What it does not handle is anything going wrong — and in a system that depends on an external LLM API, things will go wrong regularly. The feedback below is mostly about making the failure cases as solid as the happy path.

## Critical — fix before merge

### 1. Hardcoded API key — line 5

```typescript
const client = new Anthropic({ apiKey: 'sk-ant-REDACTED' });
```

Even with the value redacted in this review, if this was ever a real key in your local copy and you committed it, it is now in git history permanently. `git log` does not forget, and secret scanning tools will find it.

Fix:

```typescript
const client = new Anthropic({
  apiKey: process.env.LLM_API_KEY ?? (() => {
    throw new Error('LLM_API_KEY is not set');
  })(),
});
```

The IIFE pattern means the server refuses to start without the key rather than failing silently on the first request. Going forward, add a `.env.example` file and make sure `.env` is in `.gitignore` before anything else.


### 2. Using Opus for every request

```typescript
model: 'claude-opus-4-6',
```

I understand you tested this and it gave better results — that instinct is right, Opus is more capable. But it costs roughly 15x more per token than Haiku. At any real volume, that difference becomes significant very fast.

The model should be environment-variable driven:

```typescript
model: process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001',
```

This also satisfies a hard requirement in the spec — the model must be swappable
via environment variable without code changes.


## High — will cause silent failures in production

### 3. No timeout on the LLM call

```typescript
const response = await client.messages.create({ ... });
```

If Gemini or Anthropic hangs — which happens under load — this awaits indefinitely. The Express worker thread is held open until Node's socket timeout fires, which can be several minutes. Under any concurrency this will exhaust your thread pool.

Wrap it in a `Promise.race` with a 30-second ceiling:

```typescript
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('LLM_TIMEOUT')), 30_000)
);
const response = await Promise.race([client.messages.create({ ... }), timeout]);
```

---

### 4. `JSON.parse` will throw on most real LLM responses

```typescript
const result = JSON.parse(response.content[0].text);
```

LLMs frequently wrap responses in markdown code fences even when instructed not to:

```json
    { "detection": ... }
```

`JSON.parse` throws on this. Your catch block then returns a 500 with no stored record, the user's upload is silently lost.

You need a two-strategy extractor before falling back to a repair prompt:

```typescript
function extractJSON(raw: string): unknown | null {
  // Strategy 1: clean response
  try { return JSON.parse(raw); } catch {}

  // Strategy 2: find outermost { } boundary — handles fences and preamble
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
  }

  return null; // caller sends repair prompt
}
```

If both strategies fail, send the raw response back to the LLM and ask it to return clean JSON. The spec grades this explicitly

### 5. Failed extractions are silently dropped

```typescript
} catch (error) {
  console.log('Error:', error);
  res.status(500).json({ error: 'Something went wrong' });
}
```

The spec is explicit: *nothing uploaded by the user is ever silently lost*. Even on total failure, write a record to the database:

```typescript
} catch (err: any) {
  await createExtraction({
    id:               uuidv4(),
    session_id:       sessionId,
    file_name:        fileName,
    file_hash:        fileHash,
    raw_llm_response: err.rawText ?? err.message,
    status:           'FAILED',
  });

  return res.status(422).json({
    error:   'LLM_JSON_PARSE_FAIL',
    message: 'Extraction failed. Raw response has been stored for review.',
  });
}
```

This matters for two reasons — the user can see their upload was received even if processing failed, and you have the raw LLM response available for debugging.


## Medium — important but not an immediate blocker

### 6. Global state for storing results

```typescript
global.extractions = global.extractions || [];
global.extractions.push(result);
```

This resets on every deploy and is invisible across multiple instances. Results
need to go to the database — that is the only store that survives restarts and
is visible to every instance. Once the DB write is in place the GET endpoint
reads it back reliably.

---

### 7. Files saved permanently with original names

```typescript
const savedPath = path.join('./uploads', file.originalname);
fs.copyFileSync(file.path, savedPath);
```

Two problems here. First, using `file.originalname` as the key means two users uploading `passport.pdf` overwrite each other. Second, these files are never deleted — the uploads directory grows indefinitely.

For async processing, copy to a stable path with a UUID filename before enqueuing and delete after the worker finishes. For sync processing, delete the temp file in a `finally` block after the LLM call completes regardless of success or failure.

Also worth noting — seafarer documents contain PII. Storing them on disk longer
than necessary creates a compliance risk. Process and delete, do not archive.


### 8. The prompt does not match the spec

```typescript
text: 'Extract all information from this maritime document and return as JSON.',
```

This will get you a JSON response but not the structured shape the rest of the
system depends on — the document taxonomy codes, the `detection`, `holder`,
`validity`, `compliance`, `medicalData`, `flags` structure, none of it. The spec
provides a specific prompt that all candidates must use verbatim. Use that prompt.


## Teaching moment — think about the failure case first

The gap between this PR and production-ready is not about TypeScript skill or domain knowledge. It is about the habit of asking "what happens when this goes wrong" before writing the happy path.

Every line that touches an external system — the LLM API, the filesystem, the database — needs to answer three questions before you write it:

1. What happens if this call times out?
2. What happens if it returns something unexpected?
3. What does the user experience in either case?

Right now most of those answers are "the server returns a 500 and the upload is lost". In a system handling real seafarer credentials that is not acceptable.

The habit to build is: write the `try/catch` and the fallback before you write the happy path. It sounds counterintuitive but it produces much more resilient code, and it forces you to think through the failure modes before you are committed to an implementation.

