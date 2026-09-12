import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Incident } from "../api";
import { api } from "../api";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function Incidents() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listIncidents()
      .then(setIncidents)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load incidents"));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Incidents</h1>
      </div>

      {error && <div className="form-error">{error}</div>}
      {!incidents && !error && <div className="loading">Loading…</div>}

      {incidents && incidents.length === 0 && (
        <div className="card empty-state">No incidents recorded across your monitors yet.</div>
      )}

      {incidents && incidents.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Monitor</th>
                <th>Started</th>
                <th>Cause</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link to={`/monitors/${incident.monitorId}`}>{incident.monitor?.name ?? incident.monitorId}</Link>
                  </td>
                  <td>{formatDateTime(incident.startedAt)}</td>
                  <td>{incident.cause}</td>
                  <td>{incident.resolvedAt ? "Resolved" : "Ongoing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
