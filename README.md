# Maritime Scanner

An AI-powered REST API for extracting, validating, and reporting on maritime seafarer certification documents. Built with Node.js, Express, PostgreSQL, Redis/BullMQ, and Google Gemini.

---

## Overview

Maritime Scanner accepts scanned certification documents (JPEG, PNG, PDF) and uses an LLM to extract structured compliance data — document type, holder identity, validity dates, STCW references, medical fitness, and compliance flags. Documents are grouped into **sessions**, enabling cross-document validation and report generation for a seafarer's full certification portfolio.

**Key capabilities:**

- **Synchronous extraction** — upload a document and get structured data back immediately
- **Asynchronous extraction** — enqueue a job and poll for results (or receive a webhook callback)
- **Deduplication** — identical files within a session are not re-processed
- **Session validation** — cross-document consistency checks, missing document detection, expiry warnings
- **Report generation** — structured compliance report for a full session

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL (pg) |
| Queue | BullMQ + Redis (ioredis) |
| LLM | Google Gemini (`@google/genai`) |
| File uploads | Multer |
| Validation | Joi |
| Auth | Passport + JWT |
| Build | SWC |

---

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+

---

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

```env
NODE_ENV=development
PORT=8000
API_URL=http://localhost:8000

# PostgreSQL
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/your_db

# Google Gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash

# BullMQ (optional — defaults to 127.0.0.1:6379)
QUEUE_PREFIX=maritime
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

**3. Run database migrations**

```bash
npm run migrate
```

**4. Start the server**

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The server starts on `http://localhost:8000` by default.

---

## API Reference

### Health

#### `GET /api/health`

Returns server status.

---

### Extraction

#### `POST /api/extract?mode=sync|async`

Upload a maritime document for AI extraction.

**Rate limit:** 10 requests per minute per IP.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | JPEG, PNG, or PDF |
| `sessionId` | string (body) | No | UUID of an existing session; one is created if omitted |
| `webhookUrl` | string (body) | No | HTTP/HTTPS URL to receive completion callbacks (async mode only) |

**Query params:**

| Param | Values | Default | Description |
|---|---|---|---|
| `mode` | `sync` \| `async` | `sync` | Sync returns result immediately; async returns a job ID |

