// ============================================================
// JECI AI — CRC Poll Scheduler
// Since CRC has no native webhooks in the base plan, we poll
// on a schedule. Runs every hour. Checks every active client's
// pipeline stage and triggers the right dispute round automatically.
//
// Report data priority order:
//   1. Credit Hero Score API (real-time 3-bureau report)
//   2. CRC Tradelines API  (if CRC_API_ENABLED=true)
//   3. HALT with Slack alert (no report = no disputes)
// ============================================================

import { getCRCClient, getAllActiveClients, addCRCNote, crcFetch } from '../tools/crcClient.js';
import { runDisputePipeline } from '../agents/disputeAgent.js';
import { notifySlack, notifyError } from '../tools/slackNotifier.js';
import { fetchCreditHeroReport, fetchCRCTradelines } from '../tools/creditHeroClient.js';
import { emailClientReportNeeded } from '../tools/emailer.js';
import { getCachedReport, cacheReport } from '../db/disputeDb.js';
import { CRCClient, CreditReport } from '../types/index.js';

// ── How many days to wait between rounds ─────────────────────
const DAYS_BEFORE_ROUND_2     = 35;
const DAYS_BEFORE_ROUND_3     = 35;
const DAYS_BEFORE_LEGAL_REVIEW = 15;

// ── Stage → round mapping ─────────────────────────────────────
const STAGE_ACTIONS: Record<string, {
  nextRound:  number;
  waitDays:   number;
  stageSetAt: string;
}> = {
  'Enrolled / Active': {
    nextRound:  1,
    waitDays:   0,
    stageSetAt: 'JECI_AI_ENROLLED',
  },
  'Round 1 Disputes Filed': {
    nextRound:  2,
    waitDays:   DAYS_BEFORE_ROUND_2,
    stageSetAt: 'JECI_AI_SCHEDULE: Round 2',
  },
  'Round 2 Disputes Filed': {
    nextRound:  3,
    waitDays:   DAYS_BEFORE_ROUND_3,
    stageSetAt: 'JECI_AI_SCHEDULE: Round 3',
  },
  'Round 3 / Advanced Legal': {
    nextRound:  0, // No auto-next — needs human review
    waitDays:   DAYS_BEFORE_LEGAL_REVIEW,
    stageSetAt: 'JECI_AI_SCHEDULE: Legal review',
  },
};

