import { Worker } from "bullmq";
import { prisma } from "../db/prisma";

export function attachFailureHandler(worker: Worker) {
  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 3)) return;
    const { credentialDbId } = job.data;
    try {
      const credential = await prisma.credential.findUnique({ where: { id: credentialDbId } });
      if (!credential || credential.status === "FAILED") return;
      await prisma.$transaction([
        prisma.credential.update({
          where: { id: credentialDbId },
          data: { status: "FAILED" },
        }),
        prisma.auditLog.create({
          data: {
            credential_id: credentialDbId,
            from_status: credential.status,
            to_status: "FAILED",
            reason: err.message,
          },
        }),
      ]);
    } catch {}
  });
}
