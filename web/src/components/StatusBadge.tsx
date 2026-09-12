type Status = "UP" | "DOWN" | "DEGRADED" | null | undefined;

const LABELS: Record<string, string> = {
  UP: "Up",
  DOWN: "Down",
  DEGRADED: "Degraded",
};

export function StatusBadge({ status }: { status: Status }) {
  const cls = status ? status.toLowerCase() : "unknown";
  const label = status ? LABELS[status] : "No data";
  return (
    <span className={`status-badge ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
