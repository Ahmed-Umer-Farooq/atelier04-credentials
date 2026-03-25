# Atelier04 Credentials — Project Progress

## Project
- **Name:** atelier04-credentials
- **Stack:** Next.js 16.2.1, TypeScript, Prisma v7, PostgreSQL, Redis (ioredis), BullMQ v4, Sharp, node-forge, Zod
- **Path:** `c:\Users\PMLS\Desktop\altier project\atelier04-credentials`

---

## ✅ Completed Steps

### Step 1 — Project Setup
- Next.js 16.2.1 bootstrapped with Turbopack
- Dependencies: `@prisma/client`, `prisma`, `ioredis`, `bullmq@4`, `zod`, `sharp`, `node-forge`, `@prisma/adapter-pg`, `pg`
- `resend` uninstalled — client handles all emails

### Step 2 — Environment Variables
- `.env` created:
  - `DATABASE_URL` — PostgreSQL (password `@` encoded as `%40`)
  - `REDIS_URL` — redis://localhost:6379
  - `API_KEY`, `BASE_URL`, `ATELIER04_VERIFICATION_BASE`
  - `ESEAL_P12_PATH`, `ESEAL_P12_PASSWORD` (empty — client provides later)
  - `EUROPASS_WALLET_URL`

### Step 3 — Prisma v7 Configuration
- `prisma/schema.prisma` — `prisma-client` provider, output `../app/generated/prisma`, NO `url` in datasource
- `prisma.config.ts` — `url` only (adapter is for PrismaClient constructor only)
- Prisma client generated to `app/generated/prisma/`

### Step 4 — Database Schema ✅
- `Credential` + `AuditLog` tables
- `CredentialStatus` enum: REQUESTED, PROCESSING, COMPLETED, FAILED
- Pushed via `npx prisma db push` ✅

### Step 5 — Connection Verification ✅
- `instrumentation.ts` — logs DB + Redis on startup (no password exposed)
- `app/api/health/route.ts` — browser health check
- `check-connections.ts` — terminal test script

### Step 6 — Auth ✅
- `lib/auth/validateApiKey.ts` — Bearer token check against `API_KEY` env var

### Step 7 — POST /api/v1/credentials/issue ✅
- Zod validation (all fields per spec)
- Idempotency check — returns 200 with existing data if key exists
- Credential ID: `A04-{YEAR}-{4-digit-sequence}`
- Saves to DB with status REQUESTED
- Enqueues to `validate` queue
- Returns 202 Accepted

### Step 8 — BullMQ Queue Setup ✅
- `lib/queue/index.ts` — 4 separate queues (one per job type)
- `validateQueue`, `edcQueue`, `badgeQueue`, `completeQueue`
- Each queue + worker has its own Redis connection (required by BullMQ)
- BullMQ downgraded to v4 — Redis 5.x compatibility

### Step 9 — 4 BullMQ Workers ✅
- `validate.worker.ts` — queue: `validate` — REQUESTED → PROCESSING, enqueues edc_issue
- `edc.worker.ts` — queue: `edc_issue` — builds XML, signs (mock), submits (mock), enqueues badge_generate
- `badge.worker.ts` — queue: `badge_generate` — generates SVG+PNG, enqueues complete
- `complete.worker.ts` — queue: `complete` — PROCESSING → COMPLETED, writes AuditLog
- `lib/queue/failureHandler.ts` — marks FAILED + AuditLog on exhausted retries

### Step 10 — GET /api/v1/credentials/{id}/status ✅
- Returns status + all outputs when COMPLETED
- Returns LinkedIn fields when COMPLETED
- 404 if not found

### Step 11 — Mock signXML ✅
- `lib/europass/signXML.ts` — returns unsigned XML (mock until client provides .p12)

### Step 12 — buildXML ✅
- `lib/europass/buildXML.ts` — builds EDCI XML from credential data

### Step 13 — Mock submitToWallet ✅
- `lib/europass/submitToWallet.ts` — returns fake uuid + viewerURL

### Step 14 — Badge Generation ✅
- `lib/badge/generateSVG.ts` — placeholder SVG, XML-escaped text fields
- `lib/badge/generatePNG.ts` — SVG → PNG via Sharp, saved to `public/badges/`

### Step 15 — workers/start.ts ✅
- Starts all 4 workers with logging
- Attaches failure handler to each
- Run with: `npm run workers`

### Step 16 — End-to-End Tests ✅ ALL PASSED

| Test | Result |
|------|--------|
| Wrong API key → 401 | ✅ PASS |
| Missing fields → 422 | ✅ PASS |
| Valid POST → 202 + credential_id | ✅ PASS |
| Duplicate idempotency_key → 200 | ✅ PASS |
| Pipeline: REQUESTED → PROCESSING → COMPLETED (1s) | ✅ PASS |
| badge_png_url present | ✅ PASS |
| badge_svg_url present | ✅ PASS |
| verification_url present | ✅ PASS |
| edc_share_url present | ✅ PASS |
| LinkedIn fields present | ✅ PASS |
| Unknown credential → 404 | ✅ PASS |
| SVG file served at /badges/{id}.svg | ✅ PASS |
| PNG file served at /badges/{id}.png | ✅ PASS |

---

## 🔲 Pending Steps

- [ ] Step 17 — Write `README.md` and `.env.example`
- [ ] Final — GitHub Actions CI/CD (after MVP complete)

---

## Important Notes
- Prisma v7 — `prisma-client` provider, output path required
- Prisma v7 — NO `url` in schema, NO `adapter` in prisma.config.ts
- Prisma v7 — PrismaClient needs `adapter: new PrismaPg(...)` in constructor
- PostgreSQL password `.@` → encoded as `.%40` in DATABASE_URL
- BullMQ v4 required — v5 needs Redis 6.2+, client has Redis 5.0.14
- Each BullMQ Queue + Worker needs its own Redis connection instance
- 4 separate queues: validate, edc_issue, badge_generate, complete
- SVG text must be XML-escaped (& → &amp; etc.) before passing to Sharp
- Badge files saved to: `public/badges/{credential_id}.svg/.png`
- All mocks clearly marked for client handover

---

## Resume Instructions
Start new chat with:
> "Continue atelier04-credentials project. Read PROJECT_CONTEXT.md and PROGRESS.md."
