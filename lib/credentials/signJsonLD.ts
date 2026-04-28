/**
 * signJsonLD.ts
 *
 * Signs a W3C Verifiable Credential using the eSeal .p12 certificate (node-forge).
 *
 * Signing approach:
 *   - Canonicalize the credential document (proof.jws = null removed for signing)
 *   - Sign the canonical JSON bytes with RSA-SHA256 (same key as signXML.ts)
 *   - Encode signature as compact JWS (detached payload, RS256 algorithm)
 *   - Write the JWS string into proof.jws on the returned document
 *
 * JWS format: <header_b64url>..<signature_b64url>  (empty payload = detached)
 *
 * Responsibilities:
 *   - Load and decrypt the .p12 file
 *   - Produce a valid JWS compact serialization
 *   - Return the completed, signed VC document
 *   - No DB writes, no queue operations
 *
 * Dependencies:
 *   - node-forge (already installed, used by signXML.ts)
 *   - fs (Node built-in)
 */

import fs from "fs";
import forge from "node-forge";
import type { UnsignedVerifiableCredential } from "./buildJsonLD";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A fully signed Verifiable Credential — proof.jws is populated. */
export interface SignedVerifiableCredential extends Omit<UnsignedVerifiableCredential, "proof"> {
  proof: Omit<UnsignedVerifiableCredential["proof"], "jws"> & { jws: string };
}

/** P12 bundle extracted from the .p12 file. */
interface P12Bundle {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
}

// ---------------------------------------------------------------------------
// Environment variable keys (must match .env)
// ---------------------------------------------------------------------------

const ENV_P12_PATH = "ATRUST_P12_PATH";
const ENV_P12_PASSWORD = "ATRUST_P12_PASSWORD";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Signs an unsigned Verifiable Credential document with the eSeal private key.
 *
 * @param unsignedVC - Output of buildJsonLD(); proof.jws must be null
 * @returns A new VC document with proof.jws populated (does not mutate input)
 * @throws If env vars are missing, the .p12 file is unreadable, or signing fails
 */
export function signJsonLD(
  unsignedVC: UnsignedVerifiableCredential,
): SignedVerifiableCredential {
  assertProofUnsigned(unsignedVC);

  const p12Path = requireEnvVar(ENV_P12_PATH);
  const p12Password = requireEnvVar(ENV_P12_PASSWORD);

  const { privateKey } = loadP12Bundle(p12Path, p12Password);

  const payloadBytes = buildSigningPayload(unsignedVC);
  const jws = produceJws(payloadBytes, privateKey);

  return assembleSignedCredential(unsignedVC, jws);
}

// ---------------------------------------------------------------------------
// P12 loading
// ---------------------------------------------------------------------------

/**
 * Reads and decrypts the .p12 file.
 * Extracts the first RSA private key and its corresponding certificate.
 */
