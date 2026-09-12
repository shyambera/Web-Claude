import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const redisConnection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export interface CheckJobData {
  monitorId: string;
}

const defaultJobOptions = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};

// One queue per check type (spec Section 7.1–7.2): resource profiles differ
// — an RDAP/TLS lookup is a slow, low-frequency network round trip, while
// HTTP uptime checks are light and run far more often — so each type scales
// independently even though, at MVP volume, their workers currently share
// one process (see worker.ts).
export const HTTP_CHECK_QUEUE = "http-check";
export const SSL_CHECK_QUEUE = "ssl-check";
export const DOMAIN_CHECK_QUEUE = "domain-check";

export const httpCheckQueue = new Queue<CheckJobData>(HTTP_CHECK_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});

export const sslCheckQueue = new Queue<CheckJobData>(SSL_CHECK_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});

export const domainCheckQueue = new Queue<CheckJobData>(DOMAIN_CHECK_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});
