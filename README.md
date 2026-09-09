# Vaultiline

**A React Native / Expo + Cloudflare Worker learning & integration project for loan-management workflows.**

This repository is an **educational reference implementation**.

The source code — UI, architecture, database schema, API routes, business logic, offline
first design, and integration patterns — is preserved so developers can study or fork it
locally. The public repository contains **no production credentials, no real customer/KYC
data, and no real financial records**.

> **Not a live financial service.** See [Security & production warning](#security--production-warning).

Repository: <https://github.com/makos-757/react-native-loans-app>

---

## What is included

- **Frontend** — React Native app (Expo SDK 54, expo-router file-based routing, TypeScript)
  targeting iOS, Android, and Web.
- **Backend** — A single Cloudflare Worker (`backend/worker`) exposing a JSON REST API,
  with the database schema auto-created on first request via `initDatabase()`.
- **API client** — An Orval-generated typed React Query client (`app/api-client`) sourced
  from `backend/api-spec/openapi.yaml`.
- **Integrations (architecture preserved, credentials external)** — M-Pesa (Safaricom
  Daraja STK Push + callbacks), Africa's Talking (SMS + USSD `*650#`), Brevo (transactional
  email), and Cloudflare R2 (KYC/profile/report file storage).

---

## Features

Implemented in the code:

- Role-based access control: `User → Officer → Supervisor → Manager` (server-asserted RBAC).
- Loan application wizard (Starter & Top-up loans).
- Loan eligibility + credit scoring (`calculateCreditScore`).
- Top-up eligibility rule (70% repayment gate).
- Fixed-rate loan formula `principal * (1 + interestRate)` shared by app & USSD.
- Repayment tracking, statements, and ledger entries.
- Penalty automation via a daily cron trigger.
- Customer registration, inquiries, and global search.
- Reports (applications / repayments) with CSV export.
- Audit logs (`audit_logs`, `admin_logs`, `sms_logs`, `email_logs`).
- Pre-loan qualification questionnaire.
- KYC / ID verification flow (ID number, selfie, ID photo).
- M-Pesa STK Push initiation, callback verification, and status polling.
- Africa's Talking SMS notifications and `*650#` USSD menu.
- Brevo transactional email (OTP, welcome, loan events, repayments, password reset).
- R2 file storage with JWT + role-based access control.
- Offline-first: `NetworkGate`, offline banner, offline action queue, React Query cache
  persistence via AsyncStorage, and `expo-secure-store` token storage.
- Centralized API client with sliding-session token refresh.
- Responsive layout (mobile/tablet/desktop breakpoints).

