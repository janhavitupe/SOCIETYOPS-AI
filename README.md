# SocietyOps AI

AI-powered maintenance coordination for Indian housing societies and RWAs.

## Tech Stack

- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4, TanStack Router and Query, shadcn/ui
- **Backend**: Express 5 + TypeScript, Zod request validation
- **AI**: Groq (OpenAI-compatible API, `openai` SDK)
- **Database**: PostgreSQL 16 via Prisma 7 ORM
- **Background jobs**: pg-boss (runs on the same PostgreSQL)
- **Photos**: S3-compatible object storage with signed URLs (local disk in development)
- **Security**: Helmet, CORS whitelist, rate limiting
- **Observability**: Winston (JSON in production) with a request id on every line, Sentry

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
npm run db:up
```

### 3. Run database migrations

```bash
npm run prisma:migrate
```

### 4. Seed demo data

```bash
npm run prisma:seed
```

### 5. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Development Commands

| Command                                   | Description                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run dev`                             | API and Vite dev server on port 3000              |
| `npm test`                                | API tests against the database in `DATABASE_URL`  |
| `npm run typecheck`                       | TypeScript, no output                             |
| `npm run lint`                            | ESLint                                            |
| `npm run format` / `npm run format:check` | Prettier                                          |
| `npm run build`                           | Production build of the SPA and the server bundle |

## Database Management

| Command                   | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `npm run db:up`           | Start PostgreSQL + PgAdmin via Docker Compose      |
| `npm run db:down`         | Stop containers                                    |
| `npm run db:reset`        | Drop and recreate the `societyops` database        |
| `npm run prisma:generate` | Regenerate Prisma client after schema changes      |
| `npm run prisma:migrate`  | Apply pending migrations (development)             |
| `npm run prisma:deploy`   | Apply migrations (production CI/CD)                |
| `npm run prisma:seed`     | Seed demo data (residents, vendors, tickets, logs) |

### PgAdmin

- URL: `http://localhost:5050`
- Email: `admin@srerwa.org`
- Password: `admin123`
- Add server: Host `localhost`, Port `5432`, User `societyops`, Password `societyops_dev`

## Environment Variables

| Variable                    | Required       | Default                                                                          | Description                                                                                                                                                          |
| --------------------------- | -------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Yes            | `postgresql://societyops:societyops_dev@localhost:5432/societyops?schema=public` | PostgreSQL connection string                                                                                                                                         |
| `JWT_SECRET`                | Yes (prod)     | `dev-secret-change-me-in-production-and-keep-it-long-at-least-32-chars`          | JWT signing secret                                                                                                                                                   |
| `GROQ_API_KEY`              | No             | -                                                                                | Groq API key for AI chat. Without one every reply comes from the deterministic fallback engine; `/api/chat` reports `source` so you can tell which answered.         |
| `GROQ_MODEL`                | No             | `qwen/qwen3.8-27b`                                                               | Chat model. This is the only Groq model that accepts images, so a text-only model will reject messages carrying a photo.                                             |
| `TWILIO_ACCOUNT_SID`        | No             | -                                                                                | Set all three Twilio values to deliver notifications for real. Without them messages are recorded with status `Simulated`, never `Sent`.                             |
| `TWILIO_AUTH_TOKEN`         | No             | -                                                                                | Twilio auth token                                                                                                                                                    |
| `TWILIO_FROM_NUMBER`        | No             | -                                                                                | Sending number in E.164, e.g. `+14155238886`                                                                                                                         |
| `FOLLOWUP_INTERVAL_MINUTES` | No             | `5`                                                                              | Minutes between follow-up agent cycles, scheduled through the job queue. `0` turns the schedule off; the dashboard button still works.                               |
| `S3_BUCKET`                 | No (prod: yes) | -                                                                                | Photo storage bucket. Set it and the other `S3_*` values (see `.env.example`) for any S3-compatible store. Without it photos are kept in `UPLOAD_DIR` on local disk. |
| `UPLOAD_DIR`                | No             | `uploads`                                                                        | Local photo directory, used only without `S3_BUCKET`.                                                                                                                |
| `SENTRY_DSN`                | No             | -                                                                                | Server error tracking. Request bodies, cookies and query strings are never sent.                                                                                     |
| `VITE_SENTRY_DSN`           | No             | -                                                                                | Browser error tracking; read when the frontend is built.                                                                                                             |
| `ALLOWED_ORIGINS`           | No             | `http://localhost:3000,http://localhost:5173`                                    | CORS whitelist                                                                                                                                                       |
| `PORT`                      | No             | `3000`                                                                           | Server port                                                                                                                                                          |
| `BACKUP_BUCKET`             | No             | -                                                                                | S3/GCS bucket for automated backups                                                                                                                                  |
| `BACKUP_PROVIDER`           | No             | -                                                                                | `aws` or `gcs`                                                                                                                                                       |

## Backup & Restore

### Local backup

```bash
# Windows
.\scripts\backup.ps1

# Linux / Mac
bash scripts/backup.sh
```

Backups are stored in `./backups/` and automatically pruned after 30 days.

### Cloud backup (S3 or GCS)

