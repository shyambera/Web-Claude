import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { requireAuth } from "../middleware/requireAuth";
import { computeUptimeStats } from "../services/monitor.service";

export const monitorsRouter = Router();
monitorsRouter.use(requireAuth);

const createMonitorSchema = z.object({
  name: z.string().min(1).max(200),
  targetUrl: z.string().url(),
  checkIntervalSec: z.number().int().min(30).max(86400).default(300),
  expectedStatusCode: z.number().int().min(100).max(599).default(200),
  responseTimeThresholdMs: z.number().int().min(100).max(60000).default(3000),
  consecutiveFailureThreshold: z.number().int().min(1).max(10).default(2),
});

monitorsRouter.get("/", async (req, res) => {
  const accountId = req.auth!.accountId;
  const monitors = await prisma.monitor.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });

  const withStats = await Promise.all(
    monitors.map(async (monitor) => ({
      ...monitor,
      stats: await computeUptimeStats(monitor.id),
    }))
  );

  res.json(withStats);
});

monitorsRouter.post("/", async (req, res) => {
  const parsed = createMonitorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const monitor = await prisma.monitor.create({
    data: {
      accountId: req.auth!.accountId,
      ...parsed.data,
      nextRunAt: new Date(),
    },
  });

  res.status(201).json(monitor);
});

async function findOwnedMonitor(accountId: string, monitorId: string) {
  return prisma.monitor.findFirst({ where: { id: monitorId, accountId } });
}

monitorsRouter.get("/:id", async (req, res) => {
  const monitor = await findOwnedMonitor(req.auth!.accountId, req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found" });

  res.json({ ...monitor, stats: await computeUptimeStats(monitor.id) });
});

const updateMonitorSchema = createMonitorSchema.partial().extend({
  isActive: z.boolean().optional(),
});

monitorsRouter.patch("/:id", async (req, res) => {
  const monitor = await findOwnedMonitor(req.auth!.accountId, req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found" });

  const parsed = updateMonitorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await prisma.monitor.update({
    where: { id: monitor.id },
    data: parsed.data,
  });

  res.json(updated);
});

monitorsRouter.delete("/:id", async (req, res) => {
  const monitor = await findOwnedMonitor(req.auth!.accountId, req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found" });

  await prisma.monitor.delete({ where: { id: monitor.id } });
  res.status(204).send();
});

monitorsRouter.get("/:id/results", async (req, res) => {
  const monitor = await findOwnedMonitor(req.auth!.accountId, req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found" });

  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const results = await prisma.checkResult.findMany({
    where: { monitorId: monitor.id },
    orderBy: { checkedAt: "desc" },
    take: limit,
  });

  res.json(results);
});

monitorsRouter.get("/:id/incidents", async (req, res) => {
  const monitor = await findOwnedMonitor(req.auth!.accountId, req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found" });

  const incidents = await prisma.incident.findMany({
    where: { monitorId: monitor.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  res.json(incidents);
});
