/**
 * End-to-end tests for atelier04-credentials API
 * Requires: npm run dev + npm run workers both running
 * Run with: npx tsx tests/e2e.test.ts
 */

import "dotenv/config";

const BASE = "http://localhost:3000";
const API_KEY = process.env.API_KEY!;
const IDEMPOTENCY_KEY = `test-${Date.now()}`;

let credentialId: string;

function auth() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

function pass(name: string) {
  console.log(`  ✅ PASS — ${name}`);
}

function fail(name: string, detail: string) {
  console.error(`  ❌ FAIL — ${name}: ${detail}`);
  process.exitCode = 1;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── TEST 1: Wrong API key → 401 ────────────────────────────────────────────
async function testUnauthorized() {
  const res = await fetch(`${BASE}/api/v1/credentials/issue`, {
    method: "POST",
    headers: { Authorization: "Bearer wrong-key", "Content-Type": "application/json" },
    body: JSON.stringify({ idempotency_key: "x" }),
  });
  res.status === 401
    ? pass("Wrong API key returns 401")
    : fail("Wrong API key returns 401", `Got ${res.status}`);
}

// ─── TEST 2: Missing required fields → 422 ──────────────────────────────────
async function testMissingFields() {
  const res = await fetch(`${BASE}/api/v1/credentials/issue`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ idempotency_key: "missing-fields-test" }),
  });
  res.status === 422
    ? pass("Missing required fields returns 422")
    : fail("Missing required fields returns 422", `Got ${res.status}`);
}

// ─── TEST 3: Valid POST → 202 ────────────────────────────────────────────────
async function testIssueCredential() {
  const res = await fetch(`${BASE}/api/v1/credentials/issue`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      idempotency_key: IDEMPOTENCY_KEY,
      participant: {
        full_name: "Anna Müller",
        email: "anna.mueller@test.com",
      },
      course: {
        course_code: "REVIT-ADV-2026",
        course_title: "Revit Advanced — Architecture & MEP",
        duration_hours: 40,
        completion_date: "2026-03-15",
        result: "Pass",
      },
    }),
  });

  const body = await res.json() as Record<string, unknown>;

  if (res.status !== 202) {
    fail("Valid POST returns 202", `Got ${res.status} — ${JSON.stringify(body)}`);
    return;
  }

  pass("Valid POST returns 202 Accepted");

  if (body.credential_id && body.status === "accepted") {
    pass(`Credential ID generated: ${body.credential_id}`);
    credentialId = body.credential_id as string;
  } else {
    fail("Response has credential_id and status=accepted", JSON.stringify(body));
  }

  body.status_check_url
    ? pass(`status_check_url returned: ${body.status_check_url}`)
    : fail("Response has status_check_url", JSON.stringify(body));
}

// ─── TEST 4: Duplicate idempotency_key → 200 ────────────────────────────────
async function testDuplicate() {
  const res = await fetch(`${BASE}/api/v1/credentials/issue`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      idempotency_key: IDEMPOTENCY_KEY,
      participant: { full_name: "Anna Müller", email: "anna.mueller@test.com" },
      course: {
        course_code: "REVIT-ADV-2026",
        course_title: "Revit Advanced",
        duration_hours: 40,
        completion_date: "2026-03-15",
      },
    }),
  });

  const body = await res.json() as Record<string, unknown>;
  res.status === 200
    ? pass(`Duplicate idempotency_key returns 200 (existing: ${body.credential_id})`)
    : fail("Duplicate idempotency_key returns 200", `Got ${res.status}`);
}

// ─── TEST 5: Status check — wait for COMPLETED ──────────────────────────────
async function testStatusProgression() {
  if (!credentialId) {
    fail("Status progression", "No credential_id from previous test");
    return;
  }

  const url = `${BASE}/api/v1/credentials/${credentialId}/status`;

  const res1 = await fetch(url, { headers: auth() });
  const body1 = await res1.json() as Record<string, unknown>;
  if (["requested", "processing"].includes(body1.status as string)) {
    pass(`Initial status is ${body1.status} (pipeline running)`);
  } else {
    fail("Initial status is requested or processing", `Got: ${body1.status}`);
  }

  console.log("  ⏳ Waiting for pipeline to complete...");
  let finalBody: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const res = await fetch(url, { headers: auth() });
    finalBody = await res.json() as Record<string, unknown>;
    process.stdout.write(`  ⏳ ${i + 1}s — status: ${finalBody.status}   \r`);
    if (finalBody.status === "completed" || finalBody.status === "failed") break;
  }
  console.log("");

  if (finalBody.status === "completed") {
    pass("Credential reached COMPLETED status ✓ REQUESTED → PROCESSING → COMPLETED");
  } else {
    fail("Credential reached COMPLETED status", `Final status: ${finalBody.status}`);
    return;
  }

  finalBody.badge_png_url
    ? pass(`badge_png_url: ${finalBody.badge_png_url}`)
    : fail("badge_png_url present", "missing");

  finalBody.badge_svg_url
    ? pass(`badge_svg_url: ${finalBody.badge_svg_url}`)
    : fail("badge_svg_url present", "missing");

  finalBody.verification_url
    ? pass(`verification_url: ${finalBody.verification_url}`)
    : fail("verification_url present", "missing");

  finalBody.edc_share_url
    ? pass(`edc_share_url: ${finalBody.edc_share_url}`)
    : fail("edc_share_url present", "missing");

  const li = finalBody.linkedin as Record<string, unknown> | undefined;
  li?.name && li?.organization && li?.credential_id
    ? pass(`LinkedIn fields present — name: "${li.name}"`)
    : fail("LinkedIn fields present", JSON.stringify(li));
}

// ─── TEST 6: 404 for unknown credential ─────────────────────────────────────
async function testNotFound() {
  const res = await fetch(`${BASE}/api/v1/credentials/A04-9999-9999/status`, {
    headers: auth(),
  });
  res.status === 404
    ? pass("Unknown credential_id returns 404")
    : fail("Unknown credential_id returns 404", `Got ${res.status}`);
}

// ─── TEST 7: Badge files served by Next.js ───────────────────────────────────
async function testBadgeFiles() {
  if (!credentialId) return;
  const svgRes = await fetch(`${BASE}/badges/${credentialId}.svg`);
  const pngRes = await fetch(`${BASE}/badges/${credentialId}.png`);

  svgRes.ok
    ? pass(`SVG badge served at /badges/${credentialId}.svg`)
    : fail("SVG badge file accessible", `HTTP ${svgRes.status}`);

  pngRes.ok
    ? pass(`PNG badge served at /badges/${credentialId}.png`)
    : fail("PNG badge file accessible", `HTTP ${pngRes.status}`);
}

// ─── RUNNER ──────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n🧪 Atelier04 Credentials — End-to-End Tests\n");

  console.log("TEST 1: Authentication");
  await testUnauthorized();

  console.log("\nTEST 2: Validation");
  await testMissingFields();

  console.log("\nTEST 3: Issue Credential");
  await testIssueCredential();

  console.log("\nTEST 4: Duplicate Prevention");
  await testDuplicate();

  console.log("\nTEST 5: Full Pipeline (REQUESTED → PROCESSING → COMPLETED)");
  await testStatusProgression();

  console.log("\nTEST 6: Not Found");
  await testNotFound();

  console.log("\nTEST 7: Badge Files");
  await testBadgeFiles();

  console.log("\n─────────────────────────────────────────");
  if (process.exitCode === 1) {
    console.error("❌ Some tests failed — see above.\n");
  } else {
    console.log("✅ All tests passed!\n");
  }
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
