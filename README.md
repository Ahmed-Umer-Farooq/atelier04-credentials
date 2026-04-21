# Atelier04 — Digital Credential & Badge System

Standalone backend module for issuing EU-recognized digital credentials and open badges to course participants.

---

## Overview

When a participant completes a course, your system calls our API. We handle:
- Generating a unique credential ID (`A04-2026-0001`)
- Building and signing an EDCI XML document with a qualified eSeal (A-Trust, eIDAS)
- Building and signing a W3C Verifiable Credential (JSON-LD)
- Generating an SVG + PNG badge with QR code
- Hosting a public verification page at `atelier04.at/credentials/{id}`
- Returning badge URLs, verification URL, and LinkedIn fields

Your system stores the returned data and sends the email to the participant.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| PostgreSQL | 14+ |
| Redis | 5+ (6.2+ recommended) |

---

## First-Time Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. See [Environment Variables](#environment-variables) below.

> **Note:** If your PostgreSQL password contains `@`, encode it as `%40` in the URL.

### 3. Create the database

```sql
CREATE DATABASE atelier04;
```

### 4. Push database schema

```bash
npx prisma db push
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

---

## Running

Two processes must run simultaneously. Open two terminals:

**Terminal 1 — API server:**
```bash
npm run dev       # development (with hot reload)
npm run build     # build for production
npm run start     # production server
```

**Terminal 2 — Background workers:**
```bash
npm run workers
```

On startup you should see:
```
✅ Database connected: postgresql://localhost:5432/atelier04
✅ Redis connected: redis://localhost:6379
```

---

## API Reference

All endpoints require:
```
Authorization: Bearer {API_KEY}
```

---

### POST /api/v1/credentials/issue

Call this when a participant completes a course.

**Request body:**
```json
{
  "idempotency_key": "YOUR-INTERNAL-COMPLETION-ID",
  "participant": {
    "full_name": "Anna Müller",
    "email": "anna.mueller@email.com"
  },
  "course": {
    "course_code": "REVIT-ADV-2026",
    "course_title": "Revit Advanced — Architecture & MEP",
    "duration_hours": 40,
    "completion_date": "2026-03-15",
    "result": "Pass"
  }
}
```

**Response 202 — Accepted (new credential):**
```json
{
  "status": "accepted",
  "credential_id": "A04-2026-0001",
  "current_status": "requested",
  "status_check_url": "/api/v1/credentials/A04-2026-0001/status"
}
```

**Response 200 — Already exists (same idempotency_key):**
Returns existing credential data. Safe to retry on network failure.

| Status code | Meaning |
|-------------|---------|
| 202 | Accepted — processing started |
| 200 | Duplicate — already issued |
| 401 | Missing or wrong API key |
| 422 | Validation error — check `details` field |

---

### GET /api/v1/credentials/{credential_id}/status

Poll this endpoint to check processing status and retrieve outputs.

**Recommended polling:** every 2 seconds, up to 30 seconds.

**Response when completed:**
```json
{
  "credential_id": "A04-2026-0001",
  "status": "completed",
  "badge_png_url": "https://your-domain.com/badges/A04-2026-0001.png",
  "badge_svg_url": "https://your-domain.com/badges/A04-2026-0001.svg",
  "verification_url": "https://atelier04.at/credentials/A04-2026-0001",
  "edc_share_url": "https://europass.europa.eu/share/abc123",
  "linkedin": {
    "name": "Revit Advanced — European Digital Credential",
    "organization": "Atelier04 ESKE GmbH",
    "issue_date": "2026-03",
    "credential_id": "A04-2026-0001",
    "credential_url": "https://atelier04.at/credentials/A04-2026-0001"
  },
  "updated_at": "2026-03-15T14:45:00Z"
}
```

| Status | Meaning |
|--------|---------|
| `requested` | Received, queued for processing |
| `processing` | Pipeline running |
| `completed` | All outputs ready |
| `failed` | Processing failed after 3 retries |

---

### GET /credentials/{id}

Public verification page for a credential. No authentication required.

- Shows credential details (participant, course, issuer)
- Verifies the JSON-LD digital signature
- Displays verification status: **Verified**, **Pending**, or **Invalid**
- Includes raw JSON-LD credential for independent verification

---

### GET /api/health

Returns database and Redis connection status. No authentication required.

---

## Processing Pipeline

After a credential is issued, 4 background jobs run automatically:

```
Job 1 — validate        REQUESTED → PROCESSING
Job 2 — edc_issue       Build EDCI XML → Sign with eSeal (RSA-SHA256)
                        Build JSON-LD VC → Sign with eSeal (RsaSignature2018)
                        Submit to Europass wallet
