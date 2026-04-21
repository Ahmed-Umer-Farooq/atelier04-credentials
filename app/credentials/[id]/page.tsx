/**
 * app/credentials/[id]/page.tsx
 *
 * Public verification page for a single credential.
 *
 * Route: GET /credentials/{credentialDbId}
 *
 * Responsibilities:
 *   - Fetch the credential from DB by its cuid primary key
 *   - Verify the JWS signature on the stored credential_json
 *   - Render a publicly accessible, human-readable credential card
 *   - Show verification status (valid / invalid / pending)
 *
 * Auth: None — this page is intentionally public.
 * Rendering: React Server Component (no "use client" — data fetch happens server-side)
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { verifyJsonLD } from "@/lib/credentials/signJsonLD";
import type { SignedVerifiableCredential } from "@/lib/credentials/signJsonLD";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const credential = await fetchCredential(id);

  if (!credential) {
    return { title: "Credential Not Found" };
  }

  return {
    title: `${credential.course_title} — ${credential.participant_name}`,
    description: `Verifiable credential issued by ${credential.organization}`,
    robots: { index: true, follow: false },
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function CredentialVerificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const credential = await fetchCredential(id);

  if (!credential) {
    notFound();
  }

  const verificationResult = computeVerificationResult(credential);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <VerificationBanner status={verificationResult.status} />

        <CredentialCard
          credential={credential}
          issuedAt={credential.created_at}
        />

        <SignatureDetails
          status={verificationResult.status}
          credentialJson={credential.credential_json}
        />

        <Footer credentialId={credential.credential_id} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Verification logic
// ---------------------------------------------------------------------------

type VerificationStatus = "VALID" | "INVALID" | "PENDING";

interface VerificationResult {
  status: VerificationStatus;
}

function computeVerificationResult(
  credential: NonNullable<Awaited<ReturnType<typeof fetchCredential>>>,
): VerificationResult {
  if (credential.status !== "COMPLETED") {
    return { status: "PENDING" };
  }

  if (!credential.credential_json) {
    return { status: "PENDING" };
  }

  let parsedVC: unknown;
  try {
    parsedVC = JSON.parse(credential.credential_json);
  } catch {
    return { status: "INVALID" };
  }

  if (!isSignedVerifiableCredential(parsedVC)) {
    return { status: "INVALID" };
  }

  const valid = verifyJsonLD(parsedVC);
  return { status: valid ? "VALID" : "INVALID" };
}

/** Runtime type guard for SignedVerifiableCredential. */
function isSignedVerifiableCredential(value: unknown): value is SignedVerifiableCredential {
  if (typeof value !== "object" || value === null) return false;

  const v = value as Record<string, unknown>;
  if (typeof v["id"] !== "string") return false;
  if (!Array.isArray(v["type"])) return false;
  if (typeof v["proof"] !== "object" || v["proof"] === null) return false;

  const proof = v["proof"] as Record<string, unknown>;
  if (typeof proof["jws"] !== "string") return false;

  return true;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchCredential(id: string) {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return null;
  }

  return prisma.credential.findUnique({
    where: { id },
    select: {
      id: true,
      credential_id: true,
      status: true,
      participant_name: true,
      participant_email: true,
      course_code: true,
      course_title: true,
      duration_hours: true,
      completion_date: true,
      result: true,
      organization: true,
      country: true,
      badge_svg_url: true,
      badge_png_url: true,
      credential_json: true,
      created_at: true,
    },
  });
}

type CredentialRecord = NonNullable<Awaited<ReturnType<typeof fetchCredential>>>;

// ---------------------------------------------------------------------------
// UI components (inline — no external UI library dependency)
// ---------------------------------------------------------------------------

