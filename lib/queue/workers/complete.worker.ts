import "dotenv/config";
import { Worker } from "bullmq";
import { newRedisConnection } from "../index";
import { prisma } from "../../db/prisma";

export const completeWorker = new Worker(
  "complete",
  async (job) => {
    const { credentialDbId } = job.data;

    await prisma.$transaction([
      prisma.credential.update({
        where: { id: credentialDbId },
        data: { status: "COMPLETED" },
      }),
      prisma.auditLog.create({
        data: {
          credential_id: credentialDbId,
          from_status: "PROCESSING",
          to_status: "COMPLETED",
        },
      }),
    ]);
  },
  { connection: newRedisConnection() }
);
