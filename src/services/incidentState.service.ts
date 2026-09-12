import { CheckStatus, Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { dispatchAlert, AlertRecipient } from "../alerting/dispatch";

/**
 * Flap-resistant incident state machine, shared across every monitor type:
 * an incident opens only after N consecutive DOWN checks
 * (monitor.consecutiveFailureThreshold) and closes on the first non-DOWN
 * check that follows, per the alerting engine design in spec Section 4.
 * "DOWN" means the check itself failed to reach its target — unreachable
 * host, connection refused, TLS handshake failure, RDAP lookup failure —
 * as distinct from an expiry warning, which is threshold-based (see
 * expiry.service.ts) rather than consecutive-failure-based.
 */
export async function evaluateIncidentState(
  monitor: Monitor,
  status: CheckStatus,
  causeIfDown: string,
  recipient: AlertRecipient
): Promise<void> {
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
    const incident = await prisma.incident.create({ data: { monitorId: monitor.id, cause: causeIfDown } });
    await dispatchAlert({
      monitorId: monitor.id,
      incidentId: incident.id,
      recipient,
      subject: `[DOWN] ${monitor.name} is unreachable`,
      text: `${monitor.name} (${monitor.targetUrl}) failed ${monitor.consecutiveFailureThreshold} consecutive checks.\n\nReason: ${causeIfDown}`,
    });
  } else if (status !== "DOWN" && openIncident) {
    await prisma.incident.update({ where: { id: openIncident.id }, data: { resolvedAt: new Date() } });
    await dispatchAlert({
      monitorId: monitor.id,
      incidentId: openIncident.id,
      recipient,
      subject: `[RECOVERED] ${monitor.name} is back up`,
      text: `${monitor.name} (${monitor.targetUrl}) has recovered.\n\nMonitor returned to a healthy state.`,
    });
  }
}
