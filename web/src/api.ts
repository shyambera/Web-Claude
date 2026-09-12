const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type MonitorType = "HTTP" | "SSL" | "DOMAIN";

export interface MonitorStats {
  uptimePercent: number | null;
  totalChecks: number;
  downChecks: number;
  lastCheckedAt: string | null;
  lastStatus: "UP" | "DOWN" | "DEGRADED" | null;
  mttrSeconds: number | null;
  certExpiresAt: string | null;
  certDaysRemaining: number | null;
  certIssuer: string | null;
  domainExpiresAt: string | null;
  domainDaysRemaining: number | null;
  registrar: string | null;
}

export interface Monitor {
  id: string;
  name: string;
  type: MonitorType;
  targetUrl: string;
  checkIntervalSec: number;
  expectedStatusCode: number;
  responseTimeThresholdMs: number;
  consecutiveFailureThreshold: number;
  isActive: boolean;
  nextRunAt: string;
  createdAt: string;
  stats?: MonitorStats;
}

export interface CheckResult {
  id: string;
  checkedAt: string;
  status: "UP" | "DOWN" | "DEGRADED";
  errorMessage: string | null;
  httpCode: number | null;
  responseTimeMs: number | null;
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  certExpiresAt: string | null;
  certDaysRemaining: number | null;
  certIssuer: string | null;
  certFingerprint: string | null;
  domainExpiresAt: string | null;
  domainDaysRemaining: number | null;
  registrar: string | null;
}

export interface Account {
  id: string;
  name: string;
  planTier: string;
  alertPhoneNumber: string | null;
}

export interface Incident {
  id: string;
  monitorId: string;
  startedAt: string;
  resolvedAt: string | null;
  cause: string;
  monitor?: { id: string; name: string; targetUrl: string };
}

export interface AuthResponse {
  token: string;
  user: { id: string; name: string; email: string };
  account: { id: string; name: string; planTier: string };
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ? JSON.stringify(body.error) : res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  signup: (data: { name: string; email: string; password: string; accountName: string }) =>
    request<AuthResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),

  listMonitors: () => request<Monitor[]>("/api/monitors"),

  getMonitor: (id: string) => request<Monitor>(`/api/monitors/${id}`),

  createMonitor: (data: Partial<Monitor> & { type: MonitorType; name: string; targetUrl: string }) =>
    request<Monitor>("/api/monitors", { method: "POST", body: JSON.stringify(data) }),

  updateMonitor: (id: string, data: Partial<Monitor>) =>
    request<Monitor>(`/api/monitors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteMonitor: (id: string) => request<void>(`/api/monitors/${id}`, { method: "DELETE" }),

  getMonitorResults: (id: string, limit = 100) =>
    request<CheckResult[]>(`/api/monitors/${id}/results?limit=${limit}`),

  getMonitorIncidents: (id: string) => request<Incident[]>(`/api/monitors/${id}/incidents`),

  listIncidents: () => request<Incident[]>("/api/incidents"),

  getAccount: () => request<Account>("/api/account"),

  updateAccount: (data: { alertPhoneNumber: string | null }) =>
    request<Account>("/api/account", { method: "PATCH", body: JSON.stringify(data) }),
};
