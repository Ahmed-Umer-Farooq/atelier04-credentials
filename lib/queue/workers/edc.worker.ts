import "dotenv/config";
import { Worker } from "bullmq";
import { newRedisConnection, badgeQueue, JOB_OPTIONS } from "../index";
import { prisma } from "../../db/prisma";
import { buildXML } from "../../europass/buildXML";
import { signXML } from "../../europass/signXML";
import { submitToWallet } from "../../europass/submitToWallet";
import { buildJsonLD } from "../../credentials/buildJsonLD";
import { signJsonLD } from "../../credentials/signJsonLD";

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) throw new Error(`[edc.worker] Required env var "${name}" is not set`);
  return value;
}

export const edcWorker = new Worker(
  "edc_issue",
  async (job) => {
    const { credentialDbId } = job.data;

    const credential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialDbId },
    });

    // Step 1 — EDCI XML + eSeal sign + Europass submit
    const xml = buildXML(credential);
    const signedXML = signXML(xml);
    const { uuid, viewerURL } = await submitToWallet(credential.participant_email, signedXML);

    await prisma.credential.update({
      where: { id: credentialDbId },
      data: { edc_uuid: uuid, edc_share_url: viewerURL },
    });

    // Step 2 — W3C Verifiable Credential (JSON-LD) + sign + persist
    const unsignedVC = buildJsonLD(
      {
        id: credential.id,
        credential_id: credential.credential_id,
        participant_name: credential.participant_name,
        participant_email: credential.participant_email,
        course_code: credential.course_code,
        course_title: credential.course_title,
        duration_hours: credential.duration_hours,
        completion_date: credential.completion_date,
        result: credential.result,
        organization: credential.organization,
        country: credential.country,
        created_at: credential.created_at,
      },
      requireEnvVar("ATELIER04_VERIFICATION_BASE"),
      requireEnvVar("BASE_URL"),
    );
    const signedVC = signJsonLD(unsignedVC);
    await prisma.credential.update({
      where: { id: credentialDbId },
      data: { credential_json: JSON.stringify(signedVC, null, 2) },
    });

    await badgeQueue.add("badge_generate", { credentialDbId }, JOB_OPTIONS);
  },
  { connection: newRedisConnection() }
);
