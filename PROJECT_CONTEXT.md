# ATELIER04 — Digital Credential & Badge System
## Project Context for Amazon Q

> Read this entire file before writing any code. This is the full project context including what the client wants, what we agreed to build, the API spec, architecture decisions, and important constraints. Do not over-engineer. Do not add features not listed here.

---

## WHO IS THE CLIENT

**Atelier04 ESKE GmbH** — an Austrian education provider (Vienna). They run training courses (Revit, 3ds Max, Unreal Engine etc.) and want to issue EU-recognized digital credentials (EDC) to participants who complete courses.

---

## WHAT HAPPENED — PROJECT HISTORY

1. Client originally asked for 3 pages on their existing website
2. After discussion, scope changed to a **fully standalone backend module**
3. Client confirmed via email they want a **modular MVP** — lean, no overengineering
4. We sent them: Scope Change Notice, API Requirements doc, Technical Architecture doc, Timeline & Pricing

---

## WHAT THE CLIENT CONFIRMED (his exact words)

- His system remains the **source of truth** for participant and course data
- His system **detects course completion** and calls our API
- His system **stores** the credential data we return
- His system **sends the email** to the participant — NOT us
- Our module handles: EDC creation, eSeal signing, badge generation, verification page
- Our module returns: credential_id, badge URLs, verification_url, edc_share_url, LinkedIn fields
- **Hosted on Atelier04 infrastructure** — they own the server, we deliver the code
- **Full source code ownership** — no vendor lock-in
- **MVP first** — semi-automated EDC is fine, no overengineering

---

## WHAT WE ARE BUILDING

A standalone Next.js backend module. NOT a full web app with frontend. Backend API only for MVP.

---

## TECH STACK — USE EXACTLY THIS, NOTHING ELSE

```
Framework:      Next.js (App Router) with TypeScript
Database:       PostgreSQL with Prisma ORM
Queue:          Redis + BullMQ
XML Signing:    node-forge (.p12 eSeal)
Badge:          Sharp (SVG to PNG conversion)
Auth:           Bearer token API key
Runtime:        Node.js 18+
```

**Do NOT add:**
- Docker (not confirmed by client)
- Any frontend/UI pages
- Email sending (client handles this)
- Any auth system beyond Bearer token
- Any cloud services (AWS, Vercel, etc.)
- Any features not listed in this document

---

## FILE STRUCTURE — BUILD EXACTLY THIS

```
atelier04-credentials/
├── app/
│   └── api/
│       └── v1/
│           └── credentials/
│               ├── issue/
│               │   └── route.ts          ← POST endpoint
│               └── [id]/
│                   └── status/
│                       └── route.ts      ← GET status endpoint
├── lib/
│   ├── queue/
│   │   ├── index.ts                      ← BullMQ + Redis connection
│   │   └── workers/
│   │       ├── validate.worker.ts        ← Job 1: validate data
│   │       ├── edc.worker.ts             ← Job 2: sign XML + Europass
│   │       ├── badge.worker.ts           ← Job 3: generate badge
│   │       └── complete.worker.ts        ← Job 4: mark completed
│   ├── europass/
│   │   ├── buildXML.ts                   ← Build EDCI XML
│   │   ├── signXML.ts                    ← Sign with .p12 (node-forge)
│   │   └── submitToWallet.ts             ← POST to Europass API
│   ├── badge/
│   │   ├── generateSVG.ts                ← SVG badge
│   │   └── generatePNG.ts                ← Convert to PNG (Sharp)
│   ├── db/
│   │   └── prisma.ts                     ← Prisma client singleton
│   └── auth/
│       └── validateApiKey.ts             ← Bearer token check
├── prisma/
│   └── schema.prisma                     ← Database schema
├── workers/
│   └── start.ts                          ← Start all BullMQ workers
├── .env                                  ← Environment variables
├── .env.example                          ← Template for client
└── README.md                             ← Setup and deployment guide
```

---

## DATABASE SCHEMA (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Credential {
  id                String           @id @default(cuid())
  credential_id     String           @unique
  idempotency_key   String           @unique
  status            CredentialStatus @default(REQUESTED)
  participant_name  String
  participant_email String
  date_of_birth     String?
  course_code       String
  course_title      String
  duration_hours    Int
  completion_date   String
  result            String?
  organization      String
  country           String
  edc_share_url     String?
  edc_uuid          String?
  badge_svg_url     String?
  badge_png_url     String?
  verification_url  String?
  created_at        DateTime         @default(now())
  updated_at        DateTime         @updatedAt
  audit_logs        AuditLog[]
}

