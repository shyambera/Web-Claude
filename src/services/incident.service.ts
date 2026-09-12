import { CheckStatus, Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { HttpCheckResult } from "../checks/httpCheck";
import { sendAlertEmail } from "../alerting/email";

type MonitorWithOwnerEmail = Monitor & { ownerEmail: string };

function deriveStatus(monitor: Monitor, result: HttpCheckResult): CheckStatus {
  const statusMismatch = !result.ok || result.httpCode !== monitor.expectedStatusCode;
  if (statusMismatch) return "DOWN";
  if (result.responseTimeMs > monitor.responseTimeThresholdMs) return "DEGRADED";
  return "UP";
}

/**
 * Persists a check result and applies the flap-resistant incident state
 * machine: an incident opens only after N consecutive DOWN checks (per
 * monitor.consecutiveFailureThreshold) and closes on the first non-DOWN
 * check that follows, matching the alerting engine design in spec Section 4.
 */
export async function recordCheckAndHandleIncident(
  monitor: MonitorWithOwnerEmail,
  result: HttpCheckResult
): Promise<void> {
  const status = deriveStatus(monitor, result);

  await prisma.checkResult.create({
    data: {
      monitorId: monitor.id,
      status,
      httpCode: result.httpCode,
      responseTimeMs: result.responseTimeMs,
      dnsMs: result.dnsMs,
      connectMs: result.connectMs,
      tlsMs: result.tlsMs,
      ttfbMs: result.ttfbMs,
      errorMessage: result.errorMessage,
    },
  });

  const [recentResults, openIncident] = await Promise.all([
    prisma.checkResult.findMany({
      where: { monitorId: monitor.id },
      orderBy: { checkedAt: "desc" },
      take: monitor.consecutiveFailureThreshold,
    }),
    prisma.incident.findFirst({ where: { monitorId: monitor.id, resolvedAt: null } }),
  ]);

  const hitFailureThreshold =
    recentResults.length === monitor.consecutiveFailureThreshold &&
    recentResults.every((r) => r.status === "DOWN");

  if (status === "DOWN" && hitFailureThreshold && !openIncident) {
    const cause =
      result.errorMessage ??
      `Unexpected response: expected HTTP ${monitor.expectedStatusCode}, got ${result.httpCode ?? "no response"}`;
    const incident = await prisma.incident.create({ data: { monitorId: monitor.id, cause } });
    await dispatchAlert(monitor, "DOWN", cause, incident.id);
  } else if (status !== "DOWN" && openIncident) {
    await prisma.incident.update({ where: { id: openIncident.id }, data: { resolvedAt: new Date() } });
    await dispatchAlert(monitor, "RECOVERED", "Monitor returned to a healthy state", openIncident.id);
  }
}

async function dispatchAlert(
  monitor: MonitorWithOwnerEmail,
  kind: "DOWN" | "RECOVERED",
  detail: string,
  incidentId: string
) {
  const subject =
    kind === "DOWN"
      ? `[DOWN] ${monitor.name} is unreachable`
      : `[RECOVERED] ${monitor.name} is back up`;

  const text =
    kind === "DOWN"
      ? `${monitor.name} (${monitor.targetUrl}) failed ${monitor.consecutiveFailureThreshold} consecutive checks.\n\nReason: ${detail}`
      : `${monitor.name} (${monitor.targetUrl}) has recovered.\n\n${detail}`;

  const result = await sendAlertEmail(monitor.ownerEmail, subject, text);

  await prisma.alertLog.create({
    data: {
      monitorId: monitor.id,
      incidentId,
      channel: "EMAIL",
      recipient: monitor.ownerEmail,
      subject,
      status: result.status,
    },
  });
}
