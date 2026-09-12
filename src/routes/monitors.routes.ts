import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { requireAuth } from "../middleware/requireAuth";
import { computeUptimeStats } from "../services/monitor.service";

export const monitorsRouter = Router();
monitorsRouter.use(requireAuth);

// A bare registrable domain, e.g. "example.com" or "my-shop.co.in" — no
// scheme, path, or port. Domain-expiry monitors (spec Section 3.6) query
// RDAP directly by this name rather than a URL.
const DOMAIN_NAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

const baseMonitorFields = {
  name: z.string().min(1).max(200),
  checkIntervalSec: z.number().int().min(30).max(86400).default(300),
  consecutiveFailureThreshold: z.number().int().min(1).max(10).default(2),
};

const createMonitorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HTTP"),
    targetUrl: z.string().url(),
    expectedStatusCode: z.number().int().min(100).max(599).default(200),
    responseTimeThresholdMs: z.number().int().min(100).max(60000).default(3000),
    ...baseMonitorFields,
  }),
  z.object({
    type: z.literal("SSL"),
    targetUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), "SSL monitors must target an https:// URL"),
    ...baseMonitorFields,
  }),
  z.object({
    type: z.literal("DOMAIN"),
    targetUrl: z
      .string()
      .regex(DOMAIN_NAME_PATTERN, "Enter a bare domain name, e.g. example.com — no https:// or path"),
    ...baseMonitorFields,
  }),
]);

// Updates don't re-discriminate by type (type is immutable after creation
// in this UI) — this covers pause/resume and threshold tweaks generically.
const updateMonitorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetUrl: z.string().min(1).max(300).optional(),
  checkIntervalSec: z.number().int().min(30).max(86400).optional(),
  expectedStatusCode: z.number().int().min(100).max(599).optional(),
  responseTimeThresholdMs: z.number().int().min(100).max(60000).optional(),
  consecutiveFailureThreshold: z.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
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