// ── Parse scheduled date from CRC notes ──────────────────────
function parseScheduledDate(notes: string[]): Date | null {
  for (const note of notes) {
    const match = note.match(/JECI_AI_SCHEDULE:.*on (\d{1,2}\/\d{1,2}\/\d{4})/);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function isReadyForNextRound(
  client:   CRCClient & { notes?: string[] },
  waitDays: number,
): boolean {
  if (waitDays === 0) return true;

  const notes         = client.notes ?? [];
  const scheduledDate = parseScheduledDate(notes);

  if (scheduledDate) {
    return new Date() >= scheduledDate;
  }

  return daysSince(client.enrolledAt) >= waitDays;
}

// ── Credit Report Resolver ────────────────────────────────────
// Tries to get a real, populated credit report for the client.
// Priority: Credit Hero Score → CRC Tradelines → DB cache → HALT
//
// Returns null if no report data is available (caller should halt).

export async function resolveClientReport(client: CRCClient): Promise<CreditReport | null> {
  const personalInfo = {
    name:    client.name,
    address: client.address,
    city:    client.city,
    state:   client.state,
    zip:     client.zip,
  };

  const scores = {
    Equifax:    client.scores?.Equifax    ?? 0,
    Experian:   client.scores?.Experian   ?? 0,
    TransUnion: client.scores?.TransUnion ?? 0,
  };

  // ── 1. Try Credit Hero Score API ──────────────────────────
  if (client.email) {
    const chsReport = await fetchCreditHeroReport(client.id, client.email);
    if (chsReport && chsReport.accounts.length > 0) {
      cacheReport(client.id, 'credit_hero', chsReport);
      return chsReport;
    }
  }

  // ── 2. Try CRC Tradelines (requires Grow/Scale plan) ──────
  if (process.env.CRC_API_ENABLED !== 'false') {
    const crcReport = await fetchCRCTradelines(
      client.id,
      personalInfo,
      scores,
      (path, xmlData) => crcFetch(path, 'POST', xmlData),
    );
    if (crcReport.accounts.length > 0) {
      cacheReport(client.id, 'crc_tradelines', crcReport);
      return crcReport;
    }
  }

  // ── 3. Try DB cache (last successfully pulled report) ─────
  const cached = getCachedReport(client.id);
  if (cached) {
    const hoursOld = (Date.now() - new Date(cached.pulledAt).getTime()) / (1000 * 60 * 60);
    if (hoursOld < 168) { // Use cached report if less than 7 days old
      console.log(`  ℹ️  Using cached ${cached.source} report (${hoursOld.toFixed(0)}h old)`);
      return cached.report as CreditReport;
    }
  }

  // ── 4. No report available — HALT ────────────────────────
  return null;
}

// ── Core poll function ────────────────────────────────────────

export async function pollCRCAndDispatch(): Promise<void> {
  if (process.env.CRC_API_ENABLED === 'false') {
    console.log('  ⏸️  CRC polling disabled (CRC_API_ENABLED=false). Upgrade CRC plan to Grow/Scale and flip to true.');
    return;
  }

  const startTime = Date.now();
  console.log(`\n⏰ [${new Date().toISOString()}] JECI AI Scheduler — Poll starting...`);

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;
  let halted    = 0;

  try {
    const clients = await getAllActiveClients();
    console.log(`  → Found ${clients.length} active clients`);

    if (clients.length === 0) {
      console.log('  → No active clients. Poll complete.');
      return;
    }

    for (const client of clients) {
      try {
        const action = STAGE_ACTIONS[client.pipelineStage];

        if (!action) {
          skipped++;
          continue;
        }

        if (action.nextRound === 0) {
          console.log(`  ⚖️  ${client.name} — Awaiting legal review`);
          skipped++;
          continue;
        }

        const clientWithNotes = client as CRCClient & { notes?: string[] };
        if (!isReadyForNextRound(clientWithNotes, action.waitDays)) {
          console.log(`  ⏳ ${client.name} — Not ready yet (Round ${action.nextRound})`);
          skipped++;
          continue;
        }

        // ── Resolve credit report ──────────────────────────
        console.log(`\n  🔍 ${client.name} — Resolving credit report...`);
        const report = await resolveClientReport(client);

        if (!report || report.accounts.length === 0) {
          // No report — halt and notify both Slack and client
          halted++;
          const msg =
            `⚠️ *Report Not Found — Halted*\n` +
            `*Client:* ${client.name} (${client.id})\n` +
            `*Stage:* ${client.pipelineStage}\n` +
            `*Action:* Cannot proceed. Client must pull and sync their 3-bureau ` +
            `credit report from Credit Hero Score or upload it to CRC.`;

          console.warn(`  ⚠️  No report found for ${client.name} — halting`);
          await notifySlack(msg);
          await emailClientReportNeeded(client).catch(() => {});
          continue;
        }

        // ✅ Report found — fire the dispute pipeline
        console.log(`\n  🚀 ${client.name} — Triggering Round ${action.nextRound}`);

        await runDisputePipeline(
          client.id,
          report,
          action.nextRound as 1 | 2 | 3,
        );

        processed++;
        await new Promise(r => setTimeout(r, 2000)); // Rate limit between clients

      } catch (clientErr) {
        errors++;
        const msg = `Poll error for ${client.name}: ${(clientErr as Error).message}`;
        console.error(`  ✗ ${msg}`);
        await notifyError(`Scheduler — ${client.name}`, clientErr as Error);
      }
    }

  } catch (err) {
    console.error('  ✗ Poll failed:', (err as Error).message);
    await notifyError('CRC Poll Scheduler', err as Error);
    return;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Poll complete in ${elapsed}s`);
  console.log(`   Processed: ${processed} | Skipped: ${skipped} | Halted: ${halted} | Errors: ${errors}`);

  if (processed > 0 || errors > 0 || halted > 0) {
    await notifySlack(
      `⏰ *JECI AI Scheduler Run Complete*\n` +
      `• Clients processed: ${processed}\n` +
      `• Skipped (not ready): ${skipped}\n` +
      `• Halted (no report): ${halted}\n` +
      `• Errors: ${errors}\n` +
      `• Duration: ${elapsed}s`,
    );
  }
}

// ── Interval-based scheduler ──────────────────────────────────

export function startScheduler(intervalMinutes = 60): NodeJS.Timeout {
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`\n🕐 JECI AI Scheduler started — polling every ${intervalMinutes} minutes`);

  pollCRCAndDispatch().catch(err =>
    console.error('Initial poll error:', err),
  );

  return setInterval(() => {
    pollCRCAndDispatch().catch(err =>
      console.error('Scheduled poll error:', err),
    );
  }, intervalMs);
}
