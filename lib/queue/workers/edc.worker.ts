import "dotenv/config";
import { Worker } from "bullmq";
import { newRedisConnection, badgeQueue, JOB_OPTIONS } from "../index";
import { prisma } from "../../db/prisma";
import { buildXML } from "../../europass/buildXML";
import { signXML } from "../../europass/signXML";
import { submitToWallet } from "../../europass/submitToWallet";

export const edcWorker = new Worker(
  "edc_issue",
  async (job) => {
    const { credentialDbId } = job.data;

    const credential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialDbId },
    });

    const xml = buildXML(credential);
    const signedXML = signXML(xml);
    const { uuid, viewerURL } = await submitToWallet(credential.participant_email, signedXML);

    await prisma.credential.update({
      where: { id: credentialDbId },
      data: { edc_uuid: uuid, edc_share_url: viewerURL },
    });

    await badgeQueue.add("badge_generate", { credentialDbId }, JOB_OPTIONS);
  },
  { connection: newRedisConnection() }
);
