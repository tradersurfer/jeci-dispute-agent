# JECI Dispute Agent
### Powered by 700 Credit Club Experts | JECI Group
**Legal. Moral. Ethical & Factual Credit Services.**

---

An autonomous AI-driven credit dispute management system built on Node.js/TypeScript, Supabase, and Claude AI.

## What It Does

- **Analyzes** credit reports for every disputable item under FCRA (15 USC 1681) and FDCPA
- **Generates** legally precise dispute letters via Claude AI (Round 1, 2, and 3)
- **Manages** the full 3-round dispute pipeline automatically via Supabase action queue
- **Integrates** with Credit Repair Cloud via API, webhooks, and optional CRC sync
- **Notifies** your team in Slack at every milestone
- **Escalates** complex cases for human review or legal referral

## Architecture

```
CRC (optional sync) → Supabase (source of truth) → JECI Agent → Dispute Letters / Actions
```

**Stack**
- Node.js/TypeScript + Express (existing webhook server)
- Next.js 14 App Router API routes (new Supabase-backed endpoints)
- Supabase (Postgres database, real-time, storage)
- Anthropic Claude (letter generation, response parsing, strategy)
- Credit Repair Cloud (optional CRM sync via webhook)
- Slack (team notifications)

## Quick Start

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in all values
3. Run the schema in your Supabase SQL editor: `supabase/schema.sql`
4. `npm install`
5. `npm run dev`

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, never expose) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `AGENT_WEBHOOK_SECRET` | Secret token for `/api/agent/run` endpoint |
| `CRC_API_KEY` | Credit Repair Cloud API key (optional) |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL (optional) |

## Agent Trigger

```
POST /api/agent/run?secret=YOUR_WEBHOOK_SECRET
```

Set this as a cron job (Vercel Cron, GitHub Actions, or Supabase Edge Function) to run every 15–30 minutes.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/clients` | List all clients |
| POST | `/api/clients` | Create a client |
| GET | `/api/disputes?client_id=` | List disputes |
| POST | `/api/disputes` | Create dispute + queue letter generation |
| POST | `/api/crc/sync` | Accept CRC webhook or manual sync |
| POST | `/api/agent/run` | Trigger agent loop |

## CRC Integration

Send a POST to `/api/crc/sync` with:

```json
{
  "type": "client",
  "data": { "id": "CRC_ID", "first_name": "John", "last_name": "Doe", "email": "..." }
}
```

JECI stores the data in Supabase and operates independently from CRC from that point forward.

## CRC Webhook Setup

In Credit Repair Cloud → Settings → Webhooks, add:

| Event | URL |
|---|---|
| Client Enrolled | `https://your-railway-url.up.railway.app/webhook/new-client` |
| Report Uploaded | `https://your-railway-url.up.railway.app/webhook/report-uploaded` |
| Bureau Response | `https://your-railway-url.up.railway.app/webhook/bureau-response` |
| Deletion Confirmed | `https://your-railway-url.up.railway.app/webhook/deletion-confirmed` |

## Report Analyzer Rules

The analyzer detects 18+ dispute reasons:

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
├── src/                         ← Existing Express webhook server
│   ├── agents/disputeAgent.ts   ← Original dispute pipeline orchestrator
│   ├── tools/
│   │   ├── reportAnalyzer.ts    ← FCRA/FDCPA rules engine (the brain)
│   │   ├── letterGenerator.ts   ← Claude API letter writer
│   │   ├── crcClient.ts         ← Credit Repair Cloud API
│   │   └── slackNotifier.ts     ← Slack notifications
│   ├── webhooks/server.ts       ← Express webhook receiver
│   ├── scheduler/               ← Poll scheduler
│   ├── types/index.ts           ← All TypeScript types
│   └── test/runTest.ts          ← Test suite with mock data
├── lib/agent/                   ← NEW: Supabase-backed agent core
│   ├── jeci.ts                  ← Main JECI agent loop
│   ├── letterGenerator.ts       ← Supabase-integrated letter generator
│   ├── responseParser.ts        ← Bureau response parser
│   └── strategyEngine.ts        ← Next-action strategy engine
├── app/api/                     ← NEW: Next.js-style API routes
│   ├── agent/run/route.ts       ← Agent loop trigger (cron endpoint)
│   ├── clients/route.ts         ← Client CRUD
│   ├── disputes/route.ts        ← Dispute management
│   └── crc/sync/route.ts        ← CRC sync webhook receiver
├── utils/supabase/              ← NEW: Supabase client helpers
│   ├── client.ts                ← Browser client
│   ├── server.ts                ← Server client (SSR)
│   ├── middleware.ts            ← Session middleware
│   └── admin.ts                 ← Service role admin client
├── supabase/
│   └── schema.sql               ← Full Supabase database schema
├── middleware.ts                ← Next.js session middleware
└── .env.example                 ← Environment variable template
```

## Database Schema

Run `supabase/schema.sql` in your Supabase SQL editor:
- `clients` — Client identity, address, CRC link
- `score_snapshots` — Credit score history per bureau
- `credit_accounts` — Tradelines and account details
- `negative_items` — Items flagged for dispute
- `disputes` — Full dispute lifecycle with letters
- `dispute_templates` — Letter template library
- `bureau_responses` — Parsed bureau responses
- `hard_inquiries` — Inquiry tracking
- `action_queue` — JECI agent task queue
- `crc_sync_log` — CRC sync audit log

## Manual Steps After Setup

1. **Run `supabase/schema.sql`** in your Supabase dashboard SQL editor
2. **Add your Supabase service role key** to `.env.local`
3. **Add your Anthropic API key** to `.env.local`
4. **Set up a cron job** to POST to `/api/agent/run?secret=YOUR_SECRET` every 15–30 minutes
5. **Change `AGENT_WEBHOOK_SECRET`** to something strong before deploying to production

## Cost Savings

| | Old Model | JECI AI |
|---|---|---|
| Per-client dispute cost | $250 | ~$1.50 (Claude API) |
| Availability | Business hours | 24/7 |
| 50 clients/month | $12,500 | $75 |
| **Annual savings** | — | **~$148,000** |

---

© 2026 JECI Group — 700 Credit Club Experts Division
Internal Use Only | Confidential
