// ============================================================
// JECI AI — Round 2 & Round 3 Dispute Workflows
// ============================================================

import {
  CreditReport,
  WorkflowResult,
  DisputeItem,
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
  notifyRoundComplete,
  notifyError,
  notifySlack,
} from '../tools/slackNotifier.js';

// ── Round 2: Creditor-direct disputes ────────────────────────

export async function runRound2(
  clientId: string,
  report: CreditReport,
  verifiedItems: DisputeItem[],   // Items "verified" by bureaus in Round 1
): Promise<WorkflowResult> {

  console.log(`\n🤖 JECI AI — Round 2 starting for client ${clientId}`);
  const errors: string[] = [];
  let lettersGenerated = 0;

  try {
    const client = await getCRCClient(clientId);

    // Items that were verified (bureau refused to delete) go to creditor direct
    const analysis   = analyzeReport(report);
    const round1Filed = new Set(verifiedItems.map(i => `${i.accountId}:${i.bureau}`));
    const round2Items = filterItemsForRound(analysis.disputeItems, 2, round1Filed);

    console.log(`  → Round 2 targets: ${round2Items.length} verified/stubborn items`);

    if (round2Items.length === 0) {
      await notifySlack(`ℹ️ Round 2 for ${client.name}: No items to dispute (all deleted in Round 1 🎉)`);
      await updatePipelineStage(clientId, 'Credit Building Phase');
      return {
        clientId, round: 2, success: true,
        lettersGenerated: 0, itemsTargeted: 0,
        bureausTargeted: [], errors: [],
        nextAction: 'Credit Building Phase',
        nextActionDate: new Date(),
      };
    }

    const byBureau       = groupDisputesByBureau(round2Items);
    const bureausTargeted = [...byBureau.keys()];

    const letters = await generateLettersForRound(
      {
        clientName:    client.name,
        clientAddress: `${client.address}, ${client.city}, ${client.state} ${client.zip}`,
      },
      2,
      byBureau,
    );

    for (const letter of letters) {
      letter.clientId = clientId;
      await attachDisputeLetter(clientId, letter);
      lettersGenerated++;
    }

    await addCRCNote(
      clientId,
      `JECI AI Round 2 Complete:\n` +
      `• ${round2Items.length} stubborn items escalated to creditors\n` +
      `• ${lettersGenerated} letters generated\n` +
      `• Method of Verification demanded on all items\n` +
      `• Bureaus: ${bureausTargeted.join(', ')}`,
    );

    await updatePipelineStage(clientId, 'Round 2 Disputes Filed');

    // Schedule Round 3 check in 35 days
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 35);
    await addCRCNote(
      clientId,
      `JECI_AI_SCHEDULE: Round 3 check scheduled for ${nextDate.toLocaleDateString()}`,
    );

    const result: WorkflowResult = {
      clientId, round: 2, success: true,
      lettersGenerated, itemsTargeted: round2Items.length,
      bureausTargeted, errors,
      nextAction: 'Round 3 — Advanced Legal Escalation',
      nextActionDate: nextDate,
    };

    await notifyRoundComplete(result);
    return result;

  } catch (err) {
    const error = err as Error;
    await notifyError(`Round 2 for client ${clientId}`, error);
    return {
      clientId, round: 2, success: false,
      lettersGenerated, itemsTargeted: 0,
      bureausTargeted: [], errors: [error.message],
      nextAction: 'Retry Round 2',
      nextActionDate: new Date(),
    };
  }
}

// ── Round 3: Advanced Legal Escalation ───────────────────────

export async function runRound3(
  clientId: string,
  report: CreditReport,
  persistentItems: DisputeItem[],
): Promise<WorkflowResult> {

  console.log(`\n🤖 JECI AI — Round 3 (Legal) starting for client ${clientId}`);
  const errors: string[] = [];
  let lettersGenerated = 0;

  try {
    const client = await getCRCClient(clientId);

    const analysis      = analyzeReport(report);
    const previousFiled = new Set(persistentItems.map(i => `${i.accountId}:${i.bureau}`));
    const round3Items   = filterItemsForRound(analysis.disputeItems, 3, previousFiled);

    console.log(`  → Round 3 targets: ${round3Items.length} persistent items`);

    if (round3Items.length === 0) {
      await notifySlack(`🎉 Round 3 for ${client.name}: No remaining items! Moving to Credit Building.`);
      await updatePipelineStage(clientId, 'Credit Building Phase');
      return {
        clientId, round: 3, success: true,
        lettersGenerated: 0, itemsTargeted: 0,
        bureausTargeted: [], errors: [],
        nextAction: 'Credit Building Phase',
        nextActionDate: new Date(),
      };
    }

    // Round 3: Flag items needing human review for potential lawsuit
    const legalEscalation = round3Items.filter(
      i => i.requiresHumanReview || i.priority === 'CRITICAL',
    );

    if (legalEscalation.length > 0) {
      await notifySlack(
        `⚖️ @here LEGAL REVIEW NEEDED for ${client.name}:\n` +
        legalEscalation.map(i =>
          `• ${i.creditorName} (${i.bureau}) — ${i.reasonDescription.slice(0, 60)}...`,
        ).join('\n'),
      );
    }

    const byBureau        = groupDisputesByBureau(round3Items);
    const bureausTargeted = [...byBureau.keys()];

    const letters = await generateLettersForRound(
      {
        clientName:    client.name,
        clientAddress: `${client.address}, ${client.city}, ${client.state} ${client.zip}`,
      },
      3,
      byBureau,
    );

    for (const letter of letters) {
      letter.clientId = clientId;
      await attachDisputeLetter(clientId, letter);
      lettersGenerated++;
    }

    await addCRCNote(
      clientId,
      `JECI AI Round 3 Complete — LEGAL ESCALATION:\n` +
      `• ${round3Items.length} items escalated\n` +
      `• ${lettersGenerated} legal demand letters generated\n` +
      `• CFPB complaints referenced\n` +
      `• $1,000/violation statutory damages cited\n` +
      `• 15-day response deadline set\n` +
      `• ${legalEscalation.length} items flagged for potential legal action`,
    );

    await updatePipelineStage(clientId, 'Round 3 / Advanced Legal');

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 15);

    const result: WorkflowResult = {
      clientId, round: 3, success: true,
      lettersGenerated, itemsTargeted: round3Items.length,
      bureausTargeted, errors,
      nextAction: 'Await 15-day legal response + evaluate lawsuit viability',
      nextActionDate: nextDate,
    };

    await notifyRoundComplete(result);
    return result;

  } catch (err) {
    const error = err as Error;
    await notifyError(`Round 3 for client ${clientId}`, error);
    return {
      clientId, round: 3, success: false,
      lettersGenerated, itemsTargeted: 0,
      bureausTargeted: [], errors: [error.message],
      nextAction: 'Retry Round 3',
      nextActionDate: new Date(),
    };
  }
}
