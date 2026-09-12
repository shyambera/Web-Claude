# Website & Domain Monitoring SaaS — Phase 1 MVP

Implementation of the Phase 1 MVP scope defined in
`Monitoring-SaaS-Technical-Specification.docx` (Section 10, Build Roadmap):
auth + accounts, monitor CRUD, a scheduler + queue + HTTP uptime/status/
response-time worker, results storage, a dashboard with uptime %, and
email alerts.

## Architecture

Three processes, one Postgres database, one Redis instance:

- **API** (`src/server.ts`) — Express REST API: auth, monitor CRUD, results,
  incidents.
- **Scheduler** (`src/scheduler.ts`) — polls Postgres for monitors whose
  `nextRunAt` has elapsed, enqueues a BullMQ job per due monitor, and
  advances `nextRunAt`.
- **Worker** (`src/worker.ts`) — consumes the queue, performs the HTTP check
  (with a DNS/connect/TLS/TTFB timing breakdown), stores the result, and
  runs the incident state machine (open an incident after N consecutive
  failures, close it and send a recovery alert on the first success).
- **Dashboard** (`web/`) — React + Vite SPA: monitor list with live uptime %,
  a per-monitor detail page with a response-time chart and incident log,
  and an account-wide incident feed.

See the spec document for the full system diagram and database schema this
implementation follows.

## Local development

Requires Node 20+, PostgreSQL, and Redis.

```bash
# 1. Start Postgres + Redis (or use the provided docker-compose.yml)
docker compose up -d

# 2. Install dependencies and configure environment
npm install
cp .env.example .env   # adjust DATABASE_URL/REDIS_URL if not using docker-compose

# 3. Run migrations
npm run prisma:migrate

# 4. (Optional) seed a demo account — demo@monitoring.local / password123
npm run seed

# 5. Run the three backend processes in separate terminals
npm run dev:api
npm run dev:scheduler
npm run dev:worker

# 6. Run the dashboard
cd web
npm install
cp .env.example .env
npm run dev
```

The dashboard runs at `http://localhost:5173` and talks to the API at
`http://localhost:4000` by default.

Without SMTP configured (`SMTP_HOST` unset in `.env`), alert emails are
logged to the worker's console instead of sent — convenient for local
development, matching the fallback described in spec Section 4.1.

## Scope notes

This is Phase 1 only, per the roadmap:

- Monitor type is HTTP only. SSL/certificate, domain/WHOIS, DNS/nameserver,
  and broken-link monitoring are Phase 2–4 (spec Section 10) and will add
  their own check workers, a `snapshots` table for change detection, and
  extend `MonitorType`.
- Alerting is email-only. WhatsApp/SMS channels are added in Phase 2.
- Uptime % and MTTR are computed from `check_results`/`incidents` directly
  rather than from a dedicated time-series store (TimescaleDB/ClickHouse)
  — fine at MVP volume; swap in per spec Section 9.1 when check volume
  grows.

## Verification

The full pipeline (signup → monitor creation → scheduler → worker →
check result → incident open → recovery → dashboard) was run end-to-end
against local Postgres/Redis instances and a real browser session during
development; see commit history for details.
