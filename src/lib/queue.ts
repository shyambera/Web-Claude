import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const redisConnection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const HTTP_CHECK_QUEUE = "http-check";

export interface HttpCheckJobData {
  monitorId: string;
}

export const httpCheckQueue = new Queue<HttpCheckJobData>(HTTP_CHECK_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  },
});
