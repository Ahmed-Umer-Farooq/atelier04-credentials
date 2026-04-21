/**
 * buildJsonLD.ts
 *
 * Constructs a W3C Verifiable Credential (JSON-LD) from a Credential DB record.
 *
 * Responsibilities:
 *   - Build a spec-compliant VC document
 *   - No I/O, no signing, no side-effects — pure data transformation
 *
 * Spec: https://www.w3.org/TR/vc-data-model/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of Prisma Credential fields required to build a VC. */
export interface CredentialInput {
  id: string;
  credential_id: string;
  participant_name: string;
  participant_email: string;
  course_code: string;
  course_title: string;
  duration_hours: number;
  completion_date: string; // ISO 8601 date string, e.g. "2026-04-21"
  result: string | null;
  organization: string;
  country: string;
  created_at: Date;
}

/** W3C VC proof placeholder — filled in by signJsonLD.ts. */
export interface VCProofPlaceholder {
  type: "RsaSignature2018";
  created: string;
  verificationMethod: string;
  proofPurpose: "assertionMethod";
  jws: null; // null until signed
}

/** Unsigned W3C Verifiable Credential document. */
export interface UnsignedVerifiableCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    name: string;
    country: string;
  };
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: string;
    name: string;
    email: string;
    achievement: {
      type: string;
      name: string;
      description: string;
      courseCode: string;
      durationHours: number;
      completionDate: string;
      result: string | null;
    };
  };
  proof: VCProofPlaceholder;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const W3C_VC_CONTEXT = "https://www.w3.org/2018/credentials/v1";
const OPEN_BADGES_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context.json";
const CREDENTIAL_TYPE = "VerifiableCredential";
const LEARNING_ACHIEVEMENT_TYPE = "LearningAchievement";
const OPEN_BADGE_CREDENTIAL_TYPE = "OpenBadgeCredential";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds an unsigned W3C Verifiable Credential document from a DB credential record.
 *
 * The returned document contains a `proof` block with `jws: null`.
 * Pass this document to `signJsonLD.ts` to produce the final signed credential.
 *
 * @param credential - DB credential record fields required for VC construction
 * @param verificationBaseUrl - Base URL for the public verification page (from env)
 * @param issuerDid - DID or HTTPS URL identifying the issuer
 * @returns Unsigned VC document ready for signing
 */
export function buildJsonLD(
  credential: CredentialInput,
  verificationBaseUrl: string,
  issuerDid: string,
): UnsignedVerifiableCredential {
  validateCredentialInput(credential);
  validateUrl(verificationBaseUrl, "verificationBaseUrl");
  validateUrl(issuerDid, "issuerDid");

  const credentialId = buildCredentialId(verificationBaseUrl, credential.id);
  const issuanceDate = credential.created_at.toISOString();
  const subjectId = buildSubjectId(credential.participant_email);

  return {
    "@context": [W3C_VC_CONTEXT, OPEN_BADGES_CONTEXT],
    id: credentialId,
    type: [CREDENTIAL_TYPE, OPEN_BADGE_CREDENTIAL_TYPE],
    issuer: {
      id: issuerDid,
      name: credential.organization,
      country: credential.country,
    },
    issuanceDate,
    credentialSubject: {
      id: subjectId,
      type: LEARNING_ACHIEVEMENT_TYPE,
      name: credential.participant_name,
      email: credential.participant_email,
      achievement: {
        type: LEARNING_ACHIEVEMENT_TYPE,
        name: credential.course_title,
        description: buildAchievementDescription(credential),
        courseCode: credential.course_code,
        durationHours: credential.duration_hours,
        completionDate: credential.completion_date,
        result: credential.result ?? null,
      },
    },
    proof: {
      type: "RsaSignature2018",
      created: issuanceDate,
      verificationMethod: `${issuerDid}#key-1`,
      proofPurpose: "assertionMethod",
      jws: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildCredentialId(verificationBaseUrl: string, credentialDbId: string): string {
  const base = verificationBaseUrl.replace(/\/$/, "");
  return `${base}/${credentialDbId}`;
}

/**
 * Encodes the participant email as a mailto: URI for the credentialSubject id.
 * This is the conventional approach for pseudonymous subject identification in VCs.
 */
function buildSubjectId(email: string): string {
  return `mailto:${email.toLowerCase().trim()}`;
}

function buildAchievementDescription(credential: CredentialInput): string {
  const resultClause =
    credential.result !== null && credential.result !== ""
      ? ` Result: ${credential.result}.`
      : "";

  return (
    `Successfully completed ${credential.course_title} (${credential.course_code}) ` +
    `with a duration of ${credential.duration_hours} hours.` +
    resultClause
  );
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validateCredentialInput(c: CredentialInput): void {
  assertNonEmpty(c.id, "id");
  assertNonEmpty(c.credential_id, "credential_id");
  assertNonEmpty(c.participant_name, "participant_name");
  assertNonEmpty(c.participant_email, "participant_email");
  assertNonEmpty(c.course_code, "course_code");
  assertNonEmpty(c.course_title, "course_title");
  assertNonEmpty(c.organization, "organization");
  assertNonEmpty(c.country, "country");
  assertNonEmpty(c.completion_date, "completion_date");

  if (!Number.isInteger(c.duration_hours) || c.duration_hours <= 0) {
    throw new TypeError(
      `[buildJsonLD] duration_hours must be a positive integer, got: ${c.duration_hours}`,
    );
  }

  if (!(c.created_at instanceof Date) || isNaN(c.created_at.getTime())) {
    throw new TypeError("[buildJsonLD] created_at must be a valid Date object");
  }

  if (!isValidEmail(c.participant_email)) {
    throw new TypeError(
      `[buildJsonLD] participant_email is not a valid email address: ${c.participant_email}`,
    );
  }
}

function assertNonEmpty(value: string | undefined | null, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`[buildJsonLD] Required field "${field}" is missing or empty`);
  }
}

function validateUrl(value: string, field: string): void {
  try {
    new URL(value);
  } catch {
    throw new TypeError(
      `[buildJsonLD] "${field}" must be a valid URL, got: ${value}`,
    );
  }
}

function isValidEmail(email: string): boolean {
  // RFC 5322 simplified — sufficient for credential issuance validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
