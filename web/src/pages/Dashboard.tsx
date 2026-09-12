import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Monitor } from "../api";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";

const TYPE_LABEL: Record<Monitor["type"], string> = { HTTP: "HTTP", SSL: "SSL", DOMAIN: "Domain" };

function formatUptime(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct.toFixed(2)}%`;
}

function formatDaysRemaining(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  return `${days}d`;
}

function formatLastChecked(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function Dashboard() {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setMonitors(await api.listMonitors());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load monitors");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Monitors</h1>
        <Link to="/monitors/new" className="btn btn-primary">
          + Add monitor
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!monitors && !error && <div className="loading">Loading monitors…</div>}

      {monitors && monitors.length === 0 && (
        <div className="card empty-state">
          <p>You don't have any monitors yet.</p>
          <Link to="/monitors/new" className="btn btn-primary">
            Add your first monitor
          </Link>
        </div>
      )}

      {monitors && monitors.length > 0 && (
        <div className="card monitor-list">
          {monitors.map((monitor, idx) => (
            <div
              key={monitor.id}
              className="monitor-row"
              style={{ borderTop: idx > 0 ? "1px solid var(--border)" : undefined }}
            >
              <div>
                <Link to={`/monitors/${monitor.id}`} className="name" style={{ color: "var(--text)" }}>
                  {monitor.name}
                </Link>{" "}
                <span style={{ fontSize: 11, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
                  {TYPE_LABEL[monitor.type]}
                </span>
                <div className="url">{monitor.targetUrl}</div>
              </div>
              <div className="metrics">
                {monitor.type === "HTTP" ? (
                  <div className="metric">
                    <div className="value">{formatUptime(monitor.stats?.uptimePercent)}</div>
                    <div className="label">Uptime (24h)</div>
                  </div>
                ) : (
                  <div className="metric">
                    <div className="value">
                      {formatDaysRemaining(
                        monitor.type === "SSL" ? monitor.stats?.certDaysRemaining : monitor.stats?.domainDaysRemaining
                      )}
                    </div>
                    <div className="label">{monitor.type === "SSL" ? "Cert expires" : "Domain expires"}</div>
                  </div>
                )}
                <div className="metric">
                  <div className="value">{formatLastChecked(monitor.stats?.lastCheckedAt)}</div>
                  <div className="label">Last checked</div>
                </div>
                <StatusBadge status={monitor.stats?.lastStatus} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