function VerificationBanner({ status }: { status: VerificationStatus }) {
  const config: Record<
    VerificationStatus,
    { bg: string; border: string; icon: string; title: string; body: string }
  > = {
    VALID: {
      bg: "bg-green-50",
      border: "border-green-400",
      icon: "✓",
      title: "Credential Verified",
      body: "The digital signature on this credential is valid and has not been tampered with.",
    },
    INVALID: {
      bg: "bg-red-50",
      border: "border-red-400",
      icon: "✗",
      title: "Verification Failed",
      body: "The signature on this credential could not be verified. The document may have been altered.",
    },
    PENDING: {
      bg: "bg-yellow-50",
      border: "border-yellow-400",
      icon: "⏳",
      title: "Credential Pending",
      body: "This credential is still being processed. Please check back shortly.",
    },
  };

  const { bg, border, icon, title, body } = config[status];

  return (
    <div className={`rounded-lg border-l-4 ${border} ${bg} p-5 mb-6`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{icon}</span>
        <div>
          <p className="font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-600 mt-1">{body}</p>
        </div>
      </div>
    </div>
  );
}

function CredentialCard({
  credential,
  issuedAt,
}: {
  credential: CredentialRecord;
  issuedAt: Date;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-indigo-700 px-6 py-5 text-white">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-200 mb-1">
          Certificate of Completion
        </p>
        <h1 className="text-2xl font-bold leading-snug">{credential.course_title}</h1>
        <p className="text-indigo-200 text-sm mt-1">{credential.course_code}</p>
      </div>

      {/* Body */}
      <div className="px-6 py-6 space-y-5">
        {/* Recipient */}
        <Section title="Recipient">
          <Field label="Name" value={credential.participant_name} />
          <Field label="Email" value={credential.participant_email} />
        </Section>

        {/* Course */}
        <Section title="Course Details">
          <Field label="Duration" value={`${credential.duration_hours} hours`} />
          <Field label="Completion Date" value={formatDate(credential.completion_date)} />
          {credential.result && <Field label="Result" value={credential.result} />}
        </Section>

        {/* Issuer */}
        <Section title="Issuer">
          <Field label="Organization" value={credential.organization} />
          <Field label="Country" value={credential.country} />
          <Field label="Issued On" value={formatDateTime(issuedAt)} />
        </Section>

        {/* Credential ID */}
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Credential ID:{" "}
            <span className="font-mono text-gray-600">{credential.credential_id}</span>
          </p>
        </div>

        {/* Badge download */}
        {credential.badge_png_url && (
          <div className="pt-2">
            <a
              href={credential.badge_png_url}
              download
              className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              ↓ Download Open Badge
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureDetails({
  status,
  credentialJson,
}: {
  status: VerificationStatus;
  credentialJson: string | null;
}) {
  if (status === "PENDING" || !credentialJson) return null;

  let vc: Record<string, unknown> | null = null;
  try {
    vc = JSON.parse(credentialJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  const proof = vc["proof"] as Record<string, unknown> | undefined;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Signature Details
      </h2>
      <dl className="space-y-3 text-sm">
        <SignatureField label="Proof Type" value={String(proof?.["type"] ?? "—")} />
        <SignatureField label="Algorithm" value="RS256 (RSA-SHA256)" />
        <SignatureField
          label="Verification Method"
          value={String(proof?.["verificationMethod"] ?? "—")}
          mono
        />
        <SignatureField
          label="Proof Created"
          value={proof?.["created"] ? formatDateTime(new Date(String(proof["created"]))) : "—"}
        />
      </dl>

      <details className="mt-4">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition-colors select-none">
          Show raw credential JSON-LD
        </summary>
        <pre className="mt-3 text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto text-gray-700 leading-relaxed">
          {credentialJson}
        </pre>
      </details>
    </div>
  );
}

function Footer({ credentialId }: { credentialId: string }) {
  return (
    <p className="text-center text-xs text-gray-400 mt-8">
      This page is the authoritative verification record for credential {credentialId}.
      Bookmark this URL to verify authenticity at any time.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        {title}
      </h2>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="text-gray-500 min-w-[130px] shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
  );
}

function SignatureField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500 min-w-[160px] shrink-0">{label}</dt>
      <dd className={`text-gray-800 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date formatting (locale-independent, server-safe)
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  try {
    const [year, month, day] = isoDate.split("-");
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthIndex = parseInt(month ?? "0", 10) - 1;
    return `${months[monthIndex] ?? month} ${day}, ${year}`;
  } catch {
    return isoDate;
  }
}

function formatDateTime(date: Date): string {
  try {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const mm = String(date.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm} UTC`;
  } catch {
    return date.toISOString();
  }
}
