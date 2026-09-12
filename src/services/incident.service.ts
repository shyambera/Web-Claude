import { CheckStatus, Monitor } from "@prisma/client";
import { prisma } from "../lib/db";
import { HttpCheckResult } from "../checks/httpCheck";
import { AlertRecipient } from "../alerting/dispatch";
import { evaluateIncidentState } from "./incidentState.service";

function deriveStatus(monitor: Monitor, result: HttpCheckResult): CheckStatus {
  const statusMismatch = !result.ok || result.httpCode !== monitor.expectedStatusCode;
  if (statusMismatch) return "DOWN";
  if (result.responseTimeMs > monitor.responseTimeThresholdMs) return "DEGRADED";
  return "UP";
}

/**
 * Persists an HTTP check result and hands it to the shared incident state
 * machine.
 */
export async function recordCheckAndHandleIncident(
  monitor: Monitor,
  recipient: AlertRecipient,
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

  const cause =
    result.errorMessage ??
    `Unexpected response: expected HTTP ${monitor.expectedStatusCode}, got ${result.httpCode ?? "no response"}`;

  await evaluateIncidentState(monitor, status, cause, recipient);
}
