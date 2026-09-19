# ScanLens — Security Scanning API Engine

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A robust and scalable backend API built with NestJS and TypeScript for security scanning, vulnerability assessment, and subscription management.

> 🔗 Frontend repository: [ScanLens — Frontend Client](https://github.com/eslam-cmd/ScanLens-client)

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.17
- npm package manager
- PostgreSQL

### Installation

```bash
# Clone the repository
git clone https://github.com/eslam-cmd/ScanLens-server
cd ScanLens-server

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scanlens
JWT_SECRET=your-secret-key
MAIL_FROM=noreply@scanlens.com
NODE_ENV=development
```

### Database Setup

```bash
npm run prisma:migrate
npm run prisma:seed
```

### Run Development Server

```bash
npm run start:dev
```

Server runs on `http://localhost:3001` by default.

---

## 📁 Project Structure

```text
server/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── admin/
│   │   ├── admin.controller.ts
│   │   ├── admin.service.ts
│   │   ├── admin.module.ts
│   │   └── admin-payments.controller.ts
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── strategies/
│   ├── scans/
│   │   ├── scans.controller.ts
│   │   ├── scans.service.ts
│   │   ├── scans.module.ts
│   │   └── export.service.ts
│   ├── scanner/
│   │   ├── Engines.Module.ts
│   │   └── engines/
│   ├── subscription/
│   │   ├── subscription.controller.ts
│   │   ├── subscription.service.ts
│   │   └── subscription.module.ts
│   ├── ai/
│   │   ├── ai.service.ts
│   │   └── ai.module.ts
│   ├── mail/
│   │   ├── mail.service.ts
│   │   └── mail.module.ts
│   └── plans/
│       └── plans.config.ts
├── prisma/
│   ├── schema.prisma
│   ├── prisma.service.ts
│   ├── prisma.module.ts
│   ├── seed.ts
│   └── migrations/
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── eslint.config.mjs
└── package.json
```

---

## ✨ Key Features

- 🔐 **Secure Authentication** — JWT-based auth with refresh tokens
- 🔍 **Multi-Engine Scanning** — SSL/TLS, HTTP Headers, CORS, Cookie security
- 🤖 **AI Recommendations** — Gemini-powered remediation suggestions
- 📧 **Email Service** — Transactional email notifications
- 📈 **Analytics & Reporting** — Comprehensive scan reports
- 💳 **Subscription System** — Plan management and billing
- 👨‍💼 **Admin Dashboard** — System management tools

---

## 🛠️ Tech Stack

| Technology      | Purpose                            |
| :-------------- | :--------------------------------- |
| **NestJS 10+**  | Progressive Node.js framework      |
| **TypeScript**  | Type-safe development              |
| **Prisma**      | Modern ORM for database management |
| **PostgreSQL**  | Relational database                |
| **Passport.js** | Authentication middleware          |
| **JWT**         | Token-based authentication         |
| **Nodemailer**  | Email notifications                |

---

## 🔐 API Endpoints

### Authentication

- `POST /api/auth/register` — User registration
- `POST /api/auth/login` — User login
- `POST /api/auth/verify` — Email verification
- `POST /api/auth/forgot-password` — Password reset request

### Scans

- `GET /api/scans` — List user scans
- `POST /api/scans` — Create new scan
- `GET /api/scans/:id` — Get scan details
- `DELETE /api/scans/:id` — Delete scan

### Subscriptions

- `GET /api/subscription/plans` — Get available plans
- `POST /api/subscription/upgrade` — Upgrade subscription
- `GET /api/subscription/status` — Get subscription status

### Admin

- `GET /api/admin/users` — List all users
- `GET /api/admin/payments` — View payment history
- `POST /api/admin/users/:id/promote` — Promote to admin

---

## 🛠️ Development

```bash
# Production build
npm run build
npm run start

# Linting
npm run lint
```

### Database Management

```bash
npm run prisma:migrate    # Run migrations
npm run prisma:generate   # Generate Prisma client
npm run prisma:seed       # Seed database
npm run prisma:studio     # Open Prisma Studio
```

---

## 📬 Contact

**Islam Hadaya**

- Portfolio: [Personal Website](https://my-profile-personal-nextjs.vercel.app)
- LinkedIn: [linkedin.com/in/islam-hadaya](https://linkedin.com/in/islam-hadaya)
- Email: hdayaaslam34@gmail.com

---

_Last Updated:September 2026_
