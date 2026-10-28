# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

NestJS + TypeORM + PostgreSQL backend for a parking garage ("estacionamiento") in Argentina. It handles ticket-based parking (entry/exit pricing), monthly subscriber billing, barcode scanning, daily cash-box reconciliation, and real-time notifications over WebSockets.

## Commands

Package manager is pnpm (`packageManager: pnpm@9.15.4`).

```bash
pnpm install

pnpm dev              # nest start --watch (development)
pnpm start:debug      # watch mode with --inspect debugger

pnpm build            # nest build
pnpm start:prod        # node dist/main (run after build)

pnpm lint             # eslint --fix on src/apps/libs/test
pnpm format           # prettier --write on src and test

pnpm test             # jest unit tests (rootDir: src, pattern *.spec.ts)
pnpm test:watch
pnpm test:cov
pnpm test:e2e         # jest --config ./test/jest-e2e.json
```

Run a single test file: `pnpm test src/<path-to-file>.spec.ts` (or `pnpm test -t "<test name>"` to filter by name).

Note: at the time of writing, there are essentially no unit tests in `src/**/*.spec.ts` — only the NestJS-generated `test/app.e2e-spec.ts` boilerplate exists. Test infrastructure (jest, ts-jest, supertest, @nestjs/testing) is installed but underused.

## Environment

Config is loaded via `@nestjs/config` from `src/config/app.config.ts` and `src/config/database.config.ts`. Required env vars (see `.env`, not committed): `NODE_ENV`, `PORT`, `ALLOWED_ORIGINS`, `BACK_API_URL`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_NAME`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET` (JWT signing secret), `API_SECRET_TOKEN` (static fallback auth token), `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

TypeORM `synchronize` is currently `true` in `database.config.ts` — schema changes to entities apply automatically on boot in dev; be careful with destructive entity changes.

Docker build (`Dockerfile`) uses `node:22-bookworm-slim`, installs Chromium + its shared-lib dependencies (for `puppeteer`), builds with pnpm, and runs `pnpm start:prod` on port 3030.

## Architecture

Standard Nest module-per-domain layout under `src/`, wired together in `src/app.module.ts`: `receipts`, `scanner`, `tickets`, `box-lists`, `customers`, `users`, `auth`, `notes`. Cross-cutting code lives in `src/libs/helpers` (Cloudinary image upload, custom exceptions), `src/utils/guards` and `src/utils/strategies` (auth), and `src/types` (shared request typings).

### Core domain flow

```
Ticket (barcode, vehicleType, price)
  -> TicketRegistration (entry/exit timestamps, calculated final price)
  -> BoxList (daily cash-box accumulation)
  -> Receipt (monthly billing for subscribed customers)

Customer (OWNER / RENTER / PRIVATE)
  -> Vehicle (linked to customer + ParkingType, owner/renter pricing)
  -> Receipt (auto-generated monthly, status PENDING/PAID)
  -> ReceiptPayment / PaymentHistoryOnAccount (installments, on-account credit)
  -> BoxList (receipt tied to the day's box)

Scanner: POST /scanner/start-scanner receives a barcode and dispatches by shape
  - short/non-numeric barcode -> ticket lookup -> creates TicketRegistration, broadcasts via TicketGateway
  - 11-15 digit barcode -> receipt lookup -> marks paid/scanned, ties to BoxList
  Uses a TypeORM queryRunner transaction for atomicity.
```

- **Tickets** (`src/tickets/`): `Ticket` (barcode/vehicleType/price/day-vs-night type), `TicketRegistration` (entry/exit, price computed with a 5-minute grace period then billed per 60-minute block), `TicketRegistrationForDay` (multi-day/week bookings, price precalculated), `TicketPrice` (rate table keyed by vehicle type / day type / time window). Real-time updates via `TicketGateway` (`src/tickets/register-gateway.ts`, event `new-registration`).
- **Box-lists** (`src/box-lists/`): `BoxList` is the daily cash-box — one row per day, sequential `boxNumber` assigned under pessimistic locking, aggregates all revenue for that day (ticket registrations, extended bookings, receipts, misc payments). `OtherPayment` records manual income/expense entries (INGRESOS/EGRESOS).
- **Customers** (`src/customers/`): `Customer` (OWNER/RENTER/PRIVATE, soft-delete + restore, monthly debt tracked as a JSONB array), `Vehicle`, `VehicleRenter` (owner/renter relationship, owners referenced by static name keys), `ParkingType`, `InterestSettings` (global late-payment interest rate, applied via `@Cron`). Debt/interest events broadcast through `NotificationInterestGateway`.
- **Receipts** (`src/receipts/`): `Receipt` (PENDING/PAID, paymentType TRANSFER/CASH/CHECK/MIX/CREDIT/TP/FIX, formatted receiptNumber, random 11-15 digit barcode). Monthly receipts are generated per customer type, with a manual trigger at `POST /receipts/generate-manual/:customerType`. PDF/print dependencies (`pdfkit`, `pdf-to-printer`, `puppeteer`) and `cloudinary` are present in the stack for receipt output/image handling.
- **Notes** (`src/notes/`): internal staff notes tied to a user, timestamped in Argentina local time; broadcast via `NotificationGateway` (`src/notes/notification-gateway.ts`, event `notification`).
- **Auth/Users** (`src/auth/`, `src/users/`): login by email or username + bcryptjs password check, JWT issued/verified via `passport-jwt` (`src/utils/strategies/jwt.strategy.ts`), plus `VerificationToken`/`PasswordResetToken` entities for email verification and password reset. Most endpoints are protected by `AuthOrTokenAuthGuard` (`src/utils/guards/auth-or-token.guard.ts`), which accepts either a valid JWT or the static `API_SECRET_TOKEN` header — this dual-auth pattern exists so external/internal services can call the API without a user session.

### WebSocket gateways

Three Socket.io gateways broadcast domain events to connected clients (no request/response pattern): `TicketGateway` (new ticket registrations), `NotificationGateway` (new notes), `NotificationInterestGateway` (customer interest/debt notifications).

## Conventions

- Prettier: single quotes, trailing commas everywhere (`.prettierrc`).
- ESLint extends `@typescript-eslint/recommended` + `prettier/recommended`, with explicit-return-type, explicit-module-boundary-types, and no-explicit-any rules turned off — the codebase does not enforce strict typing discipline.
- `tsconfig.json` has `strictNullChecks: false` and `noImplicitAny: false` — do not assume strict-mode TypeScript guarantees when reading or writing code here.
