# Required codebase updates

Apply the items below when aligning your branch with the target architecture (Prisma 7 default client, CLI config in `prisma.config.ts`, safe instrumentation, versioned badge template). Work through each section and reconcile conflicts against `main` as needed.

---

## 1. Prisma client location and imports

**Requirements**

- Do **not** commit a generated Prisma client under `app/generated/prisma/` or any custom `output` path inside the repo.
- In **`prisma/schema.prisma`**:
  - Use `generator client { provider = "prisma-client-js" }`.
  - Omit any `output = "..."` line (default npm client location).
  - Under `datasource db`, include **only** `provider = "postgresql"`. Do **not** add `url = env("DATABASE_URL")` here — Prisma 7 expects the URL in **`prisma.config.ts`** (see section 2).
- Configure the database URL **only** in **`prisma.config.ts`** for Migrate / CLI usage.

**Imports**

Replace every `PrismaClient` import with:

```ts
import { PrismaClient } from "@prisma/client";
```

Search the tree for paths such as `app/generated/prisma`, `generated/prisma/client`, or custom generator paths and update **`lib/db/prisma.ts`**, **`app/api/health/route.ts`**, **`tests/e2e.test.ts`**, and any other matching files.

---

## 2. `prisma.config.ts` and CLI env loading

**Requirements**

- Add **`prisma.config.ts`** at the repo root (if missing) with:
  - `import "dotenv/config";` at the top so `npx prisma migrate`, `db push`, and `generate` pick up `.env`.
  - `import { defineConfig, env } from "prisma/config";`
  - `datasource: { url: env("DATABASE_URL") }` — use `env()`, not only raw `process.env` for this config shape.
- List **`dotenv`** explicitly under **`package.json`** `devDependencies`.

---

## 3. `package.json` build script

Set:

```json
"build": "prisma generate && next build"
```

Rationale: without `prisma generate`, CI and fresh clones can fail typecheck or runtime because `@prisma/client` is not generated.

---

## 4. Next.js `instrumentation.ts` (Edge bundle)

**Problem to avoid**

Top-level imports of `PrismaClient`, `@prisma/adapter-pg`, or `ioredis` in **`instrumentation.ts`** pull Node-only code into Edge instrumentation and can **break the build**.

**Requirements**

1. **`instrumentation.ts`** must **not** import Prisma, adapters, or Redis at the top level.
2. **`instrumentation.ts`** should only:
   - Return early when `process.env.NEXT_RUNTIME !== "nodejs"`.
   - Dynamically import a helper, e.g. `await import("@/lib/instrumentation/runStartupChecks")`, then call its exported function.
3. Implement **`lib/instrumentation/runStartupChecks.ts`** with Prisma connection test, Redis ping, and logging — **all** imports of `PrismaClient`, `PrismaPg`, and `ioredis` belong **only** in this file.

Rule: **no** static Prisma/Redis imports in **`instrumentation.ts`**.

---

## 5. Badge SVG (`lib/badge/generateSVG.ts`)

**Requirements**

1. Default template path: **`lib/badge/template.svg`** (committed; placeholders `{{STUDENT_NAME}}`, `{{COURSE_TITLE}}`, `{{COMPLETION_DATE}}`, `{{CREDENTIAL_ID}}`).
2. Implement placeholder replacement; fix `id="{{…}}"`-style ids **before** inserting real names so XML `id` values stay valid.
3. Support optional **`BADGE_TEMPLATE_PATH`**: if set, resolve relative to project root or as an absolute path; otherwise use `lib/badge/template.svg`.
4. Do **not** depend on **`public/badges/Frame1_badge_design.svg`** or **`public/badges/`** for the master template — that area is for generated badge output and may be absent in clones or CI.

Add a short comment block in **`generateSVG.ts`** and document **`BADGE_TEMPLATE_PATH`** in **`.env.example`** (commented).

---

## 6. `.gitignore`

Remove any line that ignores **`/app/generated/prisma`** if the generated client no longer lives there.

---

## 7. `eslint.config.mjs`

Remove **`"app/generated/**"`** from `globalIgnores([...])` if nothing under `app/generated` is tracked.

---

## 8. `README.md` file tree

In the project structure section:

- Include **`prisma.config.ts`** alongside Prisma files.
- Add one line stating that the **connection URL for Migrate/CLI lives in `prisma.config.ts`, not in `schema.prisma`**.

---

## 9. `.env.example`

Add commented lines similar to:

```
# Optional — override badge master SVG (defaults to lib/badge/template.svg).
# BADGE_TEMPLATE_PATH=./custom-badge.svg
```

---

## 10. Verification searches

Run these on your branch and resolve hits until none remain (except intentional comments):

| Search for | Action |
|-------------|--------|
| `app/generated/prisma` | Remove folder if present; use `@prisma/client` imports |
| `generated/prisma/client` | Replace with `@prisma/client` |
| `Frame1_badge_design` | Remove reliance; use `lib/badge/template.svg` + placeholders |
| Top-level `PrismaClient` / `ioredis` in `instrumentation.ts` | Move logic to `lib/instrumentation/runStartupChecks.ts` |

---

## 11. Files checklist

| Action | Path |
|--------|------|
| **Remove** | `app/generated/prisma/` (if it exists — do not commit generated output) |
| **Add** | `lib/instrumentation/runStartupChecks.ts` |
| **Rewrite** | `instrumentation.ts` (thin `register()` + dynamic import only) |
| **Rewrite** | `lib/badge/generateSVG.ts` (template path + placeholders) |
| **Edit** | `lib/db/prisma.ts`, `app/api/health/route.ts`, `tests/e2e.test.ts` imports |
| **Edit** | `prisma/schema.prisma`, `prisma.config.ts`, `package.json`, `eslint.config.mjs`, `.gitignore`, `README.md`, `.env.example` |

Confirm locally with **`npm install`**, **`npx prisma generate`**, and **`npm run build`**.
