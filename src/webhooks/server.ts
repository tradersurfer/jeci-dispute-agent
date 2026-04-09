// ============================================================
// JECI AI — Express Server + Scheduler
// Railway entry point.
// Runs the poll scheduler + exposes manual trigger endpoints
// and real webhook handlers for CRC events.
// ============================================================

import express                                       from 'express';
import { startScheduler, pollCRCAndDispatch, resolveClientReport } from '../scheduler/pollScheduler.js';
import { testCRCConnection, getCRCClient, updatePipelineStage, addCRCNote } from '../tools/crcClient.js';
import { runDisputePipeline }                         from '../agents/disputeAgent.js';
import { notifySlack, notifyNewClientEnrolled, notifyError } from '../tools/slackNotifier.js';
import { emailClientWelcome, emailClientBureauResponse } from '../tools/emailer.js';
import { recordPipelineEvent, getFiledDisputeKeys, getScoreHistory, getDbStats } from '../db/disputeDb.js';
import { CreditReport, CRCWebhookPayload }            from '../types/index.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ── Health check ──────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status:    'JECI AI Dispute Agent — Online',
    version:   '1.1.0',
    company:   '700 Credit Club Experts | JECI Group',
    scheduler: 'Active — polling CRC every 60 minutes',
    note:      'CRC_API_ENABLED=false until CRC plan upgraded to Grow/Scale',
  });
});

// ── Status endpoint ───────────────────────────────────────────

app.get('/status', async (_req, res) => {
  const crcEnabled = process.env.CRC_API_ENABLED !== 'false';
  const crcTest    = crcEnabled
    ? await testCRCConnection().catch(e => ({ ok: false, message: e.message, keysPresent: false }))
    : { ok: false, message: 'Disabled — upgrade CRC plan to Grow/Scale then set CRC_API_ENABLED=true', keysPresent: false };

  const dbStats = getDbStats();

  res.json({
    env: {
      CRC_API_KEY:          process.env.CRC_API_KEY         ? '✅ Set' : '❌ Missing',
      CRC_SECRET_KEY:       process.env.CRC_SECRET_KEY      ? '✅ Set' : '❌ Missing',
      CRC_API_ENABLED:      process.env.CRC_API_ENABLED,
      ANTHROPIC_API_KEY:    process.env.ANTHROPIC_API_KEY   ? '✅ Set' : '❌ Missing',
      SLACK_WEBHOOK_URL:    process.env.SLACK_WEBHOOK_URL   ? '✅ Set' : '❌ Missing',
      SENDGRID_API_KEY:     process.env.SENDGRID_API_KEY    ? '✅ Set' : '❌ Missing (emails disabled)',
      SENDGRID_FROM_EMAIL:  process.env.SENDGRID_FROM_EMAIL ? '✅ Set' : '❌ Missing',
      CREDIT_HERO_API_KEY:  process.env.CREDIT_HERO_API_KEY ? '✅ Set' : '⚠️  Not set (CRC tradelines used as fallback)',
    },
    crc_api_enabled: crcEnabled,
    crc_connection:  crcTest,
    database:        dbStats,
    scheduler:       'Running',
    uptime:          `${Math.floor(process.uptime())}s`,
  });
});

// ============================================================
// WEBHOOK HANDLERS
// Configure CRC to POST to these URLs:
//   CRC → Settings → Webhooks → Add Webhook
// ============================================================

// ── Webhook: New client enrolled ──────────────────────────────
// Fires when a client is moved to "Enrolled / Active" in CRC.
// Immediately notifies Slack, emails the client welcome, and
// schedules the credit report check.

app.post('/webhook/new-client', async (req, res) => {
  const payload = req.body as CRCWebhookPayload;

  if (!payload?.clientId) {
    return res.status(400).json({ error: 'clientId required in webhook payload' });
  }

  // Acknowledge immediately — CRC webhooks have short timeouts
  res.json({ received: true, clientId: payload.clientId });

  try {
    const client = await getCRCClient(payload.clientId);
    console.log(`\n🆕 Webhook: New client enrolled — ${client.name} (${client.id})`);

    recordPipelineEvent(client.id, 'client_enrolled', {
      name:  client.name,
      email: client.email,
    });

    // Notify Slack team
    await notifyNewClientEnrolled(client.name, client.id);

    // Email welcome to client
    await emailClientWelcome(client).catch(err =>
      console.warn(`  ⚠️  Welcome email skipped: ${err.message}`)
    );

    // Add enrollment note to CRC
    await addCRCNote(client.id,
      `700CreditAI: Client enrolled. Awaiting credit report pull from Credit Hero Score.\n` +
      `JECI_AI_ENROLLED: ${new Date().toISOString()}`
    );

    console.log(`  ✓ New client ${client.name} processed successfully`);

  } catch (err) {
    console.error(`  ✗ Webhook new-client error: ${(err as Error).message}`);
    await notifyError('Webhook: new-client', err as Error);
  }
});

