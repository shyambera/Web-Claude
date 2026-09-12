# Website & Domain Monitoring SaaS — Phases 1–2

Implementation of the Phase 1–2 scope defined in
`Monitoring-SaaS-Technical-Specification.docx` (Section 10, Build Roadmap).

**Phase 1:** auth + accounts, monitor CRUD, a scheduler + queue + HTTP
uptime/status/response-time worker, results storage, a dashboard with
uptime %, and email alerts.

**Phase 2:** SSL certificate expiry + unexpected-change detection, domain
registration expiry via RDAP, and WhatsApp/SMS alert channels alongside
email.

## Architecture

Three processes, one Postgres database, one Redis instance:

- **API** (`src/server.ts`) — Express REST API: auth, monitor CRUD, results,
  incidents, account settings.
- **Scheduler** (`src/scheduler.ts`) — polls Postgres for monitors whose
  `nextRunAt` has elapsed, enqueues a BullMQ job per due monitor onto the
  queue matching its type, and advances `nextRunAt`.
- **Worker** (`src/worker.ts`) — one BullMQ worker per monitor type
  (`http-check`, `ssl-check`, `domain-check`), each running its own check
  and handing the result to the shared incident state machine
  (`src/services/incidentState.service.ts`):
  - **HTTP** — DNS/connect/TLS/TTFB timing breakdown; opens an incident
    after N consecutive failures, resolves + sends a recovery alert on the
    first success.
  - **SSL** — reads the peer certificate over a raw TLS handshake (no
    validation enforced — an expired cert is exactly what this catches);
    alerts at 30/14/7/1 days to expiry and on any unexpected fingerprint
    change (`src/services/expiry.service.ts`, `snapshots` table).
  - **Domain** — RDAP lookup (via the `rdap.org` bootstrap aggregator, so
    no per-TLD server map to maintain); alerts at 60/30/14/7 days to expiry.
  - Expiry alerts are deduplicated per threshold via `expiry_alert_states`
    (unique on monitor + kind + threshold + target date), so a daily check
    doesn't resend the same warning — a renewed cert/domain gets a new
    target date and alerts fresh from the top.
- **Alerting** (`src/alerting/`) — `dispatch.ts` fans one alert out to every
  channel the account has configured: email always
  (`email.ts`), WhatsApp + SMS when the account has a phone number on file
  (`whatsapp.ts`, `sms.ts`, via Twilio). Each unconfigured channel logs to
  the console instead of sending — convenient for local development.
- **Dashboard** (`web/`) — React + Vite SPA: monitor list with live uptime %
  or expiry countdown depending on type, a per-monitor detail page
  (response-time chart for HTTP; expiry date/issuer/registrar for
  SSL/domain), an account-wide incident feed, and a Settings page for the
  alert phone number.

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

Without SMTP configured (`SMTP_HOST` unset), alert emails are logged to the
worker's console instead of sent. Without `TWILIO_ACCOUNT_SID`/
`TWILIO_AUTH_TOKEN` configured, WhatsApp/SMS alerts do the same — set a
phone number on the account (Settings page, or `PATCH /api/account`) to see
them fire in the console even without Twilio credentials.

## Scope notes

- Monitor types: HTTP, SSL, DOMAIN. DNS/nameserver and broken-link
  monitoring are Phase 3–4 (spec Section 10) and will extend `MonitorType`
  and reuse the `snapshots` table already in place for change detection.
- WhatsApp/SMS use Twilio. India deployments should swap `sms.ts` for an
  MSG91 adapter — Twilio's generic API doesn't handle the DLT sender-ID and
  template registration Indian carriers require (spec Section 9.2).
- Uptime % and MTTR are computed from `check_results`/`incidents` directly
  rather than from a dedicated time-series store (TimescaleDB/ClickHouse)
  — fine at MVP volume; swap in per spec Section 9.1 when check volume
  grows.
- The RDAP domain-expiry check calls `rdap.org` as a bootstrap aggregator
  rather than maintaining a per-TLD RDAP server map — the messiest part of
  this module per spec Section 9.3. A production deployment should budget
  time to evaluate a paid WHOIS/RDAP aggregator for rate-limit headroom.

## Verification

Both phases' full pipelines (signup → monitor creation → scheduler →
worker → check result → incident open/resolve → expiry alert → dashboard)
were run end-to-end against local Postgres/Redis instances and a real
browser session during development, including real TLS certificate reads
against live HTTPS endpoints and the RDAP parsing logic validated against
a realistic sample payload; see commit history for details.
