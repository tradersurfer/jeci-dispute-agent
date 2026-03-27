// ============================================================
// JECI AI — Round 1 Dispute Workflow
// Direct bureau disputes targeting high-confidence items
// ============================================================

import {
  CreditReport,
  WorkflowResult,
  DisputeRound,
} from '../types/index.js';

import {
  analyzeReport,
  groupDisputesByBureau,
  filterItemsForRound,
} from '../tools/reportAnalyzer.js';

import { generateLettersForRound } from '../tools/letterGenerator.js';

import {
  getCRCClient,
  updatePipelineStage,
  attachDisputeLetter,
  addCRCNote,
} from '../tools/crcClient.js';

import {
  notifyAnalysisComplete,
  notifyRoundComplete,
  notifyError,
} from '../tools/slackNotifier.js';

// ── Schedule helper (stores in CRC note for now) ─────────────

async function scheduleNextRound(
  clientId: string,
  round: DisputeRound,
  daysFromNow: number,
): Promise<Date> {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + daysFromNow);

  await addCRCNote(
    clientId,
    `JECI_AI_SCHEDULE: Round ${round} check scheduled for ${nextDate.toLocaleDateString()}`,
  );

  return nextDate;
}

// ── Main Round 1 Runner ───────────────────────────────────────

export async function runRound1(
  clientId: string,
  report: CreditReport,
): Promise<WorkflowResult> {

  console.log(`\n🤖 JECI AI — Round 1 starting for client ${clientId}`);

  const errors: string[] = [];
  let lettersGenerated = 0;

  try {
    // 1. Pull client profile from CRC
    const client = await getCRCClient(clientId);
    console.log(`  → Client: ${client.name}`);

    // 2. Run report analysis
    console.log('  → Running FCRA/FDCPA analysis...');
    const analysis = analyzeReport(report);
    console.log(`  → Found ${analysis.disputeItems.length} disputable items`);
    console.log(`  → Quick wins: ${analysis.quickWins.length}`);
    console.log(`  → Est. recovery: +${analysis.estimatedPointRecovery} pts`);

    // 3. Notify Slack with full analysis
    await notifyAnalysisComplete(analysis);

    // 4. Filter items appropriate for Round 1
    const round1Items = filterItemsForRound(analysis.disputeItems, 1);
    console.log(`  → Round 1 targets: ${round1Items.length} items`);

    if (round1Items.length === 0) {
      await addCRCNote(clientId, 'JECI AI: No Round 1 disputable items found. Escalating to Round 2.');
      await updatePipelineStage(clientId, 'Round 2 Disputes Filed');

      return {
        clientId, round: 1, success: true,
        lettersGenerated: 0, itemsTargeted: 0,
        bureausTargeted: [], errors: [],
        nextAction: 'Skip to Round 2',
        nextActionDate: new Date(),
      };
    }

    // 5. Group by bureau
    const byBureau = groupDisputesByBureau(round1Items);
    const bureausTargeted = [...byBureau.keys()];
    console.log(`  → Targeting bureaus: ${bureausTargeted.join(', ')}`);

    // 6. Generate letters for each bureau
    console.log('  → Generating dispute letters via Claude API...');
    const letters = await generateLettersForRound(
      {
        clientName:    client.name,
        clientAddress: `${client.address}, ${client.city}, ${client.state} ${client.zip}`,
        items:         round1Items,
      },
      1,
      byBureau,
    );

    // 7. Attach letters to CRC client file
    for (const letter of letters) {
      try {
        letter.clientId = clientId;
        await attachDisputeLetter(clientId, letter);
        lettersGenerated++;
      } catch (err) {
        const msg = `Failed to attach letter for ${letter.bureau}: ${(err as Error).message}`;
        errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }

    // 8. Log summary note in CRC
    await addCRCNote(
      clientId,
      `JECI AI Round 1 Complete:\n` +
      `• ${round1Items.length} items targeted\n` +
      `• ${lettersGenerated} letters generated\n` +
      `• Bureaus: ${bureausTargeted.join(', ')}\n` +
      `• Est. point recovery: +${analysis.estimatedPointRecovery}\n` +
      `• Human review needed: ${analysis.humanReviewRequired}\n` +
      `• Analysis: ${analysis.summary}`,
    );

    // 9. Update pipeline stage
    await updatePipelineStage(clientId, 'Round 1 Disputes Filed');

    // 10. Schedule Round 2 (35 days — gives bureaus 30 days + buffer)
    const nextDate = await scheduleNextRound(clientId, 2, 35);

    const result: WorkflowResult = {
      clientId,
      round: 1,
      success: true,
      lettersGenerated,
      itemsTargeted: round1Items.length,
      bureausTargeted,
      errors,
      nextAction: 'Round 2 — Creditor Direct Disputes',
      nextActionDate: nextDate,
    };

    await notifyRoundComplete(result);
    console.log(`\n✅ Round 1 complete for ${clientId}. ${lettersGenerated} letters sent.`);

    return result;

  } catch (err) {
    const error = err as Error;
    await notifyError(`Round 1 for client ${clientId}`, error);
    console.error(`\n✗ Round 1 failed for ${clientId}:`, error.message);

    return {
      clientId, round: 1, success: false,
      lettersGenerated, itemsTargeted: 0,
      bureausTargeted: [], errors: [error.message],
      nextAction: 'Retry Round 1',
      nextActionDate: new Date(),
    };
  }
}