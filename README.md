# JECI AI Dispute Agent
### 700 Credit Club Experts | JECI Group
**Legal. Moral. Ethical & Factual Credit Services.**

---

AI-powered Consumer Law Restoration engine. Replaces the $250/client dispute team with 24/7 automated FCRA/FDCPA dispute processing powered by Claude AI.

## What It Does

- **Analyzes** credit reports for every disputable item under FCRA (15 USC 1681) and FDCPA
- **Generates** legally precise dispute letters via Claude AI (Round 1, 2, and 3)
- **Manages** the full 3-round dispute pipeline automatically
- **Integrates** with Credit Repair Cloud via API and webhooks
- **Notifies** your team in Slack at every milestone
- **Escalates** complex cases for human review

## Architecture

```
Client Enrolls (CRC)
      ↓
CRC Webhook → /webhook/new-client
      ↓
Client Uploads Report → /webhook/report-uploaded
      ↓
JECI AI analyzes report (FCRA/FDCPA rules engine)
      ↓
Claude API generates dispute letters per bureau
      ↓
Letters pushed to CRC client file
      ↓
Pipeline stage updated
      ↓
Slack notification sent
      ↓
35 days later → bureau response → next round triggered
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/tradersurfer/jeci-dispute-agent
cd jeci-dispute-agent
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `CRC_API_KEY` — from CRC Settings → API (Scale plan required)
- `SLACK_WEBHOOK_URL` — from Slack Apps → Incoming Webhooks

### 3. Run tests (no API keys needed)

```bash
npm test
```

This runs the report analyzer against a mock client and validates all detection rules.

### 4. Development

```bash
npm run dev
```

Server starts on `http://localhost:3000`

### 5. Deploy to Railway

```bash
# Push to GitHub, then connect Railway to your repo
# Set environment variables in Railway dashboard
# Railway auto-deploys on push
```

## CRC Webhook Setup

In Credit Repair Cloud → Settings → Webhooks, add:

| Event | URL |
|---|---|
| Client Enrolled | `https://your-railway-url.up.railway.app/webhook/new-client` |
| Report Uploaded | `https://your-railway-url.up.railway.app/webhook/report-uploaded` |
| Bureau Response | `https://your-railway-url.up.railway.app/webhook/bureau-response` |
| Deletion Confirmed | `https://your-railway-url.up.railway.app/webhook/deletion-confirmed` |

## Report Analyzer Rules

The analyzer detects 18 dispute reasons:

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
| *+ 8 more...* | | |

## Cost Savings

| | Old Model | JECI AI |
|---|---|---|
| Per-client dispute cost | $250 | ~$1.50 (Claude API) |
| Availability | Business hours | 24/7 |
| 50 clients/month | $12,500 | $75 |
| **Annual savings** | — | **~$148,000** |

## Project Structure

```
src/
├── agents/
│   └── disputeAgent.ts      ← Mastra agent definition
├── tools/
│   ├── reportAnalyzer.ts    ← FCRA/FDCPA rules engine (the brain)
│   ├── letterGenerator.ts   ← Claude API letter writer
│   ├── crcClient.ts         ← Credit Repair Cloud API
│   └── slackNotifier.ts     ← Slack notifications
├── workflows/
│   ├── round1Dispute.ts     ← Bureau direct disputes
│   └── round2and3Dispute.ts ← Creditor + legal escalation
├── webhooks/
│   └── server.ts            ← Express webhook receiver
├── types/
│   └── index.ts             ← All TypeScript types
└── test/
    └── runTest.ts           ← Test suite with mock data
```

---

© 2026 JECI Group — 700 Credit Club Experts Division  
Internal Use Only | Confidential
