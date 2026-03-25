import "dotenv/config";
import { Worker } from "bullmq";
import { newRedisConnection, completeQueue, JOB_OPTIONS } from "../index";
import { prisma } from "../../db/prisma";
import { generateSVG } from "../../badge/generateSVG";
import { generatePNG } from "../../badge/generatePNG";

export const badgeWorker = new Worker(
  "badge_generate",
  async (job) => {
    const { credentialDbId } = job.data;

    const credential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialDbId },
    });

    const svg = generateSVG({
      credential_id: credential.credential_id,
      participant_name: credential.participant_name,
      course_title: credential.course_title,
      completion_date: credential.completion_date,
      organization: credential.organization,
    });

    const { svgUrl, pngUrl } = await generatePNG(svg, credential.credential_id);

    await prisma.credential.update({
      where: { id: credentialDbId },
      data: { badge_svg_url: svgUrl, badge_png_url: pngUrl },
    });

    await completeQueue.add("complete", { credentialDbId }, JOB_OPTIONS);
  },
  { connection: newRedisConnection() }
);