// ── Webhook: Credit report uploaded ──────────────────────────
// THIS is the primary dispute trigger. Fires when the client's
// credit report has been pulled from Credit Hero Score and
// synced/uploaded to CRC. The agent fetches the report data
// and immediately runs Round 1.

app.post('/webhook/report-uploaded', async (req, res) => {
  const payload = req.body as CRCWebhookPayload;

  if (!payload?.clientId) {
    return res.status(400).json({ error: 'clientId required in webhook payload' });
  }

  res.json({ received: true, clientId: payload.clientId, action: 'Round 1 queued' });

  try {
    const client = await getCRCClient(payload.clientId);
    console.log(`\n📥 Webhook: Report uploaded for ${client.name} (${client.id})`);

    recordPipelineEvent(client.id, 'report_uploaded', {
      source: payload.data?.source ?? 'unknown',
    });

    await notifySlack(
      `📥 *Credit Report Uploaded*\n` +
      `*Client:* ${client.name}\n` +
      `*ID:* ${client.id}\n` +
      `*Action:* Fetching report data and starting Round 1 audit...`
    );

    // Fetch the actual credit report data
    const report = await resolveClientReport(client);

    if (!report || report.accounts.length === 0) {
      const msg =
        `⚠️ *Report Uploaded but Data Empty*\n` +
        `*Client:* ${client.name}\n` +
        `Credit Hero Score API returned no accounts. ` +
        `Verify the report was fully synced and try again.`;
      await notifySlack(msg);
      console.warn(`  ⚠️  Report empty for ${client.name} after upload webhook`);
      return;
    }

    // Fire Round 1 dispute pipeline immediately
    await runDisputePipeline(client.id, report, 1);

  } catch (err) {
    console.error(`  ✗ Webhook report-uploaded error: ${(err as Error).message}`);
    await notifyError('Webhook: report-uploaded', err as Error);
  }
});

// ── Webhook: Bureau response received ─────────────────────────
// Fires when a bureau sends a response to a filed dispute.
// CRC (or your team) marks the response in CRC and this
// webhook triggers Round 2 if items were verified/not removed.

app.post('/webhook/bureau-response', async (req, res) => {
  const payload = req.body as CRCWebhookPayload;

  if (!payload?.clientId) {
    return res.status(400).json({ error: 'clientId required in webhook payload' });
  }

  const {
    bureau         = 'Unknown Bureau',
    responseContent= '',
    round          = 1,
    itemsRemoved   = 0,
    itemsVerified  = 0,
  } = (payload.data ?? {}) as {
    bureau?:          string;
    responseContent?: string;
    round?:           number;
    itemsRemoved?:    number;
    itemsVerified?:   number;
  };

  res.json({ received: true, clientId: payload.clientId });

  try {
    const client = await getCRCClient(payload.clientId);
    console.log(`\n📬 Webhook: Bureau response from ${bureau} for ${client.name}`);

    recordPipelineEvent(client.id, 'bureau_response', {
      bureau, round, itemsRemoved, itemsVerified,
    });

    // Email client a copy of the bureau response
    if (responseContent) {
      await emailClientBureauResponse(client, bureau, responseContent, round).catch(err =>
        console.warn(`  ⚠️  Bureau response email skipped: ${err.message}`)
      );
    }

    // Add response note to CRC
    await addCRCNote(client.id,
      `700CreditAI: ${bureau} response received for Round ${round}.\n` +
      `• Items removed: ${itemsRemoved}\n` +
      `• Items verified (not removed): ${itemsVerified}\n` +
      `${responseContent ? `Response: ${responseContent.slice(0, 500)}` : ''}`
    );

    await notifySlack(
      `📬 *Bureau Response Received*\n` +
      `*Client:* ${client.name}\n` +
      `*Bureau:* ${bureau}\n` +
      `*Round:* ${round}\n` +
      `*Items Removed:* ${itemsRemoved}\n` +
      `*Items Verified (not removed):* ${itemsVerified}`
    );

    // If items were verified (not removed), trigger the next round
    if (itemsVerified > 0 && round < 3) {
      const nextRound = (round + 1) as 1 | 2 | 3;
      console.log(`  → ${itemsVerified} items verified — triggering Round ${nextRound}`);

      const report = await resolveClientReport(client);
      if (report && report.accounts.length > 0) {
        await runDisputePipeline(client.id, report, nextRound);
      } else {
        await notifySlack(
          `⚠️ Cannot auto-trigger Round ${nextRound} for ${client.name} — report data unavailable. Manual trigger required.`
        );
      }
    }

  } catch (err) {
    console.error(`  ✗ Webhook bureau-response error: ${(err as Error).message}`);
    await notifyError('Webhook: bureau-response', err as Error);
  }
});

