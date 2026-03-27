// ============================================================
// JECI AI — Webhook Receiver
// Railway entry point. CRC fires webhooks here.
// ============================================================

import express            from 'express';
import { CRCWebhookPayload, CreditReport } from '../types/index.js';
import { runRound1 }      from '../workflows/round1Dispute.js';
import { runRound2, runRound3 } from '../workflows/round2and3Dispute.js';
import {
  notifyNewClientEnrolled,
  notifyDeletion,
  notifySlack,
}                         from '../tools/slackNotifier.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ── Health check ─────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status:  'JECI AI Dispute Agent — Online',
    version: '1.0.0',
    company: '700 Credit Club Experts | JECI Group',
  });
});

// ── New client enrolled ───────────────────────────────────────
// CRC fires this when a client completes enrollment

app.post('/webhook/new-client', async (req, res) => {
  const payload = req.body as CRCWebhookPayload;
  const { clientId, clientName } = payload;

  console.log(`\n📥 Webhook: new-client → ${clientId} (${clientName})`);

  // Respond to CRC immediately (don't keep them waiting)
  res.json({ received: true, clientId });

  try {
    await notifyNewClientEnrolled(clientName ?? 'Unknown', clientId);
    // Note: full Round 1 kicks off once client uploads their credit report
    await notifySlack(
      `✅ ${clientName} enrolled. Awaiting credit report upload to begin AI audit.`,
    );
  } catch (err) {
    console.error('new-client webhook error:', err);
  }
});

// ── Report uploaded ───────────────────────────────────────────
// CRC fires this when client uploads their credit report PDF

app.post('/webhook/report-uploaded', async (req, res) => {
  const payload = req.body as CRCWebhookPayload & { report?: CreditReport };
  const { clientId, clientName, report } = payload;

  console.log(`\n📥 Webhook: report-uploaded → ${clientId}`);
  res.json({ received: true, clientId });

  if (!report) {
    await notifySlack(`⚠️ Report uploaded for ${clientName} but no parsed data received. Manual review needed.`);
    return;
  }

  try {
    // Kick off Round 1 dispute workflow
    await runRound1(clientId, report);
  } catch (err) {
    console.error('report-uploaded workflow error:', err);
    await notifySlack(`🚨 Round 1 failed for ${clientName} (${clientId}): ${(err as Error).message}`);
  }
});

// ── Bureau response received ──────────────────────────────────
// CRC fires this when a bureau responds to a Round 1 dispute

app.post('/webhook/bureau-response', async (req, res) => {
  const {
    clientId,
    clientName,
    round,
    deletions,
    verifiedItems,
    report,
  } = req.body as CRCWebhookPayload & {
    round:         number;
    deletions:     string[];
    verifiedItems: any[];
    report:        CreditReport;
  };

  console.log(`\n📥 Webhook: bureau-response → ${clientId} (Round ${round})`);
  res.json({ received: true });

  try {
    // Announce deletions
    for (const deletion of (deletions ?? [])) {
      await notifyDeletion(clientId, clientName ?? 'Client', deletion, 'Bureau');
    }

    // Escalate verified (refused) items to next round
    if (verifiedItems?.length > 0 && round < 3) {
      await notifySlack(
        `⚡ ${verifiedItems.length} items verified by bureau for ${clientName}. ` +
        `Escalating to Round ${round + 1}...`,
      );

      if (round === 1) {
        await runRound2(clientId, report, verifiedItems);
      } else if (round === 2) {
        await runRound3(clientId, report, verifiedItems);
      }
    } else if (verifiedItems?.length === 0) {
      await notifySlack(
        `🎉 All items resolved for ${clientName}! Moving to Credit Building phase.`,
      );
    }
  } catch (err) {
    console.error('bureau-response webhook error:', err);
    await notifySlack(`🚨 Bureau response processing failed for ${clientName}: ${(err as Error).message}`);
  }
});

// ── Deletion confirmed ────────────────────────────────────────

app.post('/webhook/deletion-confirmed', async (req, res) => {
  const { clientId, clientName, creditor, bureau } = req.body;

  console.log(`\n📥 Webhook: deletion-confirmed → ${clientId} (${creditor} / ${bureau})`);
  res.json({ received: true });

  await notifyDeletion(clientId, clientName, creditor, bureau);
});

// ── Lead created (from Facebook group / website) ──────────────

app.post('/webhook/lead-created', async (req, res) => {
  const { clientId, clientName, source } = req.body;

  console.log(`\n📥 Webhook: lead-created → ${clientId}`);
  res.json({ received: true });

  await notifySlack(
    `🎯 New lead: *${clientName}* via ${source ?? 'unknown source'} (ID: ${clientId})`,
  );
});

// ── Manual trigger endpoint (for testing) ─────────────────────

app.post('/trigger/round1', async (req, res) => {
  const { clientId, report } = req.body as { clientId: string; report: CreditReport };

  if (!clientId || !report) {
    return res.status(400).json({ error: 'clientId and report required' });
  }

  res.json({ message: 'Round 1 triggered', clientId });

  try {
    await runRound1(clientId, report);
  } catch (err) {
    console.error('Manual Round 1 trigger error:', err);
  }
});

// ── Start server ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 JECI AI Dispute Agent running on port ${PORT}`);
  console.log(`   700 Credit Club Experts | JECI Group`);
  console.log(`   Legal. Moral. Ethical & Factual Credit Services.\n`);
});

export default app;
