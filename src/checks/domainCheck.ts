import https from "node:https";

export interface DomainCheckResult {
  ok: boolean;
  expiresAt: Date | null;
  daysRemaining: number | null;
  registrar: string | null;
  errorMessage: string | null;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, unknown[][]];
  handle?: string;
}

interface RdapDomainResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  errorCode?: number;
  title?: string;
}

function fetchJson(url: string, redirectsLeft = 5): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { Accept: "application/rdap+json, application/json", "User-Agent": "monitoring-saas-checker/0.1" }, timeout: 10000 },
      (res) => {
        const { statusCode = 0, headers } = res;

        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(headers.location, url).toString();
          fetchJson(nextUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );

    req.on("timeout", () => req.destroy(new Error("RDAP request timed out")));
    req.on("error", reject);
  });
}

export function extractRegistrarName(entities: RdapEntity[] | undefined): string | null {
  const registrar = entities?.find((e) => e.roles?.includes("registrar"));
  if (!registrar) return null;

  // vcardArray looks like ["vcard", [["version",{},"text","4.0"], ["fn",{},"text","Example Registrar, Inc."], ...]]
  const fnField = registrar.vcardArray?.[1]?.find((field) => Array.isArray(field) && field[0] === "fn");
  if (Array.isArray(fnField) && typeof fnField[3] === "string") return fnField[3];

  return registrar.handle ?? null;
}

/**
 * Looks up a domain's registration expiry via RDAP (spec Section 3.6),
 * using rdap.org as a bootstrap aggregator so we don't have to maintain a
 * per-TLD RDAP server map ourselves — the exact engineering problem the
 * spec flags in Section 9.3 as the messiest part of this module.
 */
export async function performDomainCheck(domain: string): Promise<DomainCheckResult> {
  try {
    const { status, body } = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`);

    if (status === 404) {
      return { ok: false, expiresAt: null, daysRemaining: null, registrar: null, errorMessage: "Domain not found in RDAP" };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, expiresAt: null, daysRemaining: null, registrar: null, errorMessage: `RDAP lookup failed with HTTP ${status}` };
    }

    const data = JSON.parse(body) as RdapDomainResponse;
    const expirationEvent = data.events?.find((e) => e.eventAction === "expiration");

    if (!expirationEvent?.eventDate) {
      return { ok: false, expiresAt: null, daysRemaining: null, registrar: null, errorMessage: "RDAP response had no expiration date" };
    }

    const expiresAt = new Date(expirationEvent.eventDate);
    const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return { ok: true, expiresAt, daysRemaining, registrar: extractRegistrarName(data.entities), errorMessage: null };
  } catch (err) {
    return {
      ok: false,
      expiresAt: null,
      daysRemaining: null,
      registrar: null,
      errorMessage: err instanceof Error ? err.message : "RDAP lookup failed",
    };
  }
}