Requires external credentials/services — see
[Configuration](#configuration).

---

## Project structure

```
react-native-loans-app/
├── app/                        # Expo React Native app
│   ├── api-client/            # Orval-generated typed API client
│   ├── screens/               # expo-router screens + (tabs) layout
│   ├── components/            # shared UI (Header, KPICard, NetworkGate, ...)
│   ├── context/               # AuthContext, SettingsContext
│   ├── hooks/                 # useApiQueries, useResponsive, useColors, ...
│   ├── lib/                   # apiClient, authState, offlineQueue, rbac, safeFetch
│   ├── assets/                # logo / splash / favicons
│   ├── web/                   # Expo web entry (index.html)
│   ├── server/                # local static-serve helper + landing page
│   ├── scripts/build.js       # static production web build
│   ├── app.json               # Expo config (owner + projectId are placeholders)
│   ├── eas.json               # EAS build profiles (dev URLs only)
│   └── package.json           # npm workspace (uses app/package-lock.json)
├── backend/
│   ├── worker/                # Cloudflare Worker (src/index.ts + services/)
│   │   ├── src/
│   │   │   ├── index.ts       # fetch handler, all API routes, D1 init, cron
│   │   │   ├── mpesa.ts       # Daraja STK Push client
│   │   │   └── services/      # brevo.ts, r2.ts, sms.ts
│   │   └── wrangler.toml      # Worker config (placeholders)
│   ├── api-spec/              # OpenAPI 3.1 spec + Orval config
│   └── package.json           # npm (wrangler, tsc, orval, drizzle tooling)
├── tsconfig.base.json / tsconfig.json
├── package.json               # pnpm workspace root (install:app / install:backend)
└── .gitignore
```

---

## Installation

Install these once:

- **Node.js** 24+ — <https://nodejs.org>
- **npm** 11+ (ships with Node)
- **pnpm** 9+ — `npm install -g pnpm` (used for the workspace scripts)
- **Git** — <https://git-scm.com>
- **Wrangler** 4+ (optional, for local Worker dev) — `npm install -g wrangler`

Install dependencies:

```bash
# root workspace tooling
pnpm install

# frontend app (npm, uses app/package-lock.json)
cd app
npm install --legacy-peer-deps   # --legacy-peer-deps avoids Expo SDK peer conflicts
cd ..

# backend (npm)
cd backend
npm install
cd ..
```

---

## Running locally

### App (Expo web)

```bash
cd app
npm run dev            # Metro / Expo Dev Tools
# then press w -> web browser at http://localhost:8081
```

Or directly:

```bash
cd app
npx expo start --web --localhost
```

The app defaults to a **local** API URL (`http://localhost:8787`) and does **not** call any
live production endpoint.

### Worker (local)

```bash
cd backend/worker
npx wrangler dev --local --port 8787
```

Local dev uses an in-memory D1 database and local R2 emulation — no Cloudflare account is
required. The schema is created automatically on first request.

### TypeScript checks

```bash
cd app && npx tsc -p tsconfig.json --noEmit
cd ../backend && npx tsc --build
```

---

## Configuration

Everything that was once a production secret is now a **placeholder** the developer must
supply. The app ships safe-to-run defaults only.

### App

The API base URL is read from the environment (with a local default):

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787   # local dev
```

Optional app variables:

```bash
EXPO_PUBLIC_SENTRY_DSN=                           # empty = crash reporting off
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_IS_TEST_BUILD=false
```

### Worker (`wrangler.toml` + secrets)

Non-secret variables live in `backend/worker/wrangler.toml` `[vars]` (placeholders only).
Secrets are provided through a local `.dev.vars` file (copy from
`backend/worker/.env.example`, then `cp backend/worker/.env.example backend/worker/.dev.vars`)
**or** via `wrangler secret put` for deployment:

```bash
cd backend/worker
cp .env.example .dev.vars     # edit placeholders
# or, for deployment:
npx wrangler secret put JWT_SECRET
npx wrangler secret put OTP_SECRET
npx wrangler secret put MPESA_CONSUMER_SECRET
npx wrangler secret put MPESA_INITIATOR_PASSWORD
npx wrangler secret put MPESA_CALLBACK_TOKEN
npx wrangler secret put AFRICASTALKING_API_KEY
npx wrangler secret put BREVO_API_KEY
```

Use these placeholders:

`YOUR_WORKER_URL` · `YOUR_D1_DATABASE_ID` · `YOUR_R2_BUCKET_NAME` ·
`YOUR_MPESA_CONSUMER_KEY` · `YOUR_MPESA_CONSUMER_SECRET` · `YOUR_MPESA_PASSKEY` ·
`YOUR_MPESA_SHORTCODE` · `YOUR_MPESA_INITIATOR_PASSWORD` · `YOUR_MPESA_CALLBACK_URL` ·
`YOUR_AFRICASTALKING_USERNAME` · `YOUR_AFRICASTALKING_API_KEY` · `YOUR_USSD_CALLBACK_URL` ·
`YOUR_BREVO_API_KEY` · `YOUR_SENTRY_DSN` · `YOUR_JWT_SECRET` · `YOUR_OTP_SECRET`

---

## Service setup (your own accounts required)

### Cloudflare

1. Create a Cloudflare account.
2. Create your own Worker, D1 database, and R2 bucket.
3. Update `backend/worker/wrangler.toml` bindings (`DB`, `R2`) and `[vars]`.
4. Set your own secrets (see above).
5. Deploy manually: `npx wrangler deploy` — there is **no auto-deploy**.

### M-Pesa (Safaricom Daraja)

1. Sign up at <https://developer.safaricom.co.ke/>.
2. Provide `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`,
   `MPESA_SHORTCODE`, `MPESA_INITIATOR_NAME`, `MPESA_INITIATOR_PASSWORD`.
3. Set your *own* callback URLs in the Daraja portal (not the decommissioned one).

### Africa's Talking

1. Sign up at <https://africastalking.com/>.
2. Provide `AT_API_KEY` / `AT_USERNAME` and a sender ID.
3. If you use USSD, set your own callback URL on shortcode `650`.

### Brevo (email)

1. Sign up at <https://www.brevo.com/>.
2. Provide `BREVO_API_KEY` and a verified `EMAIL_FROM` address.

### Sentry (optional)

Provide your own `EXPO_PUBLIC_SENTRY_DSN` to enable client crash reporting; leave it
empty to disable. There is no Sentry initialization in the codebase today, so removing
the `sentry-expo` dependency is safe.

---

## Demo data

The repository contains **no real user credentials**.

For local development, enable the synthetic test seed in `wrangler.toml` by setting
`ENABLE_TEST_SEED = "true"` and use only locally generated accounts. Never commit real
credentials.

```text
Demo (synthetic, local only):
  Email:    demo@example.com
  Password: ChangeMeNow!123
  Role:     Manager
```

---

## Database

The Worker auto-creates all tables on first request in `initDatabase()` (`backend/worker/src/index.ts`).
Educational schema highlights: `users`, `loans`, `transactions`, `ledger_entries`,
`mpesa_payments`, `otp_codes`, `id_verifications`, `idempotency_keys`, `audit_logs`,
`admin_logs`, `sms_logs`, `email_logs`, `rate_limits`, `qualification_answers`,
`customers`, `inquiries`, `ussd_sessions`, `settings`, `files`, `chama_members`, and
`refresh_tokens`.

There is **no production database** bundled with this repository.

---

## Security & production warning

This repository is an **educational/reference implementation**. It is **not** a
production-ready financial system.

Before using it with real customers, money, KYC information, SMS, M-Pesa, or other
financial services, you must perform an independent security review and implement
appropriate authentication, authorization, privacy, compliance, monitoring, rate
limiting, secrets management, audit controls, backup, disaster-recovery, and
regulatory requirements.

This is not financial or legal advice, and the project makes **no claims of regulatory
compliance**.

---

## Contact

For questions, collaboration, integrations, or project-related enquiries:

- Website: <https://makostech.me>
- Contact: <https://makostech.me/contact>
- WhatsApp: +254 727 240 573

---

## License

See [LICENSE](LICENSE) if present. Otherwise treat as all-rights-reserved reference code.
