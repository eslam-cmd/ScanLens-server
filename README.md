# ScanLens - Backend

A robust and scalable backend API built with **NestJS** and **TypeScript** for security scanning, vulnerability assessment, and subscription management. This API powers the ScanLens platform with advanced security features, real-time processing, and comprehensive reporting.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![NestJS](https://img.shields.io/badge/NestJS-10+-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-informational)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.17 or higher
- **npm** package manager
- **PostgreSQL** or compatible database

### Installation

1. Clone the repository:

```bash
git clone https://github.com/eslam-cmd/ScanLens-server
cd ScanLens/server
```

2. Install dependencies:

```bash
npm install
```

3. Create environment configuration (`.env`):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scanlens
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
MAIL_FROM=noreply@scanlens.com
NODE_ENV=development
```

4. Setup database:

```bash
npm run prisma:migrate
npm run prisma:seed
```

5. Run development server:

```bash
npm run start:dev
```

Server runs on `http://localhost:3001` by default.

## 📁 Project Structure

```
server/
├── src/                          # Source code
│   ├── main.ts                  # Application entry point
│   ├── app.module.ts            # Root module
│   ├── app.controller.ts        # Root controller
│   ├── app.service.ts           # Root service
│   ├── admin/                   # Admin management
│   │   ├── admin.controller.ts
│   │   ├── admin.service.ts
│   │   ├── admin.module.ts
│   │   └── admin-payments.controller.ts
│   ├── auth/                    # Authentication & Authorization
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── dto/                 # Data Transfer Objects
│   │   ├── guards/              # Route guards (JWT, etc.)
│   │   └── strategies/          # Passport strategies
│   ├── scans/                   # Scan operations
│   │   ├── scans.controller.ts
│   │   ├── scans.service.ts
│   │   ├── scans.module.ts
│   │   └── export.service.ts
│   ├── scanner/                 # Scanner engines
│   │   ├── Engines.Module.ts
│   │   └── engines/             # Individual scanner implementations
│   ├── queue/                   # Background job processing
│   │   ├── queue.module.ts
│   │   ├── queue.service.ts
│   │   └── scan.processor.ts
│   ├── subscription/            # Subscription management
│   │   ├── subscription.controller.ts
│   │   ├── subscription.service.ts
│   │   └── subscription.module.ts
│   ├── ai/                      # AI/ML recommendations
│   │   ├── ai.service.ts
│   │   └── ai.module.ts
│   ├── mail/                    # Email service
│   │   ├── mail.service.ts
│   │   └── mail.module.ts
│   ├── scheduler/               # Scheduled tasks
│   │   ├── scheduler.service.ts
│   │   ├── scheduler.controller.ts
│   │   └── scheduler.module.ts
│   └── plans/                   # Subscription plans configuration
│       └── plans.config.ts
├── prisma/                      # Database ORM
│   ├── schema.prisma           # Database schema
│   ├── prisma.service.ts       # Prisma service
│   ├── prisma.module.ts        # Prisma module
│   ├── seed.ts                 # Database seeding
│   └── migrations/             # Database migrations
├── test/                        # E2E tests
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── tsconfig.json               # TypeScript configuration
├── tsconfig.build.json         # Build configuration
├── nest-cli.json               # NestJS CLI config
├── eslint.config.mjs           # ESLint configuration
└── package.json                # Dependencies
```

## 🛠️ Development

### Build for production:

```bash
npm run build
```

### Start production server:

```bash
npm run start
```

### Run tests:

```bash
npm run test                    # Unit tests
npm run test:cov               # Coverage report
npm run test:e2e               # E2E tests
npm run test:debug             # Debug mode
```

### Linting & Code Quality:

```bash
npm run lint
```

### Database Management:

```bash
npm run prisma:migrate         # Run migrations
npm run prisma:generate        # Generate Prisma client
npm run prisma:seed            # Seed database
npm run prisma:studio          # Open Prisma Studio
```

## 🏗️ Key Technologies

| Technology      | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| **NestJS 10+**  | Progressive Node.js framework for building efficient APIs |
| **TypeScript**  | Type-safe development                                     |
| **Prisma**      | Modern ORM for database management                        |
| **PostgreSQL**  | Relational database                                       |
| **Redis**       | In-memory cache & job queue                               |
| **Bull**        | Job queue library                                         |
| **Passport.js** | Authentication middleware                                 |
| **JWT**         | Token-based authentication                                |

## 🔐 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Email verification
- `POST /api/auth/forgot-password` - Password reset request

### Scans

- `GET /api/scans` - List user scans
- `POST /api/scans` - Create new scan
- `GET /api/scans/:id` - Get scan details
- `DELETE /api/scans/:id` - Delete scan

### Subscriptions

- `GET /api/subscription/plans` - Get available plans
- `POST /api/subscription/upgrade` - Upgrade subscription
- `GET /api/subscription/status` - Get subscription status

### Admin

- `GET /api/admin/users` - List all users
- `GET /api/admin/payments` - View payment history
- `POST /api/admin/users/:id/promote` - Promote to admin

## 📊 Key Features

- 🔐 **Secure Authentication** - JWT-based auth with refresh tokens
- 🔍 **Multi-Engine Scanning** - Support for multiple security scanners
- 📊 **Real-time Processing** - Background job queue with Redis
- 💾 **Database Management** - Prisma ORM with PostgreSQL
- 📧 **Email Service** - Transactional email notifications
- 🤖 **AI Recommendations** - Intelligent security solutions
- 📈 **Analytics & Reporting** - Comprehensive scan reports
- 💳 **Subscription System** - Plan management and billing
- 👨‍💼 **Admin Dashboard** - System management tools

## 🔄 Job Queue System

Background jobs are processed using Bull queue with Redis:

- **Scan Processing** - Long-running security scans
- **Report Generation** - Export and PDF creation
- **Email Notifications** - Transactional emails
- **Scheduled Tasks** - Recurring maintenance jobs

## 🧪 Testing

The project includes comprehensive test coverage:

- **Unit Tests** - Individual module testing
- **Integration Tests** - API endpoint testing
- **E2E Tests** - Full workflow testing

Run tests with:

```bash
npm run test:cov    # View coverage report
```

## 📚 API Documentation

For detailed API documentation and endpoints, refer to:

- API Swagger/OpenAPI documentation (if implemented)
- Postman collection (if available)

## 🤝 Contributing

We welcome contributions! Please follow our development guidelines for:

- Code style standards
- Git workflow
- Pull request process
- Testing requirements

##  Frontend Repository

Check out the **ScanLens Frontend** here:
👉 [ScanLens - Frontend](https://github.com/eslam-cmd/ScanLens-client)

---

**Last Updated:** August 2026