Job 3 — badge_generate  Generate SVG + PNG badge with QR code (Puppeteer, 6x HD)
Job 4 — complete        PROCESSING → COMPLETED, write audit log
```

Each job retries 3 times with a 10-second delay. After 3 failures → status: `failed`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `API_KEY` | ✅ | Bearer token for API auth (min 32 chars) |
| `BASE_URL` | ✅ | Your server's public URL (for badge URLs) |
| `ATELIER04_VERIFICATION_BASE` | ✅ | Base URL for credential verification pages |
| `EUROPASS_WALLET_URL` | ✅ | Europass EDCI wallet API endpoint |
| `ATRUST_API_URL` | ✅ | A-Trust eSeal API URL |
| `ATRUST_P12_PATH` | ✅ | Path to eSeal `.p12` certificate file |
| `ATRUST_P12_PASSWORD` | ✅ | Password for the `.p12` file |

---

## Pending Integrations

| Item | File | Status |
|------|------|--------|
| Europass wallet submission | `lib/europass/submitToWallet.ts` | ⏳ Awaiting Europass EDCI issuer registration |

Everything else is fully implemented and production-ready.

---

## Running Tests

With both `npm run dev` and `npm run workers` running:

```bash
npm run test:e2e
```

or directly:

```bash
npx tsx tests/e2e.test.ts
```

**60 tests covering:**
- Health check (DB + Redis)
- Authentication (401 on wrong/missing/empty key)
- Input validation (7 invalid payloads → 422, malformed JSON → 400)
- Full pipeline: REQUESTED → PROCESSING → COMPLETED
- All output fields (badge URLs, verification URL, LinkedIn fields)
- Idempotency (duplicate prevention, retry safety)
- Badge SVG + PNG served over HTTP (content-type, file size)
- JSON-LD Verifiable Credential + verification page
- eSeal XML signing (edc_share_url present)
- Verification page edge cases (404 on unknown, publicly accessible)
- Concurrent requests

---

## File Structure

```
app/
  api/v1/credentials/
    issue/route.ts              POST — issue credential
    [id]/status/route.ts        GET  — check status
  api/health/route.ts           GET  — health check (no auth)
  credentials/[id]/page.tsx     GET  — public verification page
lib/
  auth/validateApiKey.ts        Bearer token validation
  db/prisma.ts                  Prisma client singleton
  credentials/
    buildJsonLD.ts              W3C Verifiable Credential builder
    signJsonLD.ts               JSON-LD eSeal signing + verification
  queue/
    index.ts                    BullMQ queues + Redis connections
    failureHandler.ts           Marks FAILED on exhausted retries
    workers/
      validate.worker.ts        Job 1
      edc.worker.ts             Job 2
      badge.worker.ts           Job 3
      complete.worker.ts        Job 4
  europass/
    buildXML.ts                 EDCI XML builder
    signXML.ts                  eSeal XML signing (RSA-SHA256, node-forge)
    submitToWallet.ts           Europass wallet API (⏳ mock — awaiting registration)
  badge/
    generateSVG.ts              SVG badge from master template + QR code
    generatePNG.ts              SVG → PNG via Puppeteer (6x HD)
workers/
  start.ts                      Starts all 4 workers
prisma/
  schema.prisma                 Database schema
tests/
  e2e.test.ts                   End-to-end test suite (60 tests)
public/
  badges/                       Generated badge files (SVG + PNG)
  fonts/                        Bornia + Figtree font files
```

---

## Security

| Measure | Implementation |
|---------|---------------|
| API authentication | Bearer token on all endpoints, 401 on failure |
| Input validation | Zod schema — strict types, email, date, positive integers |
| Idempotency | Unique `idempotency_key` — safe to retry, no duplicates |
| eSeal signing | RSA-SHA256 with A-Trust qualified certificate (eIDAS, valid 2026–2031) |
| JSON-LD signing | RsaSignature2018, detached JWS — tamper detection on every credential |
| Secrets | `.env` and `.p12` excluded from Git via `.gitignore` |
| Audit log | Every status change recorded in `AuditLog` table — immutable |