// ── Webhook: Deletion confirmed ───────────────────────────────
// Fires when CRC marks an item as deleted from the report.

app.post('/webhook/deletion-confirmed', async (req, res) => {
  const payload = req.body as CRCWebhookPayload;

  if (!payload?.clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  res.json({ received: true });

  try {
    const { creditor = 'Unknown', bureau = 'Unknown' } = (payload.data ?? {}) as {
      creditor?: string;
      bureau?:   string;
    };
    const client = await getCRCClient(payload.clientId);

    recordPipelineEvent(client.id, 'deletion_confirmed', { creditor, bureau });

    await notifySlack(
      `🎉 *DELETION CONFIRMED*\n` +
      `*Client:* ${client.name}\n` +
      `*Removed:* ${creditor}\n` +
      `*Bureau:* ${bureau}\n` +
      `*Status:* Account removed from credit report ✓`
    );

    await addCRCNote(client.id,
      `700CreditAI: DELETION CONFIRMED — ${creditor} removed from ${bureau} report.`
    );

  } catch (err) {
    await notifyError('Webhook: deletion-confirmed', err as Error);
  }
});

// ============================================================
// MANUAL TRIGGER ENDPOINTS
// ============================================================

// ── Force immediate poll ──────────────────────────────────────

app.post('/poll/now', async (_req, res) => {
  res.json({ message: 'Poll triggered', timestamp: new Date().toISOString() });
  pollCRCAndDispatch().catch(err => console.error('Manual poll error:', err));
});

// ── Single-client manual trigger ─────────────────────────────
// Body: { clientId, round, report (optional) }

app.post('/trigger/client', async (req, res) => {
  const { clientId, round = 1, report } = req.body as {
    clientId: string;
    round?:   number;
    report?:  CreditReport;
  };

  if (!clientId) {
    return res.status(400).json({ error: 'clientId required' });
  }

  res.json({
    message:  `Round ${round} triggered for ${clientId}`,
    clientId,
    round,
  });

  try {
    let reportToUse = report;

    if (!reportToUse) {
      // Try to resolve the real report first
      const client = await getCRCClient(clientId);
      reportToUse  = await resolveClientReport(client) ?? undefined;
    }

    if (!reportToUse || reportToUse.accounts.length === 0) {
      console.warn(`  ⚠️  No report data for ${clientId} — pipeline will run with empty report`);
      // Fall back to minimal shell for testing/manual triggers
      reportToUse = {
        clientId,
        reportDate:    new Date(),
        personalInfo:  { name: clientId, address: '', city: '', state: 'FL', zip: '' },
        scores:        { Equifax: 0, Experian: 0, TransUnion: 0 },
        accounts:      [],
        inquiries:     [],
        publicRecords: [],
      };
    }

    runDisputePipeline(clientId, reportToUse, round as 1 | 2 | 3)
      .catch(err => console.error('Manual trigger error:', err));

  } catch (err) {
    console.error('Manual trigger error:', err);
  }
});

// ── Client dispute history ────────────────────────────────────

app.get('/client/:clientId/history', (req, res) => {
  const { clientId } = req.params;
  const filedKeys    = getFiledDisputeKeys(clientId);
  const scoreHistory = getScoreHistory(clientId);

  res.json({
    clientId,
    totalFiledDisputes: filedKeys.size,
    scoreHistory,
  });
});

// ── Start server + scheduler ──────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 JECI AI Dispute Agent — Port ${PORT}`);
  console.log(`   700 Credit Club Experts | JECI Group`);
  console.log(`   Legal. Moral. Ethical & Factual Credit Services.\n`);

  const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES ?? '60');
  startScheduler(POLL_INTERVAL_MINUTES);
});

export default app;
