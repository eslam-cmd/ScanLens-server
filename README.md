# ScanLens Backend

Backend API for ScanLens, built with NestJS, TypeScript, Prisma, and PostgreSQL. It handles authentication, scan requests, subscription rules, reports, and background scan jobs using BullMQ and Redis.

> Frontend: [ScanLens Client](https://github.com/eslam-cmd/ScanLens-client)  
> Interview and code walkthrough: [Backend and Networking Guide](../docs/BACKEND_NETWORK_INTERVIEW_GUIDE.md)

## What the backend does

- Registers users, verifies email OTPs, and authenticates requests with JWT cookies or bearer tokens.
- Accepts security scans, checks user plan limits, and analyzes HTTP security headers.
- Runs registered users' scans through a BullMQ queue backed by Redis.
- Uses a worker to contact target websites, perform the scan, and save scan history in PostgreSQL.
- Provides scan status, history, statistics, and CSV/PDF exports.
- Manages plans, subscriptions, license keys, email notifications, and AI remediation.
- Schedules subscription maintenance and scan-retention cleanup.

## Architecture

```text
Next.js browser
    │ HTTP + JSON (cookie or bearer JWT)
    ▼
NestJS Controllers ── Guards ── Services
    ├── Prisma ── PostgreSQL (users, websites, scans, vulnerabilities, usage)
    └── BullMQ ── Redis (queued jobs and job state)
                       │
                       ▼
                 ScanProcessor worker
                       │ HTTPS request
                       ▼
                 Target website
```

The NestJS application currently hosts both the HTTP API and the BullMQ worker. The worker can be deployed as a separate process later if the application is configured to start a worker-only context.

### Scan request lifecycle

1. An authenticated user sends `POST /scans/direct-scan`.
2. `JwtAuthGuard` validates the user. The API checks the URL and plan limits.
3. `QueueService` adds a `scan` job to the `scan-queue` in Redis.
4. The API responds with **202 Accepted** and a `jobId`; the scan is not necessarily finished yet.
5. `ScanProcessor` consumes the job and calls `ScansService.scanUrl()`.
6. The service requests the target URL, analyzes headers and, for deep scans, TLS and CORS; it stores the scan and vulnerabilities for registered users.
7. The client polls `GET /scans/jobs/:jobId` until the status is `completed` or `failed`.

Guest requests use `POST /scans/guest-scan` and currently run synchronously; they do not use BullMQ. The guest scan counter is currently a browser-side convenience, not an authoritative server-side quota.

## Requirements

- Node.js 22 recommended (the project has been built with Node.js 22).
- npm.
- PostgreSQL accessible to the API.
- Redis accessible using the Redis protocol for BullMQ. A Redis REST URL/token is not a substitute for a BullMQ Redis connection.
- Optional services, depending on the features being used: SMTP email and Google Gemini API.

## Local setup

From the `server` directory:

```powershell
npm install
```

Create `server/.env` and set values for your own environment. Do not commit this file or share credentials:

```env
NODE_ENV=development
PORT=4000
HOST=localhost
CLIENT_URL=http://localhost:3000

# Use the PostgreSQL connection strings from your database provider.
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require

# Local Redis example. For hosted Redis, use its Redis-protocol URL.
REDIS_URL=redis://localhost:6379

# Use a long, random secret outside local development.
JWT_SECRET=replace-with-a-long-random-secret

SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=ScanLens <noreply@example.com>

GEMINI_API_KEY=your-gemini-api-key
```

`DATABASE_URL` must point to a reachable PostgreSQL database. Prisma connects during NestJS startup, so the API will fail to start if the database is unavailable. BullMQ uses `REDIS_URL`; if it is not set, the current configuration falls back to `localhost:6379`.

The API has no global `/api` prefix in `main.ts`; local endpoints are rooted at `http://localhost:4000`.

### Database setup

Generate the Prisma client and apply existing migrations:

```powershell
npx prisma generate
npx prisma migrate deploy
```

For local schema development, use:

```powershell
npx prisma migrate dev
```

Do not run development migrations against a production database. Review migration files and back up important data before changing a deployed schema.

### Start the API and worker

Ensure PostgreSQL and Redis are running and reachable, then:

```powershell
npm run start:dev
```

The default host and port are `localhost:4000`. The API and scan worker start in the same NestJS application. To build and run the compiled app:

```powershell
npm run build
npm run start:prod
```

## Queue behavior

The queue is named `scan-queue`. Registered-user jobs include:

```ts
{
  url: "https://example.com",
  userId: "user-id",
  isDeepScan: true
}
```

Current queue settings:

- Worker concurrency: 3 jobs at a time per worker instance.
- Default retry count: 3 attempts, with exponential backoff starting at 3 seconds.
- Invalid requests and forbidden scans are marked unrecoverable by the processor.
- Completed jobs are retained temporarily; failed jobs are kept longer for inspection.
- Job status is available while BullMQ retains the job in Redis. PostgreSQL is the durable scan-history store.

Useful log sequence for one successful job:

```text
QueueService: Job added
ScanProcessor: Processing scan
ScansService: Response Status
ScanProcessor: Scan completed
QueueService: Job ... completed
```

If `Job added` appears but `Processing scan` does not, check Redis connectivity, processor registration, and that the worker is running. If the processor starts but cannot reach the target, inspect DNS, outbound network access, and timeout errors.

### Try the queue API

After authenticating and receiving the `access_token` cookie:

```http
POST http://localhost:4000/scans/direct-scan
Content-Type: application/json
Cookie: access_token=<your-token>

{"url":"https://example.com","deepScan":true}
```

The response is asynchronous:

```json
{
  "jobId": "123",
  "status": "waiting",
  "queueInfo": {
    "position": 1,
    "queueSize": 0,
    "estimatedWait": 0,
    "priority": "priority"
  }
}
```

Poll the status endpoint using the same authenticated user:

```http
GET http://localhost:4000/scans/jobs/123
Cookie: access_token=<your-token>
```

The endpoint verifies that the job belongs to the authenticated user. A completed response includes the scan result; a failed response includes the failure reason.

Guest flow:

```http
POST http://localhost:4000/scans/guest-scan
Content-Type: application/json

{"url":"https://example.com","deepScan":false}
```

This request waits for the scan result directly and does not return a queue `jobId`.

## API routes

The routes below are declared in the current controllers and do not use an `/api` prefix:

| Method | Route | Access | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register and send verification OTP |
| `POST` | `/auth/login` | Public | Check credentials and send OTP |
| `POST` | `/auth/verify-otp` | Public | Verify OTP and issue JWT cookie |
| `POST` | `/auth/forgot-password` | Public | Start password reset |
| `POST` | `/auth/reset-password` | Public | Set a new password with reset token |
| `POST` | `/scans/direct-scan` | Authenticated | Validate and enqueue a scan; returns 202 and job ID |
| `GET` | `/scans/jobs/:jobId` | Job owner | Read queue job status and result |
| `POST` | `/scans/guest-scan` | Public | Run a synchronous guest scan |
| `GET` | `/scans/history` | Authenticated | Read the caller's scan history |
| `GET` | `/scans/usage-window` | Authenticated | Read scan usage and reset window |
| `GET` | `/scans/:id/export/csv` | Authenticated | Download a CSV report |
| `GET` | `/scans/:id/export/pdf` | Authenticated | Download a PDF report |
| `GET` | `/subscription/plans` | Public | List available plans |
| `GET` | `/subscription/my-subscription` | Authenticated | Read caller's subscription |
| `GET` | `/admin/users` | Admin | List users |

For the complete route list, check `@Controller()` and route decorators in `src/**/**.controller.ts`.

## Data model overview

Prisma models are defined in `prisma/schema.prisma`. The main relationships are:

```text
User ──< Website ──< Scan ──< Vulnerability
  ├──< UsageLog
  ├──< Payment
  └── License records are managed by subscription services
```

- `Scan` stores score, status, timestamps, and the related website.
- `Vulnerability` stores findings created by the current scan flow.
- `UsageLog` records scan and subscription events; it is also used by scan quota calculations.
- `Payment` stores payment records. A database payment record alone does not prove that a live payment provider charged a customer.
- Full HTTP/TLS analysis data is returned to the client but is not all stored as separate columns in the current `Scan` model.

Scan retention is configured by plan: Free 7 days, Pro 30 days, Extra 90 days, and admin scans are skipped by the retention cleanup. Cleanup runs on a schedule and is also applied when some history/statistics endpoints are requested.

## Security and operational notes

- Store secrets only in environment variables or a secrets manager.
- Never log OTPs, JWTs, database URLs, or SMTP credentials. Development code paths should be reviewed before production deployment.
- `JWT_SECRET` must be strong and unique in production; do not rely on a fallback secret.
- Configure CORS with the exact frontend origins and HTTPS in production.
- The guest counter currently lives in browser storage and can be reset by the browser user; enforce any business-critical guest quota on the server.
- Subscription plan changes and payment confirmation must only be allowed through trusted, appropriately guarded backend flows.
- Cron tasks execute only while a NestJS process is running. Multiple API replicas may run the same scheduled job unless distributed coordination is added.
- A successful build does not verify database, Redis, SMTP, Gemini, or target-site network connectivity.

## Scripts

Available scripts from `package.json`:

```powershell
npm run start:dev   # NestJS development server with watch
npm run build       # Compile the backend
npm run start       # Start NestJS
npm run start:prod  # Run compiled dist/main
npm test            # Run Jest unit tests
npm run test:e2e    # Run end-to-end tests
npm run lint        # Run ESLint with automatic fixes
```

Prisma commands are invoked through `npx prisma`, as shown in Database setup.

## Troubleshooting

| Symptom | Likely area to check |
|---|---|
| Prisma `P1001` / cannot reach database | `DATABASE_URL`, PostgreSQL status, host/port, TLS/network access |
| Queue add fails or worker does not process jobs | `REDIS_URL`, Redis protocol access, queue name, worker registration |
| `401 Unauthorized` | JWT cookie/header, token expiration, cookie/CORS settings |
| `403 Forbidden` | Plan limits, role, or permission checks |
| Target request times out | Target site availability, outbound network, DNS, timeout |
| Browser reports CORS error | API CORS allowed origins and credentials; CORS is enforced by browsers |
| Job status returns 404 | Wrong job ID, expired/removed Redis job, or job belongs to another user |

## Project structure

```text
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── auth/          # Registration, OTP, JWT strategy and guards
    ├── queue/         # QueueService, BullMQ module, ScanProcessor worker
    ├── scans/         # Scan controller, scan logic, history and exports
    ├── scanner/       # Scanner engines
    ├── subscription/  # Plans, subscriptions, licenses and payments
    ├── scheduler/     # Scheduled maintenance
    ├── mail/          # SMTP mail service
    ├── admin/         # Admin APIs
    ├── plans/         # Central plan limits and features
    ├── app.module.ts  # Root module, Redis/BullMQ configuration
    └── main.ts        # HTTP, CORS, security middleware and bootstrap
```
