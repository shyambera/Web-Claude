import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export interface HttpCheckResult {
  ok: boolean;
  httpCode: number | null;
  responseTimeMs: number;
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  errorMessage: string | null;
}

/**
 * Performs a single HTTP check with a DNS/connect/TLS/TTFB timing breakdown,
 * per the Response Time Monitoring module in the spec (Section 3.3).
 */
export function performHttpCheck(targetUrl: string, timeoutMs = 10000): Promise<HttpCheckResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      resolve({
        ok: false,
        httpCode: null,
        responseTimeMs: 0,
        dnsMs: null,
        connectMs: null,
        tlsMs: null,
        ttfbMs: null,
        errorMessage: "Invalid target URL",
      });
      return;
    }

    const client = url.protocol === "https:" ? https : http;
    const start = process.hrtime.bigint();
    let dnsAt: bigint | null = null;
    let connectAt: bigint | null = null;
    let tlsAt: bigint | null = null;

    const toMs = (a: bigint, b: bigint) => Math.max(0, Math.round(Number(b - a) / 1e6));
    let settled = false;
    const settle = (result: HttpCheckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = client.request(
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: { "User-Agent": "monitoring-saas-checker/0.1" },
        timeout: timeoutMs,
      },
      (res) => {
        const ttfbAt = process.hrtime.bigint();
        res.on("data", () => {
          // Drain the body; content is not needed for uptime checking.
        });
        res.on("end", () => {
          const end = process.hrtime.bigint();
          settle({
            ok: true,
            httpCode: res.statusCode ?? null,
            responseTimeMs: toMs(start, end),
            dnsMs: dnsAt ? toMs(start, dnsAt) : null,
            connectMs: dnsAt && connectAt ? toMs(dnsAt, connectAt) : connectAt ? toMs(start, connectAt) : null,
            tlsMs: connectAt && tlsAt ? toMs(connectAt, tlsAt) : null,
            ttfbMs: toMs(start, ttfbAt),
            errorMessage: null,
          });
        });
      }
    );

    req.on("socket", (socket) => {
      socket.once("lookup", () => {
        dnsAt = process.hrtime.bigint();
      });
      socket.once("connect", () => {
        connectAt = process.hrtime.bigint();
      });
      socket.once("secureConnect", () => {
        tlsAt = process.hrtime.bigint();
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on("error", (err) => {
      const end = process.hrtime.bigint();
      settle({
        ok: false,
        httpCode: null,
        responseTimeMs: toMs(start, end),
        dnsMs: dnsAt ? toMs(start, dnsAt) : null,
        connectMs: null,
        tlsMs: null,
        ttfbMs: null,
        errorMessage: err.message,
      });
    });

    req.end();
  });
}
