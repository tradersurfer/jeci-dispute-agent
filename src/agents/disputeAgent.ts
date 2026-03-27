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
} from '../tools/crcClient.js';
import {
  notifyAnalysisComplete,
  notifyRoundComplete,
  notifyError,
  notifySlack,
} from '../tools/slackNotifier.js';

// ── Core Agent: run the full dispute pipeline for a client ───

export async function runDisputePipeline(
  clientId: string,
  report: CreditReport,
  round: DisputeRound = 1,
  previouslyFiled?: Set<string>,
): Promise<WorkflowResult> {

  console.log(`\n🤖 700CreditAI — Round ${round} starting for ${clientId}`);
  const errors: string[] = [];
  let lettersGenerated = 0;

  try {
    const client = await getCRCClient(clientId);
    console.log(`  → Client: ${client.name}`);

    const analysis = analyzeReport(report);
    console.log(`  → ${analysis.disputeItems.length} disputable items found`);
    console.log(`  → Quick wins: ${analysis.quickWins.length}`);
    console.log(`  → Est. recovery: +${analysis.estimatedPointRecovery} pts`);

    if (round === 1) {
      await notifyAnalysisComplete(analysis);
    }

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
      return {
        clientId, round, success: true,
        lettersGenerated: 0, itemsTargeted: 0,
        bureausTargeted: [], errors: [],
        nextAction: 'No items — advancing pipeline',
        nextActionDate: new Date(),
      };
    }

    const byBureau = groupDisputesByBureau(roundItems);
    const bureausTargeted = [...byBureau.keys()];

    const letters = await generateLettersForRound(
      {
        clientName: client.name,
        clientAddress: `${client.address}, ${client.city}, ${client.state} ${client.zip}`,
        items: roundItems,
      },
      round,
      byBureau,
    );

    for (const letter of letters) {
      try {
        letter.clientId = clientId;
        await attachDisputeLetter(clientId, letter);
        lettersGenerated++;
      } catch (err) {
        const msg = `Failed to attach ${letter.bureau} letter: ${(err as Error).message}`;
        errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }

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

    const nextActionMap: Record<number, string> = {
      1: 'Round 2 — Creditor Direct Disputes',
      2: 'Round 3 — Advanced Legal Escalation',
      3: 'Await 15-day legal response',
    };

    const result: WorkflowResult = {
      clientId, round, success: true,
      lettersGenerated, itemsTargeted: roundItems.length,
      bureausTargeted, errors,
      nextAction: nextActionMap[round],
      nextActionDate: nextDate,
    };

    await notifyRoundComplete(result);
    console.log(`\n✅ Round ${round} complete — ${lettersGenerated} letters generated.`);
    return result;

  } catch (err) {
    const error = err as Error;
    await notifyError(`Round ${round} for ${clientId}`, error);
    console.error(`\n✗ Round ${round} failed:`, error.message);
    return {
      clientId, round, success: false,
      lettersGenerated, itemsTargeted: 0,
      bureausTargeted: [], errors: [error.message],
      nextAction: `Retry Round ${round}`,
      nextActionDate: new Date(),
    };
  }
}