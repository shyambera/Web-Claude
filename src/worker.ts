import { Worker } from "bullmq";
import { Monitor } from "@prisma/client";
import { prisma } from "./lib/db";
import {
  redisConnection,
  CheckJobData,
  HTTP_CHECK_QUEUE,
  SSL_CHECK_QUEUE,
  DOMAIN_CHECK_QUEUE,
} from "./lib/queue";
import { performHttpCheck } from "./checks/httpCheck";
import { recordCheckAndHandleIncident } from "./services/incident.service";
import { runSslCheck } from "./services/sslMonitor.service";
import { runDomainCheck } from "./services/domainMonitor.service";
import { AlertRecipient } from "./alerting/dispatch";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 10);

async function loadMonitorWithRecipient(
  monitorId: string
): Promise<{ monitor: Monitor; recipient: AlertRecipient } | null> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: monitorId },
    include: { account: { include: { owner: true } } },
  });

  if (!monitor || !monitor.isActive) return null;

  return {
    monitor,
    recipient: {
      ownerEmail: monitor.account.owner.email,
      alertPhoneNumber: monitor.account.alertPhoneNumber,
    },
  };
}

function makeWorker(queueName: string, handler: (monitor: Monitor, recipient: AlertRecipient) => Promise<void>) {
  const worker = new Worker<CheckJobData>(
    queueName,
    async (job) => {
      const loaded = await loadMonitorWithRecipient(job.data.monitorId);
      if (!loaded) return;
      await handler(loaded.monitor, loaded.recipient);
    },
    { connection: redisConnection, concurrency: CONCURRENCY }
  );

  worker.on("completed", (job) => console.log(`[${queueName}] checked monitor ${job.data.monitorId}`));
  worker.on("failed", (job, err) =>
    console.error(`[${queueName}] check failed for monitor ${job?.data.monitorId}:`, err.message)
  );

  return worker;
}

makeWorker(HTTP_CHECK_QUEUE, async (monitor, recipient) => {
  const result = await performHttpCheck(monitor.targetUrl);
  await recordCheckAndHandleIncident(monitor, recipient, result);
});

makeWorker(SSL_CHECK_QUEUE, runSslCheck);
makeWorker(DOMAIN_CHECK_QUEUE, runDomainCheck);

console.log(`Check workers started with concurrency ${CONCURRENCY} (http, ssl, domain)`);
