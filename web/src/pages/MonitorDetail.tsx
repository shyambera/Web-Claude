import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { CheckResult, Incident, Monitor } from "../api";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";
}

function formatDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function daysRemainingLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      const [m, r, i] = await Promise.all([
        api.getMonitor(id),
        api.getMonitorResults(id, 50),
        api.getMonitorIncidents(id),
      ]);
      setMonitor(m);
      setResults(r);
      setIncidents(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load monitor");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleToggleActive() {
    if (!monitor) return;
    const updated = await api.updateMonitor(monitor.id, { isActive: !monitor.isActive });
    setMonitor({ ...monitor, ...updated });
  }

  async function handleDelete() {
    if (!monitor) return;
    if (!confirm(`Delete monitor "${monitor.name}"? This cannot be undone.`)) return;
    await api.deleteMonitor(monitor.id);
    navigate("/");
  }

  if (error) return <div className="page form-error">{error}</div>;
  if (!monitor) return <div className="page loading">Loading…</div>;

  const isHttp = monitor.type === "HTTP";
  const isSsl = monitor.type === "SSL";

  const chartData = [...results]
    .reverse()
    .map((r) => ({
      time: new Date(r.checkedAt).toLocaleTimeString(),
      responseTimeMs: r.responseTimeMs ?? 0,
    }));

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/">Monitors</Link> / {monitor.name}
      </div>
      <div className="detail-header">
        <div>
          <h1>{monitor.name}</h1>
          {isHttp || isSsl ? (
            <a href={monitor.targetUrl} target="_blank" rel="noreferrer">
              {monitor.targetUrl}
            </a>
          ) : (
            <span>{monitor.targetUrl}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <StatusBadge status={monitor.stats?.lastStatus} />
          <button className="btn btn-secondary" onClick={handleToggleActive}>
            {monitor.isActive ? "Pause" : "Resume"}
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {isHttp && (
        <div className="stat-grid">
          <div className="card stat-card">
            <div className="label">Uptime (24h)</div>
            <div className="value">
              {monitor.stats?.uptimePercent != null ? `${monitor.stats.uptimePercent.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="card stat-card">
            <div className="label">Checks (24h)</div>
            <div className="value">{monitor.stats?.totalChecks ?? 0}</div>
          </div>
          <div className="card stat-card">
            <div className="label">Check interval</div>
            <div className="value">{monitor.checkIntervalSec}s</div>
          </div>
          <div className="card stat-card">
            <div className="label">MTTR</div>
            <div className="value">
              {monitor.stats?.mttrSeconds != null ? `${Math.round(monitor.stats.mttrSeconds)}s` : "—"}
            </div>
          </div>
        </div>
      )}

      {!isHttp && (
        <div className="stat-grid">
          <div className="card stat-card">
            <div className="label">{isSsl ? "Certificate expires in" : "Domain expires in"}</div>
            <div className="value">
              {daysRemainingLabel(isSsl ? monitor.stats?.certDaysRemaining : monitor.stats?.domainDaysRemaining)}
            </div>
          </div>
          <div className="card stat-card">
            <div className="label">Expiry date</div>
            <div className="value" style={{ fontSize: 16 }}>
              {formatDate(isSsl ? monitor.stats?.certExpiresAt ?? null : monitor.stats?.domainExpiresAt ?? null)}
            </div>
          </div>
          <div className="card stat-card">
            <div className="label">{isSsl ? "Issuer" : "Registrar"}</div>
            <div className="value" style={{ fontSize: 16 }}>
              {(isSsl ? monitor.stats?.certIssuer : monitor.stats?.registrar) ?? "—"}
            </div>
          </div>
          <div className="card stat-card">
            <div className="label">Check interval</div>
            <div className="value">{Math.round(monitor.checkIntervalSec / 3600)}h</div>
          </div>
        </div>
      )}

      {isHttp && (
        <div className="section">
          <h2>Response time</h2>
          <div className="card chart-card">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 11 }} unit="ms" width={56} />
                  <Tooltip />
                  <Line type="monotone" dataKey="responseTimeMs" stroke="#2e74b5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="loading">Not enough data yet — check back after a couple of checks.</div>
            )}
          </div>
        </div>
      )}

      <div className="section">
        <h2>Incidents</h2>
        <div className="card">
          {incidents.length === 0 ? (
            <div className="empty-state">No incidents recorded.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Cause</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>{formatDateTime(incident.startedAt)}</td>
                    <td>{formatDuration(incident.startedAt, incident.resolvedAt)}</td>
                    <td>{incident.cause}</td>
                    <td>{incident.resolvedAt ? "Resolved" : "Ongoing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Recent checks</h2>
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                {isHttp && (
                  <>
                    <th>HTTP code</th>
                    <th>Response time</th>
                  </>
                )}
                {isSsl && (
                  <>
                    <th>Days remaining</th>
                    <th>Issuer</th>
                  </>
                )}
                {!isHttp && !isSsl && (
                  <>
                    <th>Days remaining</th>
                    <th>Registrar</th>
                  </>
                )}
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.checkedAt)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  {isHttp && (
                    <>
                      <td>{r.httpCode ?? "—"}</td>
                      <td>{r.responseTimeMs != null ? `${r.responseTimeMs}ms` : "—"}</td>
                    </>
                  )}
                  {isSsl && (
                    <>
                      <td>{r.certDaysRemaining ?? "—"}</td>
                      <td>{r.certIssuer ?? "—"}</td>
                    </>
                  )}
                  {!isHttp && !isSsl && (
                    <>
                      <td>{r.domainDaysRemaining ?? "—"}</td>
                      <td>{r.registrar ?? "—"}</td>
                    </>
                  )}
                  <td>{r.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
