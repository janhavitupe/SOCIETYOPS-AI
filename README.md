# SocietyOps AI

AI-powered maintenance coordination for Indian housing societies and RWAs.

## Tech Stack

- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4
- **Backend**: Express 4 + TypeScript
- **AI**: Google Gemini (`@google/genai`)
- **Database**: PostgreSQL 16 via Prisma 7 ORM
- **Security**: Helmet, CORS whitelist, rate limiting, xss-clean, hpp
- **Logging**: Winston + Morgan

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

## Database Management

| Command | Description |
|---------|-------------|
| `npm run db:up` | Start PostgreSQL + PgAdmin via Docker Compose |
| `npm run db:down` | Stop containers |
| `npm run db:reset` | Drop and recreate the `societyops` database |
| `npm run prisma:generate` | Regenerate Prisma client after schema changes |
| `npm run prisma:migrate` | Apply pending migrations (development) |
| `npm run prisma:deploy` | Apply migrations (production CI/CD) |
| `npm run prisma:seed` | Seed demo data (residents, vendors, tickets, logs) |

### PgAdmin

- URL: `http://localhost:5050`
- Email: `admin@srerwa.org`
- Password: `admin123`
- Add server: Host `localhost`, Port `5432`, User `societyops`, Password `societyops_dev`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://societyops:societyops_dev@localhost:5432/societyops?schema=public` | PostgreSQL connection string |
| `JWT_SECRET` | Yes (prod) | `dev-secret-change-me-in-production-and-keep-it-long-at-least-32-chars` | JWT signing secret |
| `GEMINI_API_KEY` | No | - | Google Gemini API key for AI chat. Without a valid key every reply comes from the deterministic fallback engine; the response reports `source` so you can tell which answered. |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Model id used for chat. Override if the default does not resolve. |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://localhost:5173` | CORS whitelist |
| `PORT` | No | `3000` | Server port |
| `BACKUP_BUCKET` | No | - | S3/GCS bucket for automated backups |
| `BACKUP_PROVIDER` | No | - | `aws` or `gcs` |

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

| Provider | Connection String Example |
|----------|---------------------------|
| **Neon** (serverless) | `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/societyops?sslmode=require` |
| **Supabase** | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| **AWS RDS** | `postgresql://user:pass@rds-xxx.xxx.us-east-1.rds.amazonaws.com:5432/societyops` |
| **GCP Cloud SQL** | Via Cloud SQL Proxy or private IP |

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

## Schema Overview

| Model | Description |
|-------|-------------|
| `Ticket` | Maintenance requests with status, urgency, vendor assignment, and timeline |
| `TimelineEvent` | Individual events in a ticket's lifecycle |
| `Vendor` | Registered maintenance vendors with ratings and skills |
| `NotificationLog` | Dispatch logs (WhatsApp, SMS, Push) |
| `AgentActivityLog` | AI agent action audit trail |
| `SocietyProfile` | Society configuration (singleton) |
| `ResidentProfile` | Resident accounts with roles and access tokens |
| `ResidentPassword` | Password hashes (separated from profile for security) |

Every table includes `createdAt`, `updatedAt`, and `deletedAt` for soft deletes and traceability.

## Demo Accounts

| Flat | Name | Password | Role |
|------|------|----------|------|
| B-402 | Vikram Mehta | `vikram123` | Resident |
| A-101 | Mrs. Ananya Sharma | `ananya123` | Resident |
| Maintenance Office | Mr. Arvind Sharma | `arvind123` | Maintenance |
| Admin | Admin Desk | `admin123` | Admin |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/tickets` | List tickets (supports filters) |
| `GET` | `/api/tickets/:id` | Get single ticket |
| `POST` | `/api/tickets` | Create ticket |
| `PATCH` | `/api/tickets/:id` | Update ticket |
| `POST` | `/api/tickets/:id/assign` | Assign vendor |
| `POST` | `/api/tickets/:id/escalate` | Escalate ticket |
| `POST` | `/api/tickets/:id/close` | Close ticket |
| `GET` | `/api/vendors` | List vendors |
| `GET` | `/api/notifications` | List notification logs |
| `GET` | `/api/logs` | List agent activity logs |
| `GET` | `/api/analytics` | Daily analytics report |
| `POST` | `/api/chat` | AI chat endpoint |
| `POST` | `/api/auth/register` | Register resident |
| `POST` | `/api/auth/login` | Login resident |
| `GET` | `/api/auth/me` | Get current user profile |
