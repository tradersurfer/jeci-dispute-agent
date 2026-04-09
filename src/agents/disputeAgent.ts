// ============================================================
// JECI AI — Dispute Agent Orchestrator
// 700 Credit Club Experts | JECI Group
// Pure TypeScript — no external agent framework needed
// ============================================================

import { CreditReport, DisputeRound, WorkflowResult } from '../types/index.js';
import { analyzeReport, groupDisputesByBureau, filterItemsForRound } from '../tools/reportAnalyzer.js';
import { generateLettersForRound } from '../tools/letterGenerator.js';
import {
  getCRCClient,
  updatePipelineStage,
  attachDisputeLetter,
  addCRCNote,
  updateClientScores,
  configureCRCMailSettings,
} from '../tools/crcClient.js';
import {
  notifyAnalysisComplete,
  notifyRoundComplete,
  notifyError,
  notifySlack,
} from '../tools/slackNotifier.js';
import {
  emailClientAnalysis,
  emailClientDisputeLetters,
  emailClientRoundSummary,
} from '../tools/emailer.js';
import {
  recordFiledDisputes,
  getFiledDisputeKeys,
  getFiledKeysForRound,
  recordScoreSnapshot,
  recordPipelineEvent,
} from '../db/disputeDb.js';

// ── Core Agent: run the full dispute pipeline for a client ───

