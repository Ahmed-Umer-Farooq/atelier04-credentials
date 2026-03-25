# Atelier04 — Digital Credential & Badge System

Standalone backend module for issuing EU-recognized digital credentials (EDC) and badges to course participants.

---

## Requirements

- Node.js 18+
- PostgreSQL 14+ (database: `atelier04`)
- Redis 5+ (recommended 6.2+)

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` with your values. Note: if your PostgreSQL password contains `@`, encode it as `%40` in the URL.

### 3. Push database schema
```bash
npx prisma db push
```

### 4. Generate Prisma client
```bash
npx prisma generate
```

---

## Running

Two processes must run simultaneously — open two terminals:

**Terminal 1 — API server:**
```bash
npm run dev        # development
npm run start      # production (after npm run build)
```

**Terminal 2 — Background workers:**
```bash
npm run workers
```

---

## API Reference

All endpoints require:
```
Authorization: Bearer {API_KEY}
```

---

### POST /api/v1/credentials/issue

Issue a digital credential when a participant completes a course.

**Request:**
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

**Response 202 — Accepted:**
```json
{
  "status": "accepted",
  "credential_id": "A04-2026-0001",
  "current_status": "requested",
  "status_check_url": "/api/v1/credentials/A04-2026-0001/status"
}
```

**Response 200 — Duplicate (idempotency_key already exists):**
Returns existing credential data. Safe to retry.

**Validation errors → 422. Missing/wrong API key → 401.**

---

### GET /api/v1/credentials/{credential_id}/status

Poll for processing status and retrieve outputs.

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

**Statuses:** `requested` → `processing` → `completed` / `failed`

---

## Processing Pipeline

When a credential is issued, it goes through 4 background jobs automatically:

```
Job 1 (validate)       — validates data, sets status: PROCESSING
Job 2 (edc_issue)      — builds EDCI XML, signs with eSeal, submits to Europass wallet
Job 3 (badge_generate) — generates SVG + PNG badge, saves to /public/badges/
Job 4 (complete)       — sets status: COMPLETED, writes audit log
```

Each job retries 3 times with 10s delay on failure. If all retries exhausted → status: `failed`.

---

## Pending Integrations (client to provide)

| Item | Status | Notes |
|------|--------|-------|
| eSeal `.p12` file | ⏳ Pending | Set `ESEAL_P12_PATH` + `ESEAL_P12_PASSWORD` in `.env`. Currently mock. |
| Europass EDCI registration | ⏳ Pending | Replace `submitToWallet()` in `lib/europass/submitToWallet.ts` |
| Badge design files | ⏳ Pending | Replace `lib/badge/generateSVG.ts` with designer assets |

---

## Running Tests

With both `npm run dev` and `npm run workers` running:

```bash
npx tsx tests/e2e.test.ts
```

Tests cover: auth, validation, full pipeline, duplicate prevention, badge file generation, 404 handling.

---

## File Structure

```
app/api/v1/credentials/
  issue/route.ts          — POST endpoint
  [id]/status/route.ts    — GET status endpoint
lib/
  auth/validateApiKey.ts  — Bearer token auth
  db/prisma.ts            — Prisma singleton
  queue/
    index.ts              — BullMQ queues + Redis
    failureHandler.ts     — Marks FAILED on exhausted retries
    workers/
      validate.worker.ts
      edc.worker.ts
      badge.worker.ts
      complete.worker.ts
  europass/
    buildXML.ts           — EDCI XML builder
    signXML.ts            — eSeal signing (mock)
    submitToWallet.ts     — Europass API (mock)
  badge/
    generateSVG.ts        — SVG badge generator
    generatePNG.ts        — SVG → PNG via Sharp
workers/
  start.ts                — Starts all 4 workers
prisma/
  schema.prisma           — Database schema
```
