import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export function NewMonitor() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://");
  const [checkIntervalSec, setCheckIntervalSec] = useState(300);
  const [expectedStatusCode, setExpectedStatusCode] = useState(200);
  const [responseTimeThresholdMs, setResponseTimeThresholdMs] = useState(3000);
  const [consecutiveFailureThreshold, setConsecutiveFailureThreshold] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const monitor = await api.createMonitor({
        name,
        targetUrl,
        checkIntervalSec,
        expectedStatusCode,
        responseTimeThresholdMs,
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
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing site" />
        </div>
        <div className="field">
          <label htmlFor="targetUrl">URL to monitor</label>
          <input
            id="targetUrl"
            type="url"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
          />
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
