// ============================================================
// JECI AI — CRC Poll Scheduler
// Since CRC has no native webhooks, we poll on a schedule.
// Runs every hour. Checks every active client's pipeline stage
// and triggers the right dispute round automatically.
// ============================================================

import { getCRCClient, getAllActiveClients, addCRCNote } from '../tools/crcClient.js';
import { runDisputePipeline } from '../agents/disputeAgent.js';
import { notifySlack, notifyError } from '../tools/slackNotifier.js';
import { CRCClient } from '../types/index.js';

// ── How many days to wait between rounds ─────────────────────
const DAYS_BEFORE_ROUND_2 = 35;
const DAYS_BEFORE_ROUND_3 = 35;
const DAYS_BEFORE_LEGAL_REVIEW = 15;

// ── Stage → round mapping ─────────────────────────────────────
// Which pipeline stages mean "ready for next action"
const STAGE_ACTIONS: Record<string, {
  nextRound: number;
  waitDays: number;
  stageSetAt: string; // Note prefix JECI AI writes when entering this stage
}> = {
  'Enrolled / Active': {
    nextRound: 1,
    waitDays: 0, // Fire immediately on enrollment
    stageSetAt: 'JECI_AI_ENROLLED',
  },
  'Round 1 Disputes Filed': {
    nextRound: 2,
    waitDays: DAYS_BEFORE_ROUND_2,
    stageSetAt: 'JECI_AI_SCHEDULE: Round 2',
  },
  'Round 2 Disputes Filed': {
    nextRound: 3,
    waitDays: DAYS_BEFORE_ROUND_3,
    stageSetAt: 'JECI_AI_SCHEDULE: Round 3',
  },
  'Round 3 / Advanced Legal': {
    nextRound: 0, // No auto-next — needs human review
    waitDays: DAYS_BEFORE_LEGAL_REVIEW,
    stageSetAt: 'JECI_AI_SCHEDULE: Legal review',
  },
};

// ── Parse scheduled date from CRC notes ──────────────────────
// We store "JECI_AI_SCHEDULE: Round X check on MM/DD/YYYY" in notes
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
  client: CRCClient & { notes?: string[] },
  waitDays: number,
): boolean {
  // No wait required (e.g. fresh enrollment)
  if (waitDays === 0) return true;

  // Look for scheduled date in client notes
  const notes = client.notes ?? [];
  const scheduledDate = parseScheduledDate(notes);

  if (scheduledDate) {
    return new Date() >= scheduledDate;
  }

  // Fallback: check enrolledAt + wait days
  return daysSince(client.enrolledAt) >= waitDays;
}

// ── Mock report builder ───────────────────────────────────────
// In production, this would fetch the actual parsed report from
// your storage (S3, CRC documents, etc.)
// For now returns a minimal report shell — swap in real parsing later
function buildReportShell(client: CRCClient) {
  return {
    clientId: client.id,
    reportDate: new Date(),
    personalInfo: {
      name: client.name,
      address: client.address,
      city: client.city,
      state: client.state,
      zip: client.zip,
    },
    scores: {
      Equifax: client.scores?.Equifax ?? 0,
      Experian: client.scores?.Experian ?? 0,
      TransUnion: client.scores?.TransUnion ?? 0,
    },
    accounts: [],
    inquiries: [],
    publicRecords: [],
  };
}

// ── Core poll function ────────────────────────────────────────

export async function pollCRCAndDispatch(): Promise<void> {
  // Guard: skip if CRC API disabled (free trial / plan not upgraded)
  if (process.env.CRC_API_ENABLED === 'false') {
    console.log("⏸️  CRC polling disabled — CRC_API_ENABLED=false. Set to true once on Grow/Scale plan.");
    return;
  }

  const startTime = Date.now();
  console.log(`\n⏰ [${new Date().toISOString()}] JECI AI Scheduler — Poll starting...`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 1. Pull all active clients from CRC
    const clients = await getAllActiveClients();
    console.log(`  → Found ${clients.length} active clients`);

    if (clients.length === 0) {
      console.log('  → No active clients. Poll complete.');
      return;
    }

    // 2. Check each client
    for (const client of clients) {
      try {
        const action = STAGE_ACTIONS[client.pipelineStage];

        // Skip clients not in an actionable stage
        if (!action) {
          skipped++;
          continue;
        }

        // Skip if human review stage (round 3 legal — needs you)
        if (action.nextRound === 0) {
          console.log(`  ⚖️  ${client.name} — Awaiting legal review`);
          skipped++;
          continue;
        }

        // Check if enough time has passed
        const clientWithNotes = client as CRCClient & { notes?: string[] };
        if (!isReadyForNextRound(clientWithNotes, action.waitDays)) {
          console.log(`  ⏳ ${client.name} — Not ready yet (Round ${action.nextRound})`);
          skipped++;
          continue;
        }

        // ✅ This client is ready — fire the dispute pipeline
        console.log(`\n  🚀 ${client.name} — Triggering Round ${action.nextRound}`);

        const report = buildReportShell(client);

        await runDisputePipeline(
          client.id,
          report as any,
          action.nextRound as 1 | 2 | 3,
        );

        processed++;

        // Small delay between clients to avoid hammering the API
        await new Promise(r => setTimeout(r, 2000));

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
  console.log(`   Processed: ${processed} | Skipped: ${skipped} | Errors: ${errors}`);

  // Only notify Slack if something actually happened
  if (processed > 0 || errors > 0) {
    await notifySlack(
      `⏰ *JECI AI Scheduler Run Complete*\n` +
      `• Clients processed: ${processed}\n` +
      `• Skipped (not ready): ${skipped}\n` +
      `• Errors: ${errors}\n` +
      `• Duration: ${elapsed}s`,
    );
  }
}

// ── Interval-based scheduler ──────────────────────────────────
// Runs every X minutes. Default: 60 minutes.

export function startScheduler(intervalMinutes = 60): NodeJS.Timeout {
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`\n🕐 JECI AI Scheduler started — polling every ${intervalMinutes} minutes`);

  // Run once immediately on startup
  pollCRCAndDispatch().catch(err =>
    console.error('Initial poll error:', err),
  );

  // Then on interval
  return setInterval(() => {
    pollCRCAndDispatch().catch(err =>
      console.error('Scheduled poll error:', err),
    );
  }, intervalMs);
}