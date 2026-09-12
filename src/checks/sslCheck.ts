import tls from "node:tls";
import { URL } from "node:url";

export interface SslCheckResult {
  ok: boolean;
  expiresAt: Date | null;
  daysRemaining: number | null;
  issuer: string | null;
  fingerprint256: string | null;
  authorizationError: string | null;
  errorMessage: string | null;
}

/**
 * Opens a TLS connection and reads the peer certificate's notAfter date,
 * issuer, and SHA-256 fingerprint (spec Section 3.4–3.5). Validation is
 * intentionally not enforced (rejectUnauthorized: false) — an expired or
 * otherwise invalid certificate is exactly what this check exists to catch,
 * so the handshake must complete and the cert must still be readable even
 * when Node would otherwise refuse it. `authorizationError` carries Node's
 * verdict as informational context rather than a hard failure.
 */
export function performSslCheck(targetUrl: string, timeoutMs = 10000): Promise<SslCheckResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      resolve({
        ok: false,
        expiresAt: null,
        daysRemaining: null,
        issuer: null,
        fingerprint256: null,
        authorizationError: null,
        errorMessage: "Invalid target URL",
      });
      return;
    }

    const port = url.port ? Number(url.port) : 443;
    const host = url.hostname;
    let settled = false;
    const settle = (result: SslCheckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const socket = tls.connect(
      { host, port, servername: host, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const authorizationError = socket.authorized ? null : String(socket.authorizationError ?? "unknown");
        socket.end();

        if (!cert || Object.keys(cert).length === 0 || !cert.valid_to) {
          settle({
            ok: false,
            expiresAt: null,
            daysRemaining: null,
            issuer: null,
            fingerprint256: null,
            authorizationError,
            errorMessage: "Server did not return a certificate",
          });
          return;
        }

        const expiresAt = new Date(cert.valid_to);
        const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const issuerField = cert.issuer?.O ?? cert.issuer?.CN;
        const issuer = Array.isArray(issuerField)
          ? issuerField[0] ?? null
          : issuerField ?? (cert.issuer ? JSON.stringify(cert.issuer) : null);

        settle({
          ok: true,
          expiresAt,
          daysRemaining,
          issuer,
          fingerprint256: cert.fingerprint256 ?? null,
          authorizationError,
          errorMessage: null,
        });
      }
    );

    socket.on("timeout", () => {
      socket.destroy(new Error(`TLS connection timed out after ${timeoutMs}ms`));
    });

    socket.on("error", (err) => {
      settle({
        ok: false,
        expiresAt: null,
        daysRemaining: null,
        issuer: null,
        fingerprint256: null,
        authorizationError: null,
        errorMessage: err.message,
      });
    });
  });
}
