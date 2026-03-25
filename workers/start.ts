import "dotenv/config";
import { validateWorker } from "../lib/queue/workers/validate.worker";
import { edcWorker } from "../lib/queue/workers/edc.worker";
import { badgeWorker } from "../lib/queue/workers/badge.worker";
import { completeWorker } from "../lib/queue/workers/complete.worker";
import { attachFailureHandler } from "../lib/queue/failureHandler";

const workers = [validateWorker, edcWorker, badgeWorker, completeWorker];

workers.forEach((w) => {
  w.on("active", (job) => console.log(`[${w.name}] ▶ active — ${job.id}`));
  w.on("completed", (job) => console.log(`[${w.name}] ✅ completed — ${job.id}`));
  w.on("failed", (job, err) => console.error(`[${w.name}] ❌ failed — ${job?.id} — ${err.message}`));
  w.on("error", (err) => console.error(`[${w.name}] 🔴 error — ${err.message}`));
});

workers.forEach(attachFailureHandler);

console.log("🚀 Workers started");
console.log("  ✅ validate  → queue: validate");
console.log("  ✅ edc       → queue: edc_issue");
console.log("  ✅ badge     → queue: badge_generate");
console.log("  ✅ complete  → queue: complete");

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