**Sync response (200)**

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "fileName": "stcw_cert.pdf",
  "documentType": "COC",
  "documentName": "Certificate of Competency",
  "applicableRole": "DECK",
  "category": "CERTIFICATION",
  "confidence": "HIGH",
  "holderName": "John Smith",
  "dateOfBirth": "15/03/1985",
  "sirbNumber": "...",
  "fields": [...],
  "validity": { "dateOfExpiry": "31/12/2026", "isExpired": false, "daysUntilExpiry": 204 },
  "compliance": { "issuingAuthority": "MARINA", "regulationReference": "STCW Reg II/1" },
  "medicalData": { "fitnessResult": "N/A" },
  "flags": [],
  "isExpired": false,
  "processingTimeMs": 1842,
  "summary": "...",
  "createdAt": "2026-06-06T10:00:00Z"
}
```

**Async response (202)**

```json
{
  "jobId": "uuid",
  "sessionId": "uuid",
  "status": "QUEUED",
  "pollUrl": "/api/jobs/{jobId}",
  "estimatedWaitMs": 6000
}
```

If the same file (by SHA-256 hash) is uploaded again within the same session, the cached result is returned with the header `X-Deduplicated: true`.

---

### Jobs

#### `GET /api/jobs/:jobId`

Poll the status of an async extraction job.

**Statuses:** `QUEUED` | `PROCESSING` | `COMPLETE` | `FAILED`

**Response (200)**

```json
{
  "jobId": "uuid",
  "sessionId": "uuid",
  "status": "COMPLETE",
  "extractionId": "uuid",
  "errorCode": null,
  "errorMessage": null,
  "retryable": false,
  "queuedAt": "...",
  "startedAt": "...",
  "completedAt": "..."
}
```

---

### Sessions

#### `GET /api/sessions/:sessionId`

Get a session summary with all extracted documents.

**Response (200)**

```json
{
  "sessionId": "uuid",
  "documentCount": 4,
  "detectedRole": "DECK",
  "overallHealth": "WARN",
  "documents": [...],
  "pendingJobs": [...]
}
```

`overallHealth` values: `OK` | `WARN` | `CRITICAL`

---

#### `POST /api/sessions/:sessionId/validate`

Run cross-document validation for a session. Requires at least 2 documents.

**Response (200)**

```json
{
  "sessionId": "uuid",
  "holderProfile": { ... },
  "consistencyChecks": [...],
  "missingDocuments": [...],
  "expiringDocuments": [...],
  "medicalFlags": [...],
  "overallStatus": "VALID",
  "overallScore": 87,
  "summary": "...",
  "recommendations": [...],
  "validatedAt": "..."
}
```

---

#### `GET /api/sessions/:sessionId/report`

Generate a full compliance report for a session.

---

## Document Types

The LLM classifies documents against the following taxonomy:

| Code | Document |
|---|---|
| `COC` | Certificate of Competency |
| `COP_BT` | Certificate of Proficiency — Basic Training |
| `COP_PSCRB` | Proficiency in Survival Craft and Rescue Boats |
| `COP_AFF` | Advanced Fire Fighting |
| `COP_MEFA` | Medical First Aid |
| `COP_MECA` | Medical Care |
| `COP_SSO` | Ship Security Officer |
| `ECDIS_GENERIC` | ECDIS Generic |
| `ECDIS_TYPE` | ECDIS Type-Specific |
| `SIRB` | Seafarer's Identity and Record Book |
| `PASSPORT` | Passport |
| `PEME` | Pre-Employment Medical Examination |
| `DRUG_TEST` | Drug and Alcohol Test |
| `ERM` | Engine Room Management |
| `BRM_SSBT` | Bridge Resource Management |
| `FLAG_STATE` | Flag State Endorsement |
| `OTHER` | Other |

---

## Webhook Callbacks

When `webhookUrl` is provided on an async extraction, the server sends a `POST` to that URL on completion or failure.

**Success payload**

```json
{
  "event": "extraction.completed",
  "jobId": "uuid",
  "sessionId": "uuid",
  "status": "COMPLETE",
  "extractionId": "uuid",
  "result": { ... },
  "completedAt": "..."
}
```

**Failure payload**

```json
{
  "event": "extraction.failed",
  "jobId": "uuid",
  "sessionId": "uuid",
  "status": "FAILED",
  "error": "LLM_ERROR",
  "message": "...",
  "retryable": false,
  "failedAt": "..."
}
```

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| `UNSUPPORTED_FORMAT` | 400 | No file or unsupported MIME type |
| `INVALID_WEBHOOK_URL` | 400 | webhookUrl is not a valid HTTP/HTTPS URL |
| `RATE_LIMITED` | 429 | Exceeded 10 requests/minute |
| `SESSION_NOT_FOUND` | 404 | Session UUID does not exist |
| `INSUFFICIENT_DOCUMENTS` | 400 | Validation requires ≥ 2 documents |
| `LLM_ERROR` | 422 | Gemini API returned an error |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Project Structure

```
src/
├── controllers/      # Request handlers
├── db/
│   ├── migrations/   # SQL migration files
│   └── index.ts      # pg pool
├── helpers/
│   ├── llmCommands.ts  # Gemini prompt templates
│   └── queue.ts        # BullMQ setup and worker
├── middlewares/      # Multer, rate limiter
├── repositories/     # DB queries (session, extraction, job, validation)
├── routes/           # Express routers
├── services/         # Business logic (extraction, validation, report, webhook)
├── types/            # TypeScript types
├── utils/            # Redis / BullMQ config
└── server.ts         # App entry point
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with nodemon |
| `npm run build` | Compile with SWC |
| `npm start` | Run compiled build |
| `npm run migrate` | Run database migrations |