model AuditLog {
  id            String     @id @default(cuid())
  credential_id String
  credential    Credential @relation(fields: [credential_id], references: [id])
  from_status   String
  to_status     String
  reason        String?
  created_at    DateTime   @default(now())
}

enum CredentialStatus {
  REQUESTED
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## THE TWO API ENDPOINTS

### POST /api/v1/credentials/issue

Called by Atelier04 web app when a student completes a course.

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

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "credential_id": "A04-2026-0042",
  "current_status": "requested",
  "status_check_url": "/api/v1/credentials/A04-2026-0042/status"
}
```

**Validation rules:**
- idempotency_key: required, must be unique
- participant.full_name: required, min 2 chars
- participant.email: required, valid email format
- course.course_code: required
- course.course_title: required
- course.duration_hours: required, positive integer
- course.completion_date: required, format YYYY-MM-DD
- course.result: optional

**Duplicate handling:**
- If idempotency_key already exists → return 200 with existing credential data, do NOT create new record

---

### GET /api/v1/credentials/{credential_id}/status

Called by Atelier04 to check processing status and retrieve outputs.

**Response when completed:**
```json
{
  "credential_id": "A04-2026-0042",
  "status": "completed",
  "badge_png_url": "https://server/badges/A04-2026-0042.png",
  "badge_svg_url": "https://server/badges/A04-2026-0042.svg",
  "verification_url": "https://atelier04.at/credentials/A04-2026-0042",
  "edc_share_url": "https://europass.europa.eu/share/abc123",
  "linkedin": {
    "name": "Revit Advanced — European Digital Credential",
    "organization": "Atelier04 ESKE GmbH",
    "issue_date": "2026-03",
    "credential_id": "A04-2026-0042",
    "credential_url": "https://atelier04.at/credentials/A04-2026-0042"
  },
  "updated_at": "2026-03-15T14:45:00Z"
}
```

---

## BULLMQ PIPELINE — 4 JOBS IN ORDER

When POST is received:
1. Validate immediately (sync)
2. Save to DB with status REQUESTED
3. Return 202 immediately
4. Enqueue Job 1

```
Job 1 — VALIDATE
  Validate all fields
  Generate credential_id (A04-{YEAR}-{SEQUENCE})
  Status: REQUESTED → PROCESSING
  On success: enqueue Job 2

Job 2 — EDC_ISSUE
  Build EDCI XML from credential data
  Sign XML with .p12 eSeal using node-forge
  POST to Europass: https://europass.europa.eu/edci-wallet/api/v1/wallets/email/{email}/credentials
  Body: multipart/form-data, key: _credentialXML, value: signed XML
  Receive: { uuid, viewerURL }
  Store viewerURL + uuid in DB
  NOTE: .p12 not available yet — use mock/placeholder signXML() function for now
  On success: enqueue Job 3

Job 3 — BADGE_GENERATE
  Generate SVG badge with: Atelier04 logo placeholder, course name, credential ID, year, QR code
  Convert SVG to PNG using Sharp
  Store badge file paths / URLs in DB
  NOTE: real design files coming from client — use placeholder branding for now
  On success: enqueue Job 4

Job 4 — COMPLETE
  Update status: PROCESSING → COMPLETED
  Write AuditLog entry
  All outputs now available via status endpoint
```

**BullMQ retry config:**
```typescript
{
  attempts: 3,
  backoff: {
    type: 'fixed',
    delay: 10000  // retry after 10 seconds
  },
  removeOnComplete: false,
  removeOnFail: false
}
```

If all retries exhausted → status = FAILED, write AuditLog with reason.

---

## AUTHENTICATION

Every request must include:
```
Authorization: Bearer {API_KEY}
```

- Validate in middleware before hitting any route
- Return 401 if missing or wrong
- API key stored in .env as API_KEY

---

## CREDENTIAL ID FORMAT

```
A04-{YEAR}-{4-digit-sequence}
Example: A04-2026-0001, A04-2026-0002
```

Use atomic DB transaction to prevent race conditions when generating sequence number.

---

## EUROPASS WALLET API

```
METHOD: POST
URL: https://europass.europa.eu/edci-wallet/api/v1/wallets/email/{email}/credentials
BODY: multipart/form-data
  KEY: _credentialXML
  VALUE: signed XML file (signed with .p12 eSeal)
