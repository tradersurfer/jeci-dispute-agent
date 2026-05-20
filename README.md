# JECI Credit
### AI-Powered Credit Intelligence — Find it. Fight it. Fix it.
**Powered by JECI AI · JECI Group**

---

An autonomous AI-driven credit dispute system built on Next.js, Supabase, and Claude AI.

## What It Does

- **Analyzes** credit reports for every disputable item under FCRA (15 USC 1681) and FDCPA
- **Generates** legally precise dispute letters via JECI AI (Round 1, 2, and 3)
- **Manages** the full 3-round dispute pipeline automatically via Supabase action queue
- **Integrates** with Credit Repair Cloud via API, webhooks, and optional CRC sync
- **Notifies** your team in Slack at every milestone
- **Escalates** complex cases for human review or legal referral

## Plans

| Plan | Price | Description |
|---|---|---|
| JECI Scan | $97 one-time | Full PDF credit report analysis + dispute letter package |
| JECI Sweep | $297 one-time | Scan + 3-round bureau submissions + tracking |
| JECI Repair | $127/month | Ongoing dispute management + monthly reporting |
| JECI Boost | $497 one-time | Full repair + score optimization strategy |

## Architecture

```
PDF Upload → JECI AI Analysis → Letter Generation → ZIP Package → Supabase Storage
                                                                  ↓
CRC (optional sync) → Supabase (source of truth) → JECI Agent → Dispute Pipeline
```

**Stack**
- Next.js 14 App Router (frontend + API routes)
- Tailwind CSS v4 (CSS-based `@theme {}` configuration)
- Supabase (Postgres, Storage, SSR auth)
- Anthropic Claude `claude-sonnet-4-20250514` (letter generation, analysis)
- Stripe (Checkout Sessions + Subscriptions + Webhooks)
- Netlify (serverless functions, Next.js plugin)
- Credit Repair Cloud (optional CRM sync)
- Slack (team notifications)

## Quick Start

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in all values
3. Run the schema in your Supabase SQL editor: `supabase/schema.sql` then `supabase/jeci-tables.sql`
4. `npm install`
5. `npm run dev`

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, never expose) |
| `ANTHROPIC_API_KEY` | Anthropic API key for JECI AI |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_STRIPE_PRICE_SCAN` | Stripe Price ID for JECI Scan |
| `NEXT_PUBLIC_STRIPE_PRICE_SWEEP` | Stripe Price ID for JECI Sweep |
| `NEXT_PUBLIC_STRIPE_PRICE_REPAIR` | Stripe Price ID for JECI Repair |
| `NEXT_PUBLIC_STRIPE_PRICE_BOOST` | Stripe Price ID for JECI Boost |
| `NEXT_PUBLIC_BASE_URL` | Deployed site URL |
| `AGENT_WEBHOOK_SECRET` | Secret token for `/api/agent/run` endpoint |
| `CRC_API_KEY` | Credit Repair Cloud API key (optional) |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL (optional) |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/analyze` | Upload PDF, run JECI AI analysis, generate letters, save ZIP |
| GET | `/api/analyze/status?id=` | Poll analysis completion status |
| GET | `/api/download?id=` | Download dispute letter ZIP package |
| POST | `/api/agent/run` | Trigger agent loop (cron endpoint) |
| GET | `/api/clients` | List all clients |
| POST | `/api/clients` | Create a client |
| GET | `/api/disputes?client_id=` | List disputes |
| POST | `/api/disputes` | Create dispute + queue letter generation |
| POST | `/api/crc/sync` | Accept CRC webhook or manual sync |

## Netlify Functions

| Function | Description |
|---|---|
| `/.netlify/functions/stripe-checkout` | Create Stripe Checkout Session |
| `/.netlify/functions/stripe-webhook` | Handle Stripe payment events |

## Report Analyzer Rules

The JECI AI engine detects 18+ dispute reasons:

| Rule | Law | Deletion Rate |
|---|---|---|
| Exceeds 7-year limit | FCRA 15 USC 1681c(a) | 97% |
| Exceeds 10-year limit (bankruptcy) | FCRA 15 USC 1681c(a)(1) | 97% |
| Duplicate account | FCRA 15 USC 1681e(b) | 94% |
| Paid reporting unpaid | FCRA 15 USC 1681s-2 | 91% |
| Future date | FCRA 15 USC 1681e(b) | 93% |
| Medical under $500 | CFPB Final Rule 2023 | 98% |
| Original + collection double-reported | FCRA 15 USC 1681e(b) | 82% |
| Inquiry beyond 2 years | FCRA 15 USC 1681c(a)(3) | 96% |
| Inquiry without permissible purpose | FCRA 15 USC 1681b | 62% |
| Discharged in bankruptcy | FCRA + 11 USC 524 | 78% |

## Project Structure

```
jeci-dispute-agent/
├── app/                         ← Next.js App Router (frontend + API)
│   ├── page.tsx                 ← Landing page with pricing
│   ├── dashboard/page.tsx       ← Intake form + processing
│   ├── results/page.tsx         ← Analysis results + letter previews
│   ├── api/
│   │   ├── analyze/route.ts     ← PDF analysis pipeline
│   │   ├── analyze/status/      ← Analysis status polling
│   │   ├── download/route.ts    ← ZIP download
│   │   └── agent/run/route.ts   ← Agent loop trigger
│   ├── components/              ← Terminal-aesthetic UI components
│   └── globals.css              ← Tailwind v4 + JECI design tokens
├── src/                         ← Express webhook server (legacy)
│   ├── agents/disputeAgent.ts   ← Dispute pipeline orchestrator
│   ├── tools/
│   │   ├── reportAnalyzer.ts    ← FCRA/FDCPA rules engine
│   │   ├── letterGenerator.ts   ← Claude API letter writer
│   │   ├── crcClient.ts         ← Credit Repair Cloud API
│   │   └── slackNotifier.ts     ← Slack notifications
│   ├── webhooks/server.ts       ← Express webhook receiver
│   └── types/index.ts           ← Core TypeScript types
├── lib/
│   ├── agent/                   ← Supabase-backed agent core
│   └── zip/letterPackager.ts    ← ZIP dispute package builder
├── netlify/functions/           ← Netlify serverless functions
│   ├── stripe-checkout.ts
│   └── stripe-webhook.ts
├── utils/supabase/              ← Supabase client helpers
├── supabase/
│   ├── schema.sql               ← Core database schema
│   └── jeci-tables.sql          ← Analyses + paid_sessions tables
└── .env.example                 ← Environment variable template
```

## Database Setup

Run in order in your Supabase SQL editor:

1. `supabase/schema.sql` — clients, disputes, action_queue, etc.
2. `supabase/jeci-tables.sql` — analyses, paid_sessions, storage bucket

## Manual Steps After Setup

1. Run both SQL files in Supabase dashboard
2. Fill in `.env.local` with all API keys
3. Create 4 products in Stripe Dashboard and copy Price IDs to `.env.local`
4. Deploy to Netlify — set all env vars in Netlify dashboard
5. Register `/.netlify/functions/stripe-webhook` in Stripe Dashboard → Webhooks
6. Set up a cron job to POST to `/api/agent/run?secret=YOUR_SECRET` every 15–30 minutes

---

© 2026 JECI Group · JECI Credit — AI-Powered Credit Intelligence
Internal Use Only | Confidential
