import { prisma } from "../lib/db";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface UptimeStats {
  uptimePercent: number | null;
  totalChecks: number;
  downChecks: number;
  lastCheckedAt: Date | null;
  lastStatus: "UP" | "DOWN" | "DEGRADED" | null;
  mttrSeconds: number | null;
}

export async function computeUptimeStats(
  monitorId: string,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<UptimeStats> {
  const since = new Date(Date.now() - windowMs);

  const [totalChecks, downChecks, lastResult, resolvedIncidents] = await Promise.all([
    prisma.checkResult.count({ where: { monitorId, checkedAt: { gte: since } } }),
    prisma.checkResult.count({ where: { monitorId, checkedAt: { gte: since }, status: "DOWN" } }),
    prisma.checkResult.findFirst({ where: { monitorId }, orderBy: { checkedAt: "desc" } }),
    prisma.incident.findMany({
      where: { monitorId, resolvedAt: { not: null }, startedAt: { gte: since } },
      select: { startedAt: true, resolvedAt: true },
    }),
  ]);

  const uptimePercent = totalChecks > 0 ? ((totalChecks - downChecks) / totalChecks) * 100 : null;

  let mttrSeconds: number | null = null;
  if (resolvedIncidents.length > 0) {
    const totalSeconds = resolvedIncidents.reduce((sum, incident) => {
      const resolvedAt = incident.resolvedAt as Date;
      return sum + (resolvedAt.getTime() - incident.startedAt.getTime()) / 1000;
    }, 0);
    mttrSeconds = totalSeconds / resolvedIncidents.length;
  }

  return {
    uptimePercent,
    totalChecks,
    downChecks,
    lastCheckedAt: lastResult?.checkedAt ?? null,
    lastStatus: lastResult?.status ?? null,
    mttrSeconds,
  };
}