RETURNS: { uuid, viewerURL }
```

Store viewerURL as edc_share_url in database permanently.

**IMPORTANT: eSeal .p12 file is NOT available yet. Build a mock signXML() function that returns unsigned XML for now. Real signing will be added when client provides .p12 file. Do NOT block development on this.**

---

## ENVIRONMENT VARIABLES

```env
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/atelier04"
REDIS_URL="redis://localhost:6379"
API_KEY="atelier04-secret-api-key-minimum-32-chars"
ESEAL_P12_PATH=""
ESEAL_P12_PASSWORD=""
EUROPASS_WALLET_URL="https://europass.europa.eu/edci-wallet/api/v1/wallets/email"
BASE_URL="http://localhost:3000"
ATELIER04_VERIFICATION_BASE="https://atelier04.at/credentials"
```

---

## SECURITY RULES

- All endpoints protected by Bearer token — 401 if missing
- Rate limiting on POST endpoint — 100 req/min max
- eSeal .p12 file path in env var only — never in code
- API key never logged
- Credentials never deleted — status changes only
- Credential IDs not sequential in any public-facing way

---

## IMPORTANT CONSTRAINTS — READ CAREFULLY

1. **No email sending** — client handles all emails. Our system returns data only.
2. **No frontend/UI** — backend API only for MVP.
3. **No Docker** — not confirmed by client. Simple Node.js deployment only.
4. **No cloud services** — client hosts on their own server.
5. **eSeal is a placeholder** — build mock signXML() now, real one comes later.
6. **Badge design is placeholder** — client's designer will provide files later.
7. **Workers run separately** — BullMQ workers start with `npx ts-node workers/start.ts`
8. **4 statuses only for MVP** — REQUESTED, PROCESSING, COMPLETED, FAILED. Not 8.
9. **Verification page** — this is a simple GET endpoint that returns credential data as JSON. Client's website renders the actual page.
10. **No admin UI** — skip admin dashboard for MVP.

---

## LOCAL DEVELOPMENT SETUP

Developer machine has:
- Windows OS
- PostgreSQL installed locally (port 5432, database: atelier04)
- Redis installed locally (port 6379)
- Node.js 18+

No servers, no cloud, no Docker — everything runs on localhost for now.

---

## BUILD ORDER

Build strictly in this order:

1. `npx create-next-app@latest atelier04-credentials --typescript`
2. Install dependencies: `npm install prisma @prisma/client bullmq ioredis node-forge sharp zod`
3. Set up `.env` file
4. Set up `prisma/schema.prisma` — copy schema from this doc
5. Run `npx prisma db push` to create tables
6. Build `lib/auth/validateApiKey.ts`
7. Build `POST /api/v1/credentials/issue` route
8. Build `lib/queue/index.ts` — Redis + BullMQ setup
9. Build the 4 workers
10. Build `GET /api/v1/credentials/{id}/status` route
11. Build mock `lib/europass/signXML.ts`
12. Build `lib/europass/buildXML.ts`
13. Build `lib/europass/submitToWallet.ts`
14. Build `lib/badge/generateSVG.ts` and `generatePNG.ts`
15. Build `workers/start.ts`
16. Test full flow end to end
17. Write `README.md` and `.env.example`

---

## DOCUMENTS SENT TO CLIENT

The following documents were prepared and sent/ready to send:

1. **Scope Change Notice** — documents that original scope was 3 pages on their website, revised scope is a standalone backend system. Sent. Waiting for approval.

2. **API Requirements MVP** — defines the two endpoints, request/response format, field definitions, 4-stage status lifecycle, duplicate prevention, what we need from them (eSeal, Europass registration, badge files, server access).

3. **Technical Architecture MVP** — system diagram, component overview, tech stack table, processing flow, infrastructure requirements, data ownership and portability, security, MVP vs future phases.

4. **Timeline & Pricing MVP** — 4 milestones over 4 weeks, total €1,800. M1: €450, M2: €500, M3: €450, M4: €400. Payment on delivery of each milestone.

---

## WHAT CLIENT STILL NEEDS TO PROVIDE

Before full testing is possible:
- Qualified eSeal (.p12 file + password)
- Europass EDCI issuer registration
- Badge design files from their designer
- Verification page base URL confirmation
- Server access / deployment details

---

*Last updated: March 2026*