function loadP12Bundle(p12Path: string, password: string): P12Bundle {
  let p12Der: Buffer;
  try {
    const resolvedPath = require("path").isAbsolute(p12Path)
      ? p12Path
      : require("path").join(process.cwd(), p12Path);
    p12Der = fs.readFileSync(resolvedPath);
  } catch (err: unknown) {
    throw new Error(
      `[signJsonLD] Cannot read .p12 file at "${p12Path}": ${errorMessage(err)}`,
    );
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Der.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (err: unknown) {
    throw new Error(
      `[signJsonLD] Failed to decrypt .p12 file (wrong password or corrupt file): ${errorMessage(err)}`,
    );
  }

  const privateKey = extractPrivateKey(p12);
  const certificate = extractCertificate(p12);

  return { privateKey, certificate };
}

function extractPrivateKey(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.rsa.PrivateKey {
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

  if (bags.length === 0 || !bags[0]?.key) {
    throw new Error("[signJsonLD] No private key found in the .p12 file");
  }

  return bags[0].key as forge.pki.rsa.PrivateKey;
}

function extractCertificate(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag] ?? [];

  if (bags.length === 0 || !bags[0]?.cert) {
    throw new Error("[signJsonLD] No certificate found in the .p12 file");
  }

  return bags[0].cert as forge.pki.Certificate;
}

// ---------------------------------------------------------------------------
// Signing payload construction
// ---------------------------------------------------------------------------

/**
 * Produces the canonical byte payload to be signed.
 *
 * Strategy:
 *   1. Deep-clone the VC
 *   2. Remove proof.jws (set to undefined) — we sign the VC without its own JWS value
 *   3. Deterministically serialize to JSON (sorted keys)
 *
 * This matches the LD-Proofs spec guidance for what bytes get signed.
 */
function buildSigningPayload(vc: UnsignedVerifiableCredential): string {
  const vcForSigning = deepCloneWithoutJws(vc);
  return deterministicJsonSerialize(vcForSigning);
}

function deepCloneWithoutJws(
  vc: UnsignedVerifiableCredential | SignedVerifiableCredential,
): Omit<UnsignedVerifiableCredential, "proof"> & {
  proof: Omit<UnsignedVerifiableCredential["proof"], "jws"> & { jws: null };
} {
  const cloned = JSON.parse(JSON.stringify(vc)) as Record<string, unknown>;
  const proof = cloned["proof"] as Record<string, unknown>;
  proof["jws"] = null; // set to null (not delete) — must match signing payload exactly
  return cloned as ReturnType<typeof deepCloneWithoutJws>;
}

/**
 * Serializes an object to JSON with recursively sorted keys.
 * Ensures the signing payload is deterministic regardless of insertion order.
 */
function deterministicJsonSerialize(obj: unknown): string {
  return JSON.stringify(obj, sortedReplacer);
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// ---------------------------------------------------------------------------
// JWS production
// ---------------------------------------------------------------------------

/**
 * Produces a compact JWS with detached payload.
 *
 * Format: <header_b64url>..<signature_b64url>
 *
 * The empty middle segment denotes detached payload (RFC 7515 §7.2.7).
 * Verifiers reconstruct the payload from the VC document itself.
 *
 * Algorithm: RS256 (RSA + SHA-256), matching signXML.ts.
 */
function produceJws(
  payload: string,
  privateKey: forge.pki.rsa.PrivateKey,
): string {
  const header = buildJwsHeader();
  const headerB64 = toBase64Url(Buffer.from(header, "utf8"));
  const payloadB64 = toBase64Url(Buffer.from(payload, "utf8"));

  // Signing input per RFC 7515 §5.2: ASCII(BASE64URL(header) || '.' || BASE64URL(payload))
  const signingInput = `${headerB64}.${payloadB64}`;

  const md = forge.md.sha256.create();
  md.update(signingInput, "utf8");

  const signatureBytes = privateKey.sign(md);
  const signatureB64 = toBase64Url(Buffer.from(signatureBytes, "binary"));

  // Detached payload: omit the payload segment between the dots
  return `${headerB64}..${signatureB64}`;
}

function buildJwsHeader(): string {
  return JSON.stringify({ alg: "RS256", b64: false, crit: ["b64"] });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Returns a new VC document with proof.jws populated.
 * Does NOT mutate the input.
 */
function assembleSignedCredential(
  unsignedVC: UnsignedVerifiableCredential,
  jws: string,
): SignedVerifiableCredential {
  return {
    ...unsignedVC,
    proof: {
      ...unsignedVC.proof,
      jws,
    },
  } as SignedVerifiableCredential;
}

// ---------------------------------------------------------------------------
// Signature verification (used by the public verification page)
// ---------------------------------------------------------------------------

/**
 * Verifies a signed Verifiable Credential's JWS proof.
 *
 * @param signedVC - The signed VC to verify
 * @returns true if the signature is valid, false otherwise
 */
export function verifyJsonLD(signedVC: SignedVerifiableCredential): boolean {
  try {
    const { jws } = signedVC.proof;
    const parts = jws.split(".");

    if (parts.length !== 3) {
      return false;
    }

    const [headerB64, , signatureB64] = parts;

    if (!headerB64 || !signatureB64) {
      return false;
    }

    // Reconstruct signing input from the VC without the JWS value
    const vcWithoutJws = deepCloneWithoutJws(signedVC);
    const payload = deterministicJsonSerialize(vcWithoutJws);
    const payloadB64 = toBase64Url(Buffer.from(payload, "utf8"));
    const signingInput = `${headerB64}.${payloadB64}`;

    // Extract public key from the certificate embedded in the .p12
    const p12Path = process.env[ENV_P12_PATH];
    const p12Password = process.env[ENV_P12_PASSWORD];

    if (!p12Path || !p12Password) {
      // Cannot verify without env vars — treat as unverifiable (not invalid)
      return false;
    }

    const { certificate } = loadP12Bundle(p12Path, p12Password);
    const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;

    const md = forge.md.sha256.create();
    md.update(signingInput, "utf8");

    const signatureBytes = fromBase64Url(signatureB64);
    const signatureBinary = Buffer.from(signatureBytes).toString("binary");
    return publicKey.verify(md.digest().bytes(), signatureBinary);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[signJsonLD] Required environment variable "${name}" is not set`,
    );
  }
  return value;
}

function assertProofUnsigned(vc: UnsignedVerifiableCredential): void {
  if (vc.proof.jws !== null) {
    throw new Error(
      "[signJsonLD] Input VC already has a JWS proof. Do not sign twice.",
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
