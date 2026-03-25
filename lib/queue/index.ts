import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisOpts = {
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

export function newRedisConnection() {
  return new IORedis(process.env.REDIS_URL!, redisOpts);
}

export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "fixed" as const, delay: 10000 },
  removeOnComplete: false,
  removeOnFail: false,
};

export const validateQueue    = new Queue("validate",       { connection: newRedisConnection(), defaultJobOptions: JOB_OPTIONS });
export const edcQueue         = new Queue("edc_issue",      { connection: newRedisConnection(), defaultJobOptions: JOB_OPTIONS });
export const badgeQueue       = new Queue("badge_generate", { connection: newRedisConnection(), defaultJobOptions: JOB_OPTIONS });
export const completeQueue    = new Queue("complete",       { connection: newRedisConnection(), defaultJobOptions: JOB_OPTIONS });
