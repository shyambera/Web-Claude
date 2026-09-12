import { Worker } from "bullmq";
import { prisma } from "./lib/db";
import { redisConnection, HTTP_CHECK_QUEUE, HttpCheckJobData } from "./lib/queue";
import { performHttpCheck } from "./checks/httpCheck";
import { recordCheckAndHandleIncident } from "./services/incident.service";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 10);

async function processJob(monitorId: string) {
  const monitor = await prisma.monitor.findUnique({
    where: { id: monitorId },
    include: { account: { include: { owner: true } } },
  });

  if (!monitor || !monitor.isActive) {
    return;
  }

  const result = await performHttpCheck(monitor.targetUrl);
  await recordCheckAndHandleIncident({ ...monitor, ownerEmail: monitor.account.owner.email }, result);
}

const worker = new Worker<HttpCheckJobData>(
  HTTP_CHECK_QUEUE,
  async (job) => {
    await processJob(job.data.monitorId);
  },
  { connection: redisConnection, concurrency: CONCURRENCY }
);

worker.on("completed", (job) => {
  console.log(`Checked monitor ${job.data.monitorId}`);
});

worker.on("failed", (job, err) => {
  console.error(`Check failed for monitor ${job?.data.monitorId}:`, err.message);
});

console.log(`HTTP check worker started with concurrency ${CONCURRENCY}`);
