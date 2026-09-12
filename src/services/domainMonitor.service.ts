import { Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { performDomainCheck } from "../checks/domainCheck";
import { AlertRecipient } from "../alerting/dispatch";
import { evaluateIncidentState } from "./incidentState.service";
import { maybeAlertExpiry, DOMAIN_EXPIRY_THRESHOLDS_DAYS } from "./expiry.service";

export async function runDomainCheck(monitor: Monitor, recipient: AlertRecipient): Promise<void> {
  const result = await performDomainCheck(monitor.targetUrl);

  const status = result.ok ? "UP" : "DOWN";

  await prisma.checkResult.create({
    data: {
      monitorId: monitor.id,
      status,
      errorMessage: result.errorMessage,
      domainExpiresAt: result.expiresAt,
      domainDaysRemaining: result.daysRemaining,
      registrar: result.registrar,
    },
  });

  await evaluateIncidentState(monitor, status, result.errorMessage ?? "RDAP lookup failed", recipient);

  if (!result.ok || !result.expiresAt || result.daysRemaining === null) {
    return;
  }

  await maybeAlertExpiry(
    monitor,
    recipient,
    "domain_expiry",
    result.expiresAt,
    result.daysRemaining,
    DOMAIN_EXPIRY_THRESHOLDS_DAYS,
    (thresholdDays) =>
      result.daysRemaining! <= 0
        ? `[EXPIRED] ${monitor.name} domain registration has expired`
        : `[DOMAIN] ${monitor.name} expires in ${thresholdDays} days`,
    () =>
      `The domain registration for ${monitor.name} (${monitor.targetUrl}) ${
        result.daysRemaining! <= 0 ? "has expired" : `expires in ${result.daysRemaining} day(s)`
      }, on ${result.expiresAt!.toISOString().slice(0, 10)}.\n\nRegistrar: ${result.registrar ?? "unknown"}\n\nRenew it before it lapses — an expired domain can be lost or squatted.`
  );
}
