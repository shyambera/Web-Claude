import { MonitorType } from "@prisma/client";
import { prisma } from "./lib/db";
import { env } from "./lib/env";
import { httpCheckQueue, sslCheckQueue, domainCheckQueue } from "./lib/queue";

const BATCH_SIZE = 100;

const QUEUE_BY_TYPE: Record<MonitorType, typeof httpCheckQueue> = {
  HTTP: httpCheckQueue,
  SSL: sslCheckQueue,
  DOMAIN: domainCheckQueue,
};

async function tick() {
  const now = new Date();
  const dueMonitors = await prisma.monitor.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    take: BATCH_SIZE,
    select: { id: true, type: true, checkIntervalSec: true, nextRunAt: true },
  });

  for (const monitor of dueMonitors) {
    // Optimistic claim: only advance nextRunAt if nobody else already did.
    // This keeps the scheduler safe to run as more than one instance.
    const claimed = await prisma.monitor.updateMany({
      where: { id: monitor.id, nextRunAt: monitor.nextRunAt },
      data: { nextRunAt: new Date(Date.now() + monitor.checkIntervalSec * 1000) },
    });

    if (claimed.count === 1) {
      await QUEUE_BY_TYPE[monitor.type].add("check", { monitorId: monitor.id });
    }
  }

  if (dueMonitors.length > 0) {
    console.log(`Scheduler enqueued ${dueMonitors.length} check(s) at ${now.toISOString()}`);
  }
}

async function main() {
  console.log(`Scheduler started, polling every ${env.schedulerPollIntervalMs}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error("Scheduler tick failed:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, env.schedulerPollIntervalMs));
  }
}

main();
