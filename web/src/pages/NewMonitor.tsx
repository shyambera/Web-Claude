import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MonitorType } from "../api";
import { api } from "../api";

const TYPE_INFO: Record<MonitorType, { label: string; blurb: string; placeholder: string; defaultInterval: number }> = {
  HTTP: {
    label: "Website (HTTP)",
    blurb: "Uptime, HTTP status, and response time.",
    placeholder: "https://example.com",
    defaultInterval: 300,
  },
  SSL: {
    label: "SSL certificate",
    blurb: "Expiry countdown and unexpected certificate changes.",
    placeholder: "https://example.com",
    defaultInterval: 86400,
  },
  DOMAIN: {
    label: "Domain expiry",
    blurb: "Registration expiry via RDAP/WHOIS.",
    placeholder: "example.com",
    defaultInterval: 86400,
  },
};

export function NewMonitor() {
  const navigate = useNavigate();
  const [type, setType] = useState<MonitorType>("HTTP");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [checkIntervalSec, setCheckIntervalSec] = useState(300);
  const [expectedStatusCode, setExpectedStatusCode] = useState(200);
  const [responseTimeThresholdMs, setResponseTimeThresholdMs] = useState(3000);
  const [consecutiveFailureThreshold, setConsecutiveFailureThreshold] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleTypeChange(next: MonitorType) {
    setType(next);
    setCheckIntervalSec(TYPE_INFO[next].defaultInterval);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const monitor = await api.createMonitor({
        type,
        name,
        targetUrl,
        checkIntervalSec,
        ...(type === "HTTP" ? { expectedStatusCode, responseTimeThresholdMs } : {}),
        consecutiveFailureThreshold,
      });
      navigate(`/monitors/${monitor.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create monitor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="breadcrumb">
        <Link to="/">Monitors</Link> / New monitor
      </div>
      <div className="page-header">
        <h1>Add monitor</h1>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 24 }}>
        <div className="field">
          <label htmlFor="type">Monitor type</label>
          <select id="type" value={type} onChange={(e) => handleTypeChange(e.target.value as MonitorType)}>
            {(Object.keys(TYPE_INFO) as MonitorType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_INFO[t].label}
              </option>
            ))}
          </select>
          <div className="hint">{TYPE_INFO[type].blurb}</div>
        </div>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing site" />
        </div>

        <div className="field">
          <label htmlFor="targetUrl">{type === "DOMAIN" ? "Domain name" : "URL to monitor"}</label>
          <input
            id="targetUrl"
            type={type === "DOMAIN" ? "text" : "url"}
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder={TYPE_INFO[type].placeholder}
          />
          {type === "DOMAIN" && <div className="hint">Bare domain only — no https:// or path.</div>}
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="interval">Check interval (seconds)</label>
            <input
              id="interval"
              type="number"
              min={30}
              max={86400}
              required
              value={checkIntervalSec}
              onChange={(e) => setCheckIntervalSec(Number(e.target.value))}
            />
          </div>
          {type === "HTTP" && (
            <>
              <div className="field">
                <label htmlFor="expectedCode">Expected HTTP status code</label>
                <input
                  id="expectedCode"
                  type="number"
                  min={100}
                  max={599}
                  required
                  value={expectedStatusCode}
                  onChange={(e) => setExpectedStatusCode(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="threshold">Slow-response threshold (ms)</label>
                <input
                  id="threshold"
                  type="number"
                  min={100}
                  required
                  value={responseTimeThresholdMs}
                  onChange={(e) => setResponseTimeThresholdMs(Number(e.target.value))}
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="failThreshold">Consecutive failures to alert</label>
            <input
              id="failThreshold"
              type="number"
              min={1}
              max={10}
              required
              value={consecutiveFailureThreshold}
              onChange={(e) => setConsecutiveFailureThreshold(Number(e.target.value))}
            />
            <div className="hint">
              {type === "HTTP" ? "How many failed checks before an outage alert." : "How many failed lookups before an alert."}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create monitor"}
          </button>
          <Link to="/" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
