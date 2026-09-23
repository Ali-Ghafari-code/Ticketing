# سامانه پشتیبانی و تیکتینگ فارسی (Persian Helpdesk SaaS)

A production-oriented, multi-tenant **Persian (Farsi) RTL customer support & ticketing platform**, built to be sold to
companies and service providers as a SaaS product.

- **Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · TanStack Query · Axios · React Hook Form · Zod · Lucide · TipTap · Recharts
- **Backend:** FastAPI · SQLAlchemy 2 · Pydantic v2 · Alembic · JWT + refresh-token rotation · RBAC
- **Database:** MySQL 8 (MariaDB 10.6+ compatible) · phpMyAdmin
- **Integrations:** Kavenegar SMS (پیامک کاوه‌نگار) · SMTP email · Excel / CSV / PDF export

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Quick start with Docker](#quick-start-with-docker)
5. [Manual installation](#manual-installation)
6. [Environment variables](#environment-variables)
7. [MySQL setup](#mysql-setup)
8. [phpMyAdmin setup](#phpmyadmin-setup)
9. [Database migrations](#database-migrations)
10. [Running the backend](#running-the-backend)
11. [Running the frontend](#running-the-frontend)
12. [Kavenegar SMS configuration](#kavenegar-sms-configuration)
13. [Email configuration](#email-configuration)
14. [Production deployment](#production-deployment)
15. [API documentation](#api-documentation)
16. [Security model](#security-model)
17. [Testing](#testing)
18. [Demo credentials (development only)](#demo-credentials-development-only)

---

## Features

| Area | Highlights |
| --- | --- |
| **Roles** | Super Admin, Company Admin, Support Manager, Support Agent, Customer + **custom roles** built from 43 granular permissions (`tickets.view`, `tickets.assign`, `reports.export`, `settings.update`, …) |
| **Auth** | Register, login (email **or** Iranian mobile, Persian digits accepted), logout / logout everywhere, forgot/reset password (email link or **SMS code**), change password, email/phone verification codes, session list & revoke, account lockout, rate limiting |
| **Multi-tenancy** | Company branding (logo, colours, working hours, support settings), subscription plans with limits, strict per-company data isolation, super-admin "enter company" context switch |
| **Tickets** | Number sequence per company (`PT-1024`), customisable statuses & priorities, hierarchical categories, departments, tags, due date, attachments, SLA status, escalation levels, reopen tracking, soft delete, full change history |
| **Conversation** | Customer replies, agent replies, **internal notes** (clearly separated, never visible to customers), `@mentions`, rich-text editor, read/unread receipts, message search, edit/delete with time window & permissions, image/PDF preview, secure downloads, draft autosave |
| **Ticket list** | Search (number, subject, customer name/mobile), filters (status, priority, category incl. children, department, agent, customer, tags, SLA, date range), sorting, pagination, **column customisation** (saved per user), inline quick-edit of status/priority/assignee, bulk actions, mobile card layout |
| **Assignment** | Category default agent → department strategy: **round-robin**, **least-loaded**, or manual; category → department auto-routing |
| **SLA** | Priority- and department-based rules, first-response & resolution targets, business hours, holidays, pause while waiting for customer, warning threshold, live countdown with icon + text indicators, background breach detection & notifications |
| **Notifications** | In-app (bell + page), email, SMS for new ticket, reply, assignment, status change, escalation, SLA warning/breach, resolved, closed, mentions — per-user and per-company channel settings |
| **Customer portal** | Dashboard, my tickets, create ticket (with **knowledge base suggestions** while typing), ticket conversation, 1–5 star rating & feedback, KB, searchable FAQ, notifications, profile |
| **Dashboards** | Agent workspace (assigned, unassigned, new, pending, overdue, SLA breaches, waiting for customer/support + charts) and admin dashboard (totals, today/week/month, response & resolution times, SLA compliance, satisfaction) |
| **Reports** | By date, department, agent, category, priority, status; response/resolution times; SLA performance; satisfaction (by agent, department, trend, feedback); closed & reopened tickets — all filterable, exportable to **Excel, CSV, PDF** (Persian-shaped PDF with Vazirmatn font) |
| **Excel** | Export tickets, customers, agents, reports · Import customers, users, categories with template download, validation, preview, duplicate detection, error report |
| **Knowledge base / FAQ** | Categories, articles (rich text, tags, featured, draft/published), search, most viewed, helpful / not helpful, related articles · FAQ categories, publish toggle, reorder |
| **Audit log** | Login/logout/failed logins, token reuse, ticket create/update/status/priority/assignment/escalation/delete, message edit/delete, user/customer/role/permission/settings changes, imports/exports — with user, IP, user agent, diff |
| **UI/UX** | Fully RTL, Vazirmatn font, Jalali (شمسی) dates and date picker, Persian digits, light/dark/system theme (saved to the account), responsive (drawer sidebar, card tables, bottom navigation on mobile), skeletons, empty states, toasts, confirmation dialogs, `Ctrl+K` global search |

## Architecture

```
┌──────────────────────────┐        HTTPS (JSON, Bearer access token)        ┌───────────────────────────────┐
│  Next.js 15 (App Router) │ ───────────────────────────────────────────────▶│  FastAPI                       │
│  - TanStack Query cache  │ ◀── httpOnly refresh cookie (path=/api/auth) ───│  api/        → routers (HTTP)   │
│  - Axios + auto refresh  │                                                  │  services/   → business logic   │
│  - Zustand (auth/ui)     │                                                  │  repositories→ tenant-scoped DB │
└──────────────────────────┘                                                  │  models/     → SQLAlchemy ORM   │
                                                                              │  core/       → security, RBAC,  │
                                                                              │                rate limit, jobs │
                                                                              └───────┬───────────────┬────────┘
                                                                                      │               │ after-commit
                                                                               MySQL 8 (utf8mb4)   background tasks
                                                                                                   ├─ SMS provider (Kavenegar)
                                                                                                   └─ SMTP email
```

**Layering (backend)**

- `app/api/*/router.py` — HTTP only: request parsing, dependency injection, response models.
- `app/api/deps.py` — authentication (`get_current_user`), **tenant resolution** (`Tenant`) and permission guards (`require_permissions`, `require_platform`).
- `app/services/*` — business rules (tickets, SLA engine, assignment, notifications, reports, import/export, auth).
- `app/repositories/*` — `TenantRepository.scoped()` always filters by `company_id` (and `deleted_at`), the single choke point for tenant isolation.
- `app/services/sms/*`, `app/services/email/*` — provider abstractions; business code never calls Kavenegar or SMTP directly.
- `app/core/tasks.py` — side effects (email/SMS) are queued with `run_after_commit` and executed in a worker pool only after the DB transaction commits. The interface is intentionally tiny so it can be replaced by Celery/RQ/Arq.
- `app/core/scheduler.py` — periodic SLA scan and auto-close of resolved tickets (disable with `ENABLE_SCHEDULER=false` on all but one instance when scaling horizontally).

**Frontend**

- `app/(auth)` login/register/forgot/reset · `app/(staff)` agent & admin panel · `app/portal` customer portal.
- `features/<domain>/api.ts` — typed TanStack Query hooks per domain, with query-key based invalidation.
- `components/ui` — reusable design system: `DataTable`, `Modal`, `Drawer`, `Button`, `Input`, `Select`, `DatePicker` (Jalali), `Badge`, `Avatar`, `Dropdown`, `Pagination`, `FileUploader`, `RichTextEditor` (TipTap + mentions), `Tabs`, `Skeleton`, `EmptyState`, `ConfirmDialog`…
- `components/tickets` — `TicketStatusBadge`, `PriorityBadge`, `SlaIndicator`, `TicketTable`, conversation, reply box, ticket form. `components/layout` — `NotificationDropdown`, sidebar, global search.

## Project structure

```
.
├── backend
│   ├── alembic/                 # migrations (0001 = full schema)
│   ├── app
│   │   ├── api/                 # auth, users, companies, tickets, departments, categories,
│   │   │                        # notifications, reports, knowledge_base, settings, search, files
│   │   ├── assets/fonts/        # Vazirmatn (OFL) for Persian PDF exports
│   │   ├── config/              # pydantic-settings
│   │   ├── core/                # security, permissions catalogue, exceptions, rate limit, tasks, scheduler
│   │   ├── database/            # engine/session, base & mixins
│   │   ├── middleware/          # request id, secure headers, global rate limit
│   │   ├── models/              # 35 tables
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── services/            # tickets, sla, assignment, notifications, sms/, email/, reports, exporter, importer…
│   │   ├── templates/email/     # RTL HTML email templates (Jinja2)
│   │   ├── utils/               # persian text, jalali, business hours, files, html sanitising
│   │   ├── main.py
│   │   └── seed.py
│   ├── tests/                   # end-to-end API tests
│   ├── requirements.txt
│   └── .env.example
├── frontend
│   ├── app/                     # (auth), (staff), portal
│   ├── components/              # ui, layout, tickets, charts, kb, users, common
│   ├── features/                # API hooks per domain
│   ├── hooks/  lib/  store/  types/
│   └── .env.example
├── deploy/nginx.conf
└── docker-compose.yml
```

Database tables: `companies, plans, holidays, system_settings, users, roles, permissions, role_permissions, user_roles,
departments, department_users, tickets, ticket_messages, ticket_message_mentions, ticket_attachments, ticket_statuses,
ticket_priorities, ticket_categories, ticket_tags, ticket_tag_relations, ticket_activities, ticket_reads, sla_rules,
notifications, notification_settings, knowledge_base_categories, knowledge_base_articles, knowledge_base_feedback,
faq_categories, faqs, customer_ratings, audit_logs, sessions, password_resets, verification_codes`.
UUID primary keys, foreign keys with explicit `ON DELETE` rules, unique constraints (e.g. ticket number per company),
soft delete where history matters, and composite indexes tuned for ticket filtering
(`company_id + status/priority/agent/customer/department/category/created_at/sla_status`).

## Quick start with Docker

```bash
cp backend/.env.example backend/.env
# set strong JWT secrets:
python3 -c "import secrets;print(secrets.token_urlsafe(64))"   # paste into JWT_SECRET_KEY
python3 -c "import secrets;print(secrets.token_urlsafe(64))"   # paste into JWT_REFRESH_SECRET

docker compose up -d --build
docker compose exec backend python -m app.seed      # optional: demo company, users, tickets, KB, FAQ
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| API + Swagger | http://localhost:8000/docs |
| phpMyAdmin | http://localhost:8080 (user `ticketing` / `ticketing`) |

## Manual installation

Requirements: **Python 3.11+**, **Node.js 20+**, **MySQL 8.0+** (or MariaDB 10.6+).

```bash
git clone <repo> && cd Ticketing

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # requirements-dev.txt adds pytest
cp .env.example .env                        # edit DATABASE_URL and secrets

# Frontend
cd ../frontend
npm ci
cp .env.example .env.local
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy URL, e.g. `mysql+pymysql://user:pass@host:3306/ticketing?charset=utf8mb4` | local MySQL |
| `JWT_SECRET_KEY` | Secret for signing access tokens (≥ 32 random chars, **required in production**) | dev placeholder |
| `JWT_REFRESH_SECRET` | Key used to HMAC refresh/reset tokens at rest | dev placeholder |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | Token lifetimes | `15` / `14` |
| `REFRESH_COOKIE_SECURE` / `REFRESH_COOKIE_SAMESITE` / `REFRESH_COOKIE_DOMAIN` | Refresh cookie flags (`true` / `lax`/`strict` in production) | `false` / `lax` |
| `FRONTEND_URL` | Used in email/SMS links | `http://localhost:3000` |
| `CORS_ORIGINS` | Comma separated allowed origins | `http://localhost:3000` |
| `TRUSTED_PROXIES` | Trust `X-Forwarded-For` (only behind your own proxy) | `false` |
| `KAVENEGAR_API_KEY` / `KAVENEGAR_SENDER` | Kavenegar credentials | – |
| `SMS_PROVIDER` | `kavenegar`, `console` (log only) or `disabled` | `console` |
| `KAVENEGAR_USE_VERIFY_LOOKUP` | Use Kavenegar Verify Lookup templates | `false` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP server | – / `587` |
| `SMTP_USE_TLS` / `SMTP_USE_SSL` / `EMAIL_FROM` / `EMAIL_FROM_NAME` | Email transport & sender | `true` / `false` |
| `EMAIL_PROVIDER` | `smtp`, `console` or `disabled` | `console` |
| `UPLOAD_DIR` / `MAX_UPLOAD_SIZE_MB` / `MAX_FILES_PER_MESSAGE` | Private attachment storage | `./storage/uploads` / `10` / `5` |
| `MAX_LOGIN_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | Brute-force protection | `5` / `15` |
| `RATE_LIMIT_DEFAULT` / `RATE_LIMIT_AUTH` / `REDIS_URL` | Rate limits (Redis for multi-instance) | `300/minute` / `10/minute` |
| `ENABLE_SCHEDULER` / `SLA_CHECK_INTERVAL_SECONDS` | Background SLA monitor | `true` / `60` |

### Frontend (`frontend/.env.local`)

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public URL of the API including `/api`, e.g. `http://localhost:8000/api` |
| `NEXT_PUBLIC_DEFAULT_COMPANY` | Company slug used on `/register` when no `?company=` is given |

Only `NEXT_PUBLIC_*` values reach the browser; no secret is ever exposed to the frontend.

## MySQL setup

```sql
CREATE DATABASE ticketing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ticketing'@'%' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON ticketing.* TO 'ticketing'@'%';
FLUSH PRIVILEGES;
```

Set `DATABASE_URL=mysql+pymysql://ticketing:change-me@localhost:3306/ticketing?charset=utf8mb4`.
`utf8mb4` is mandatory for Persian text (the migration also enforces it on the database). All timestamps are stored in UTC;
the UI renders them in the Jalali calendar and the company timezone (default `Asia/Tehran`) is used for SLA business hours and reports.

## phpMyAdmin setup

- **Docker:** included in `docker-compose.yml` → http://localhost:8080, server `mysql`, login with the MySQL user.
- **Standalone:** `docker run -d -p 8080:80 -e PMA_HOST=<mysql-host> phpmyadmin:5`, or install the distro package
  (`apt install phpmyadmin`) and point it at your MySQL server. Restrict phpMyAdmin to trusted IPs / VPN in production.

## Database migrations

```bash
cd backend
alembic upgrade head                                   # create / upgrade schema
alembic revision --autogenerate -m "describe change"   # after changing models
alembic upgrade head --sql > schema.sql                # offline SQL (e.g. for DBAs)
python -m app.seed                                     # demo data (idempotent)
python -m app.seed --reset                             # DEV ONLY: drop everything, recreate, seed
```

## Running the backend

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Health check: `GET /api/health`. Periodic jobs (SLA warnings/breaches, auto-closing resolved tickets) run inside the API
process when `ENABLE_SCHEDULER=true`.

## Running the frontend

```bash
cd frontend
npm run dev          # http://localhost:3000
npm run build && npm start   # production build (output: standalone)
npm run typecheck && npm run lint
```

## Kavenegar SMS configuration

1. Create an account at [kavenegar.com](https://kavenegar.com), copy the **API key** and your dedicated **sender line**.
2. In `backend/.env`:
   ```env
   SMS_PROVIDER=kavenegar
   KAVENEGAR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   KAVENEGAR_SENDER=1000xxxxxxxx
   ```
3. *(Recommended for OTP/password reset)* Define **Verify Lookup** templates in the Kavenegar panel with these names and
   set `KAVENEGAR_USE_VERIFY_LOOKUP=true`:
   `verify`, `password-reset`, `ticket-created`, `ticket-assigned`, `ticket-reply`, `ticket-resolved`, `ticket-closed`,
   `sla-warning`, `sla-breached` (token = code / ticket number).
4. Otherwise free-text templates are sent; company admins can customise them in **تنظیمات ← پیامک** and send a test SMS.

Implementation: `app/services/sms/` — `SmsProvider` interface, `KavenegarProvider`, `ConsoleSmsProvider` (dev), templates
and `SmsService`. Adding another Iranian provider (e.g. Ghasedak, SMS.ir) only requires a new provider class.

## Email configuration

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=support@example.com
SMTP_PASSWORD=********
SMTP_USE_TLS=true
EMAIL_FROM=support@example.com
EMAIL_FROM_NAME=پشتیبانی شرکت نمونه
```

RTL HTML templates live in `backend/app/templates/email/` (new ticket, reply, assignment, status change, escalation,
resolved, closed, SLA warning/breach, mention, password reset, verification code, welcome). Companies can override
subjects and intro text in **تنظیمات ← ایمیل** and send a test email. With `EMAIL_PROVIDER=console` emails are only logged.

## Production deployment

1. Provision MySQL 8 (utf8mb4), create DB/user, back it up regularly.
2. Backend: set `ENVIRONMENT=production`, strong `JWT_*` secrets (startup refuses weak ones), `REFRESH_COOKIE_SECURE=true`,
   `CORS_ORIGINS=https://app.example.com`, `FRONTEND_URL`, SMTP & Kavenegar, `TRUSTED_PROXIES=true` behind nginx.
   Run `alembic upgrade head` then `uvicorn app.main:app --workers 4 --proxy-headers` (or the provided Dockerfile).
   Persist `UPLOAD_DIR` on a volume; it is never served publicly — attachments are streamed only through
   permission-checked endpoints.
3. Horizontal scaling: set `REDIS_URL` for shared rate limiting and enable `ENABLE_SCHEDULER` on exactly one instance.
4. Frontend: `NEXT_PUBLIC_API_URL=https://app.example.com/api npm run build`, run `node .next/standalone/server.js` (or the Dockerfile).
5. Put both behind nginx on one origin (`deploy/nginx.conf`): `/api` → FastAPI, `/` → Next.js, TLS + HSTS, `client_max_body_size`.
6. Create the first tenant from the super-admin panel (**سازمان‌ها ← سازمان جدید**) or run the seed for a demo.

## API documentation

FastAPI serves interactive docs automatically:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

Key endpoints (all under `/api`):

```
POST /auth/login | /auth/register | /auth/refresh | /auth/logout | /auth/forgot-password | /auth/reset-password
POST /auth/change-password | /auth/verify/send | /auth/verify/confirm      GET /auth/me | /auth/sessions
GET  /tickets  (q, status_id[], state, priority_id[], category_id, department_id, agent, customer_id, tag_id[],
                sla_status[], date_from, date_to, overdue, escalated, sort, direction, page, page_size)
POST /tickets  (multipart: payload JSON + files[])        GET /tickets/meta | /tickets/stats | /tickets/export?fmt=xlsx|csv|pdf
GET|PUT|DELETE /tickets/{id}     POST /tickets/bulk | /tickets/{id}/escalate | /close | /reopen | /read | /rating
GET|POST /tickets/{id}/messages  PUT|DELETE /tickets/{id}/messages/{mid}
GET|POST /tickets/{id}/attachments   GET /attachments/{id}?inline=true   GET /tickets/{id}/activities
GET /customers | /users | /agents | /mentionable | /roles | /permissions      (+ CRUD, export, reset-password, activity)
GET /departments | /categories | /statuses | /priorities | /tags | /sla-rules | /holidays   (+ CRUD)
GET /dashboard | /reports/summary | /reports/tickets | /reports/sla | /reports/satisfaction | /reports/reopened
GET /reports/export?report=by_date|by_department|by_agent|by_category|by_priority|by_status|sla|satisfaction|closed|reopened&fmt=xlsx|csv|pdf
GET /notifications | /notifications/unread-count | /notifications/settings     POST /notifications/read-all
GET /kb/categories | /kb/articles | /kb/articles/{slug} | /kb/suggest?q=      POST /kb/articles/{slug}/feedback
GET /faq | /faq/categories        PUT /faq-order
GET /search?q=                     GET /audit-logs (+ /export)
GET|PUT /company | /settings/support   GET /settings/templates | /settings/integrations   POST /settings/sms/test | /settings/email/test
GET /import/{customers|users|categories}/template   POST /import/{kind}/preview | /import/{kind}/commit
Super admin: /companies (+ options, CRUD) | /plans | /platform/stats | /system/settings | /system/audit-logs
Public: GET /public/companies/{slug}
```

A super admin acts inside a tenant by sending the `X-Company-Id` header (the UI's company switcher does this).

**Error format** — every error uses the same envelope with a Persian message and no stack traces:

```json
{ "error": { "code": "validation_error", "message": "اطلاعات ارسالی معتبر نیست.",
             "details": [{ "field": "mobile", "message": "شماره موبایل معتبر نیست." }] },
  "request_id": "a1b2c3…" }
```

## Security model

- **Passwords:** bcrypt (cost 12) over a SHA-256 pre-hash; constant-time dummy check to prevent user enumeration.
- **Tokens:** short-lived JWT access token kept **in memory** only; opaque refresh token in an **httpOnly** cookie scoped
  to `/api/auth`, stored HMAC-hashed, **rotated on every refresh** with reuse detection (a replayed token revokes the whole
  login family). Password change/reset revokes other sessions. Every request re-checks the session, user and company status.
- **CSRF:** the only cookie-authenticated endpoint (`/auth/refresh`) requires the `X-Requested-With` header, which cross-site
  forms cannot send without a CORS preflight that the API rejects for untrusted origins; all other endpoints use Bearer tokens.
- **Authorization:** granular permission checks on every endpoint + per-ticket rights (`can` object); tenant isolation
  enforced in repositories/queries (`company_id` filter) — covered by tests (another tenant and another customer get 404).
- **Input:** Pydantic validation, ORM parameterised queries (no raw SQL with user input), `LIKE` wildcard escaping, rich text
  sanitised server-side with `nh3` (XSS), strict CSP on API responses and on the Next.js app.
- **Uploads:** extension allow-list **and** magic-byte verification, size limits, random server-side names, storage outside
  the web root, downloads only via permission-checked endpoints with `nosniff` and a sandboxing CSP.
- **Abuse:** global and auth-specific rate limits, login lockout after repeated failures, OTP attempt limits.
- **Headers:** HSTS (production), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP.
- **Audit:** security and business events recorded with user, IP and user agent.

## Testing

```bash
cd backend && pip install -r requirements-dev.txt && pytest -q     # API tests on an isolated SQLite DB
ruff check app tests
cd ../frontend && npm run typecheck && npm run lint && npm run build
```

The API test-suite covers login (incl. Persian digits), refresh rotation & CSRF header, customer ticket lifecycle
(XSS sanitising, category auto-routing, SLA, attachments & file-type rejection), **tenant and customer isolation**,
internal notes hidden from customers, mentions, status automation, rating, ticket filters/quick update/bulk,
agent visibility limits, Excel/CSV/PDF exports, reports & dashboards, KB/FAQ/search, Excel import with duplicate detection,
super-admin company context, custom roles and SMS password reset.

## Demo credentials (development only)

Created by `python -m app.seed`. **Never run the seed on a production database.**

| Role | Login | Password |
| --- | --- | --- |
| Super Admin (مدیر کل سامانه) | `superadmin@helpdesk.local` | `Admin@12345` |
| Company Admin (مدیر سازمان) | `admin@demo.local` | `Demo@12345` |
| Support Manager (مدیر پشتیبانی) | `manager@demo.local` | `Demo@12345` |
| Support Agent (کارشناس) | `agent@demo.local` (also `agent2` … `agent5@demo.local`) | `Demo@12345` |
| Customer (مشتری) | `customer@demo.local` (also `customer2` … `customer10@demo.local`) or mobile `09124444401` | `Demo@12345` |
| Second tenant admin (isolation demo) | `admin@ava.local` | `Demo@12345` |

Demo company slug: `demo` → customer self-registration at `/register?company=demo`.
The seed also creates 6 departments, a two-level category tree, 7 tags, SLA rules per priority, Iranian holidays,
42 tickets with conversations/internal notes/ratings, 8 knowledge-base articles and 6 FAQs.

---

Font: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) (SIL Open Font License) — bundled for PDF exports.