export async function runDisputePipeline(
  clientId:        string,
  report:          CreditReport,
  round:           DisputeRound = 1,
): Promise<WorkflowResult> {

  console.log(`\n🤖 700CreditAI — Round ${round} starting for ${clientId}`);
  const errors: string[]   = [];
  let lettersGenerated      = 0;

  try {
    const client = await getCRCClient(clientId);
    console.log(`  → Client: ${client.name}`);

    // ── 1. Snapshot scores before this round ──────────────
    // Baseline (round 0) is recorded on first enrollment.
    // Each round records the current scores so we can track
    // score improvement over time.
    const currentScores = report.scores;
    if (currentScores.Equifax || currentScores.Experian || currentScores.TransUnion) {
      // Record baseline on Round 1 (round 0 = pre-dispute baseline)
      if (round === 1) {
        recordScoreSnapshot(clientId, 0, {
          equifax:    currentScores.Equifax,
          experian:   currentScores.Experian,
          transunion: currentScores.TransUnion,
        });

        // Also update CRC with current scores so they're visible in dashboard
        await updateClientScores(clientId, {
          equifax:    currentScores.Equifax,
          experian:   currentScores.Experian,
          transunion: currentScores.TransUnion,
        }).catch(err => console.warn(`  ⚠️  Score update skipped: ${err.message}`));
      }

      // Always record snapshot for current round entry
      recordScoreSnapshot(clientId, round, {
        equifax:    currentScores.Equifax,
        experian:   currentScores.Experian,
        transunion: currentScores.TransUnion,
      });
    }

    // ── 2. Configure CRC mail settings (Lob FirstClass) ───
    // Operator adds funds in CRC → Settings → Mail.
    // The agent sets the mail class — CRC + Lob handles the rest.
    if (round === 1) {
      await configureCRCMailSettings(clientId, { mailClass: 'first_class' })
        .catch(() => {}); // Non-fatal
    }

    // ── 3. Analyze credit report ──────────────────────────
    const analysis = analyzeReport(report);
    console.log(`  → ${analysis.disputeItems.length} disputable items found`);
    console.log(`  → Quick wins: ${analysis.quickWins.length}`);
    console.log(`  → Est. recovery: +${analysis.estimatedPointRecovery} pts`);

    recordPipelineEvent(clientId, `round_${round}_analysis`, {
      totalItems:      analysis.disputeItems.length,
      quickWins:       analysis.quickWins.length,
      estimatedPoints: analysis.estimatedPointRecovery,
    });

    if (round === 1) {
      await notifyAnalysisComplete(analysis);
      // Email client their audit results
      await emailClientAnalysis(client, analysis).catch(err =>
        console.warn(`  ⚠️  Analysis email skipped: ${err.message}`)
      );
    }

    // ── 4. Get previously filed disputes from DB ──────────
    // Use the database (not fragile note-string parsing) to
    // determine which items have already been filed.
    const previouslyFiledAll  = getFiledDisputeKeys(clientId);
    const previouslyFiledRound1 = round >= 2 ? getFiledKeysForRound(clientId, 1) : new Set<string>();

    // For round 2, we need items that WERE filed in round 1 (bureau verified them)
    const previouslyFiled = round === 2 ? previouslyFiledRound1 : previouslyFiledAll;

    const roundItems = filterItemsForRound(analysis.disputeItems, round, previouslyFiled);
    console.log(`  → Round ${round} targets: ${roundItems.length} items`);

    if (roundItems.length === 0) {
      await notifySlack(`ℹ️ Round ${round} for ${client.name}: No items — advancing pipeline.`);
      const stageMap: Record<number, string> = {
        1: 'Round 1 Disputes Filed',
        2: 'Round 2 Disputes Filed',
        3: 'Credit Building Phase',
      };
      await updatePipelineStage(clientId, stageMap[round] as any);
      recordPipelineEvent(clientId, `round_${round}_no_items`);
      return {
        clientId, round, success: true,
        lettersGenerated: 0, itemsTargeted: 0,
        bureausTargeted: [], errors: [],
        nextAction:     'No items — advancing pipeline',
        nextActionDate: new Date(),
      };
    }

    // ── 5. Group by bureau + generate letters ─────────────
    const byBureau       = groupDisputesByBureau(roundItems);
    const bureausTargeted = [...byBureau.keys()];

    const letters = await generateLettersForRound(
      {
        clientName:    client.name,
        clientAddress: `${client.address}, ${client.city}, ${client.state} ${client.zip}`,
        items:         roundItems,
      },
      round,
      byBureau,
    );

    // ── 6. Attach letters to CRC + record in DB ───────────
    const filedDisputeRecords = [];

    for (const letter of letters) {
      try {
        letter.clientId = clientId;
        await attachDisputeLetter(clientId, letter);
        lettersGenerated++;

        // Record each dispute item in the database
        for (const item of letter.items) {
          filedDisputeRecords.push({
            clientId,
            accountId: item.accountId,
            bureau:    item.bureau,
            round,
            reason:    item.reason,
            creditor:  item.creditorName,
          });
        }
      } catch (err) {
        const msg = `Failed to attach ${letter.bureau} letter: ${(err as Error).message}`;
        errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }

    // Persist all filed disputes to SQLite
    if (filedDisputeRecords.length > 0) {
      recordFiledDisputes(filedDisputeRecords);
      console.log(`  ✓ DB: ${filedDisputeRecords.length} dispute records saved`);
    }

    // ── 7. Email client copies of all letters ─────────────
    await emailClientDisputeLetters(client, letters, round).catch(err =>
      console.warn(`  ⚠️  Letter email skipped: ${err.message}`)
    );

    // ── 8. Add CRC note + update pipeline stage ───────────
    await addCRCNote(
      clientId,
      `700CreditAI Round ${round} Complete:\n` +
      `• ${roundItems.length} items targeted\n` +
      `• ${lettersGenerated} letters generated\n` +
      `• Bureaus: ${bureausTargeted.join(', ')}\n` +
      `• Est. recovery: +${analysis.estimatedPointRecovery} pts`,
    );

    const stageMap: Record<number, string> = {
      1: 'Round 1 Disputes Filed',
      2: 'Round 2 Disputes Filed',
      3: 'Round 3 / Advanced Legal',
    };
    await updatePipelineStage(clientId, stageMap[round] as any);

    const daysUntilNext = round === 3 ? 15 : 35;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysUntilNext);

    await addCRCNote(clientId,
      `700CreditAI_SCHEDULE: Round ${round + 1} check on ${nextDate.toLocaleDateString()}`,
    );

    // ── 9. Build result + notify ───────────────────────────
    const nextActionMap: Record<number, string> = {
      1: 'Round 2 — Creditor Direct Disputes',
      2: 'Round 3 — Advanced Legal Escalation',
      3: 'Await 15-day legal response',
    };

    const result: WorkflowResult = {
      clientId, round, success: true,
      lettersGenerated, itemsTargeted: roundItems.length,
      bureausTargeted, errors,
      nextAction:     nextActionMap[round],
      nextActionDate: nextDate,
    };

    await notifyRoundComplete(result);
    await emailClientRoundSummary(client, result).catch(err =>
      console.warn(`  ⚠️  Round summary email skipped: ${err.message}`)
    );

    recordPipelineEvent(clientId, `round_${round}_complete`, {
      lettersGenerated,
      itemsTargeted:  roundItems.length,
      bureausTargeted,
      nextActionDate: nextDate.toISOString(),
    });

    console.log(`\n✅ Round ${round} complete — ${lettersGenerated} letters generated.`);
    return result;

  } catch (err) {
    const error = err as Error;
    await notifyError(`Round ${round} for ${clientId}`, error);
    console.error(`\n✗ Round ${round} failed:`, error.message);
    recordPipelineEvent(clientId, `round_${round}_error`, { message: error.message });
    return {
      clientId, round, success: false,
      lettersGenerated, itemsTargeted: 0,
      bureausTargeted: [], errors: [error.message],
      nextAction:      `Retry Round ${round}`,
      nextActionDate:  new Date(),
    };
  }
}