```bash
# AWS S3
$env:BACKUP_PROVIDER="aws"
$env:BACKUP_BUCKET="my-societyops-backups"
.\scripts\backup.ps1

# GCS
export BACKUP_PROVIDER="gcs"
export BACKUP_BUCKET="my-societyops-backups"
bash scripts/backup.sh
```

### Restore

```bash
# From local backup
gunzip -c backups/societyops-20260802-021300.sql.gz | psql $DATABASE_URL

# From S3
aws s3 cp s3://my-societyops-backups/backups/societyops-20260802-021300.sql.gz - | gunzip | psql $DATABASE_URL

# From GCS
gcloud storage cp gs://my-societyops-backups/backups/societyops-20260802-021300.sql.gz - | gunzip | psql $DATABASE_URL
```

### Automated schedule

Add to crontab (`crontab -e`):

```
0 2 * * * DATABASE_URL="postgresql://..." bash /path/to/societyops-ai/scripts/backup.sh >> /var/log/societyops-backup.log 2>&1
```

For Windows, use Task Scheduler to run `powershell -File scripts\backup.ps1` daily at 02:00.

## Production Deployment

### Managed PostgreSQL options

| Provider              | Connection String Example                                                          |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Neon** (serverless) | `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/societyops?sslmode=require` |
| **Supabase**          | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres`                      |
| **AWS RDS**           | `postgresql://user:pass@rds-xxx.xxx.us-east-1.rds.amazonaws.com:5432/societyops`   |
| **GCP Cloud SQL**     | Via Cloud SQL Proxy or private IP                                                  |

### Production checklist

1. Set `DATABASE_URL` with `?sslmode=require` (or provider equivalent).
2. Set `connection_limit` in `DATABASE_URL` query params (e.g., `?connection_limit=5`).
3. Run `npm run prisma:deploy` in CI/CD (not `prisma migrate dev`).
4. Run `npm run prisma:seed` only on fresh databases, not on every deploy.
5. Enable automated backups on the provider (daily snapshots, 7-30 day retention).
6. Set `NODE_ENV=production` in the server environment.
7. Ensure `JWT_SECRET` is a strong random string (not the dev fallback).

### Build for production

```bash
npm run build
npm run start
```

`npm start` runs in production mode by default; the bundle sets `NODE_ENV=production` unless it is already set. The server uses `PORT` exactly and exits if the port is taken.

### Docker

The `Dockerfile` builds in two stages and ships only production dependencies. On start the container runs `prisma migrate deploy` and then the server.

```bash
cp .env.example .env.production   # fill in JWT_SECRET, S3_*, GROQ_API_KEY ...
$env:POSTGRES_PASSWORD = "a-strong-password"   # PowerShell; use export on Linux
docker compose -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` runs the app with PostgreSQL. For a managed database, remove the `postgres` service and set `DATABASE_URL` in `.env.production`.

The photo bucket needs a CORS rule allowing `PUT` and `GET` from the app's origin, because browsers upload straight to it.

## Schema Overview

| Model              | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `Ticket`           | Maintenance requests with status, urgency, vendor assignment, and timeline |
| `TimelineEvent`    | Individual events in a ticket's lifecycle                                  |
| `Vendor`           | Registered maintenance vendors with ratings and skills                     |
| `NotificationLog`  | Dispatch logs (WhatsApp, SMS, Push)                                        |
| `AgentActivityLog` | AI agent action audit trail                                                |
| `SocietyProfile`   | Society configuration (singleton)                                          |
| `ResidentProfile`  | Resident accounts with roles and access tokens                             |
| `ResidentPassword` | Password hashes (separated from profile for security)                      |

Every table includes `createdAt`, `updatedAt`, and `deletedAt` for soft deletes and traceability.

## Demo Accounts

| Flat               | Name               | Password    | Role        |
| ------------------ | ------------------ | ----------- | ----------- |
| B-402              | Vikram Mehta       | `vikram123` | Resident    |
| A-101              | Mrs. Ananya Sharma | `ananya123` | Resident    |
| Maintenance Office | Mr. Arvind Sharma  | `arvind123` | Maintenance |
| Admin              | Admin Desk         | `admin123`  | Admin       |

## API Endpoints

| Method  | Endpoint                    | Description                     |
| ------- | --------------------------- | ------------------------------- |
| `GET`   | `/api/health`               | Health check                    |
| `GET`   | `/api/tickets`              | List tickets (supports filters) |
| `GET`   | `/api/tickets/:id`          | Get single ticket               |
| `POST`  | `/api/tickets`              | Create ticket                   |
| `PATCH` | `/api/tickets/:id`          | Update ticket                   |
| `POST`  | `/api/tickets/:id/assign`   | Assign vendor                   |
| `POST`  | `/api/tickets/:id/escalate` | Escalate ticket                 |
| `POST`  | `/api/tickets/:id/close`    | Close ticket                    |
| `GET`   | `/api/vendors`              | List vendors                    |
| `GET`   | `/api/notifications`        | List notification logs          |
| `GET`   | `/api/logs`                 | List agent activity logs        |
| `GET`   | `/api/analytics`            | Daily analytics report          |
| `POST`  | `/api/chat`                 | AI chat endpoint                |
| `POST`  | `/api/auth/register`        | Register resident               |
| `POST`  | `/api/auth/login`           | Login resident                  |
| `GET`   | `/api/auth/me`              | Get current user profile        |
