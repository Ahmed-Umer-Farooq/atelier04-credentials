# Atelier04 Credentials — Project Progress

## Project
- **Name:** atelier04-credentials
- **Stack:** Next.js 16.2.1, TypeScript, Prisma v7, PostgreSQL, Redis (ioredis), BullMQ v4, Sharp, qrcode, node-forge, Zod
- **Path:** `c:\Users\PMLS\Desktop\altier project\atelier04-credentials`
- **Repo:** https://github.com/Ahmed-Umer-Farooq/atelier04-credentials

---

## ✅ All Steps Complete

### Step 1 — Project Setup ✅
- Next.js 16.2.1 bootstrapped with Turbopack
- Dependencies installed, `resend` removed (client handles emails)

### Step 2 — Environment Variables ✅
- `.env` configured with all values
- `.env.example` written with comments for client developer

### Step 3 — Prisma v7 Configuration ✅
- `prisma-client` provider, output `../app/generated/prisma`
- `prisma.config.ts` — url only, no adapter
- PrismaClient uses `PrismaPg` adapter in constructor

### Step 4 — Database Schema ✅
- `Credential` + `AuditLog` tables
- `CredentialStatus` enum: REQUESTED, PROCESSING, COMPLETED, FAILED
- Pushed via `npx prisma db push`

### Step 5 — Connection Verification ✅
- `instrumentation.ts` — logs DB + Redis on startup (no credentials exposed)
- `app/api/health/route.ts` — health check endpoint

### Step 6 — Auth ✅
- `lib/auth/validateApiKey.ts` — Bearer token validation

### Step 7 — POST /api/v1/credentials/issue ✅
- Zod validation, idempotency, credential ID generation, 202 response

### Step 8 — BullMQ Queue Setup ✅
- 4 separate queues: `validate`, `edc_issue`, `badge_generate`, `complete`
- Each queue + worker has its own Redis connection
- BullMQ v4 (Redis 5.x compatible)

### Step 9 — 4 BullMQ Workers ✅
- validate → edc → badge → complete pipeline
- `failureHandler.ts` — FAILED status + AuditLog on exhausted retries

### Step 10 — GET /api/v1/credentials/{id}/status ✅
- Returns all outputs + LinkedIn fields when COMPLETED

### Steps 11–13 — Europass (mocked) ✅
- `signXML.ts` — mock, returns unsigned XML
- `buildXML.ts` — EDCI XML builder
- `submitToWallet.ts` — mock, returns fake viewerURL

### Step 14 — Badge Generation ✅
- `generateSVG.ts` — placeholder SVG with QR code (bottom-right, links to verification URL)
- `generatePNG.ts` — SVG → PNG via Sharp
- XML-escaped text fields (handles `&` in course titles)

### Step 15 — workers/start.ts ✅
- Starts all 4 workers with active/completed/failed logging
- Graceful SIGTERM shutdown

### Step 16 — End-to-End Tests ✅ ALL 13 PASSED

| Test | Result |
|------|--------|
| Wrong API key → 401 | ✅ |
| Missing fields → 422 | ✅ |
| Valid POST → 202 + credential_id | ✅ |
| Duplicate idempotency_key → 200 | ✅ |
| Pipeline completes in ~1s | ✅ |
| badge_png_url, badge_svg_url present | ✅ |
| verification_url, edc_share_url present | ✅ |
| LinkedIn fields present | ✅ |
| Unknown credential → 404 | ✅ |
| SVG + PNG files served | ✅ |

### Step 17 — README.md + .env.example ✅
- Full setup guide for client's developer
- Environment variable reference table
- API reference with request/response examples
- Pending integrations table (eSeal, Europass, badge design)

### Step 18 — GitHub Actions CI/CD ✅
- `.github/workflows/ci.yml`
- Triggers on push + PR to `main`
- Steps: install → prisma generate → type check → lint → build

### Database Cleanup ✅
- A04-2026-0001, 0002, 0003 reset to FAILED with audit log
- `scripts/reset-failed.ts` utility kept for future use

---

## Pending (awaiting client)

| Item | File | Notes |
|------|------|-------|
| eSeal `.p12` file | `lib/europass/signXML.ts` | Replace mock with node-forge signing |
| Europass EDCI registration | `lib/europass/submitToWallet.ts` | Replace mock with real API call |
| Badge design files | `lib/badge/generateSVG.ts` | Replace placeholder with designer SVG |

---

## Important Technical Notes
- Prisma v7 — `prisma-client` provider, output path required, no `url` in schema
- Prisma v7 — PrismaClient needs `adapter: new PrismaPg(...)` in constructor
- PostgreSQL password `.@` → encode as `.%40` in DATABASE_URL
- BullMQ v4 required — v5 needs Redis 6.2+, client has Redis 5.0.14
- Each BullMQ Queue + Worker needs its own Redis connection instance
- 4 separate queues (not one shared queue with job.name filtering)
- SVG text must be XML-escaped before passing to Sharp

---

## Resume Instructions
Start new chat with:
> "Continue atelier04-credentials project. Read PROJECT_CONTEXT.md and PROGRESS.md."
