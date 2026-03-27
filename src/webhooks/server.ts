// ============================================================
// JECI AI — Express Server + Scheduler
// Railway entry point.
// Runs the poll scheduler + exposes manual trigger endpoints.
// ============================================================

import express                        from 'express';
import { startScheduler, pollCRCAndDispatch } from '../scheduler/pollScheduler.js';
import { runDisputePipeline }         from '../agents/disputeAgent.js';
import { notifySlack }                from '../tools/slackNotifier.js';
import { CreditReport }               from '../types/index.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ── Health check ──────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status:    'JECI AI Dispute Agent — Online',
    version:   '1.0.0',
    company:   '700 Credit Club Experts | JECI Group',
    scheduler: 'Active — polling CRC every 60 minutes',
  });
});

// ── Manual poll trigger ───────────────────────────────────────
// Hit this to force an immediate poll without waiting for the interval.
// Useful right after enrolling a new client.

app.post('/poll/now', async (_req, res) => {
  res.json({ message: 'Poll triggered', timestamp: new Date().toISOString() });

  // Run async so response fires immediately
  pollCRCAndDispatch().catch(err =>
    console.error('Manual poll error:', err),
  );
});

// ── Manual single-client trigger ─────────────────────────────
// Fire the dispute pipeline for one specific client immediately.
// Useful for testing or forcing a retry.
// Body: { clientId, round, report (optional) }

app.post('/trigger/client', async (req, res) => {
  const { clientId, round = 1, report } = req.body as {
    clientId: string;
    round?: number;
    report?: CreditReport;
  };

  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  res.json({
    message:  `Round ${round} triggered for ${clientId}`,
    clientId,
    round,
  });

  // Build a minimal shell report if none provided
  const reportToUse: CreditReport = report ?? {
    clientId,
    reportDate:   new Date(),
    personalInfo: { name: clientId, address: '', city: '', state: 'FL', zip: '' },
    scores:       { Equifax: 0, Experian: 0, TransUnion: 0 },
    accounts:     [],
    inquiries:    [],
    publicRecords: [],
  };

  runDisputePipeline(clientId, reportToUse, round as 1 | 2 | 3)
    .catch(err => console.error('Manual trigger error:', err));
});

// ── Status endpoint ───────────────────────────────────────────
// Quick sanity check — confirms env vars are loaded

app.get('/status', (_req, res) => {
  res.json({
    env: {
      CRC_API_KEY:       process.env.CRC_API_KEY       ? '✅ Set' : '❌ Missing',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing',
      SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ? '✅ Set' : '❌ Missing',
    },
    scheduler: 'Running',
    uptime:    `${Math.floor(process.uptime())}s`,
  });
});

// ── Start server + scheduler ──────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 JECI AI Dispute Agent — Port ${PORT}`);
  console.log(`   700 Credit Club Experts | JECI Group`);
  console.log(`   Legal. Moral. Ethical & Factual Credit Services.\n`);

  // Start the CRC poll scheduler (every 60 minutes)
  const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES ?? '60');
  startScheduler(POLL_INTERVAL_MINUTES);
});

export default app;