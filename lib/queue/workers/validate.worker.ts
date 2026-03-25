import "dotenv/config";
import { Worker } from "bullmq";
import { newRedisConnection, edcQueue, JOB_OPTIONS } from "../index";
import { prisma } from "../../db/prisma";

export const validateWorker = new Worker(
  "validate",
  async (job) => {
    const { credentialDbId } = job.data;

    await prisma.$transaction([
      prisma.credential.update({
        where: { id: credentialDbId },
        data: { status: "PROCESSING" },
      }),
      prisma.auditLog.create({
        data: {
          credential_id: credentialDbId,
          from_status: "REQUESTED",
          to_status: "PROCESSING",
        },
      }),
    ]);

    await edcQueue.add("edc_issue", { credentialDbId }, JOB_OPTIONS);
  },
  { connection: newRedisConnection() }
);
