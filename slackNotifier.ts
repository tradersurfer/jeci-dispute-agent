// ============================================================
// JECI AI — Slack Notifier
// Sends real-time updates to #credit-operations
// ============================================================

import { DisputeAnalysis, WorkflowResult } from '../types/index.js';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL!;
const CHANNEL       = process.env.SLACK_CHANNEL ?? '#credit-operations';

async function post(text: string, blocks?: object[]): Promise<void> {
  if (!SLACK_WEBHOOK) {
    console.log(`[Slack skipped — no webhook] ${text}`);
    return;
  }

  await fetch(SLACK_WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, blocks, channel: CHANNEL }),
  }).catch(err => console.error('Slack notify failed:', err));
}

// ── Notification types ───────────────────────────────────────

export async function notifyNewClientEnrolled(
  clientName: string,
  clientId: string,
): Promise<void> {
  await post(
    `🆕 New client enrolled: *${clientName}* (${clientId})`,
    [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🆕 *New Client Enrolled*\n*Name:* ${clientName}\n*ID:* ${clientId}\n*Status:* JECI AI audit initiated`,
      },
    }],
  );
}

export async function notifyAnalysisComplete(
  analysis: DisputeAnalysis,
): Promise<void> {
  const critical = analysis.disputeItems.filter(d => d.priority === 'CRITICAL').length;
  const high     = analysis.disputeItems.filter(d => d.priority === 'HIGH').length;

  await post(
    `🔍 Analysis complete for ${analysis.clientName}`,
    [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `🔍 *JECI AI Analysis Complete*\n` +
          `*Client:* ${analysis.clientName}\n` +
          `*Total Items Found:* ${analysis.disputeItems.length}\n` +
          `*CRITICAL:* ${critical} | *HIGH:* ${high}\n` +
          `*Quick Wins:* ${analysis.quickWins.length} items\n` +
          `*Est. Point Recovery:* +${analysis.estimatedPointRecovery} pts\n` +
          `*Human Review Needed:* ${analysis.humanReviewRequired ? '⚠️ YES' : '✅ No'}`,
      },
    }],
  );

  // Ping if human review needed
  if (analysis.humanReviewRequired) {
    await post(
      `⚠️ @here Human review required for ${analysis.clientName}`,
      [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `⚠️ *Human Review Required*\n*Client:* ${analysis.clientName}\n\n` +
            analysis.humanReviewReasons.map(r => `• ${r}`).join('\n'),
        },
      }],
    );
  }
}

export async function notifyRoundComplete(result: WorkflowResult): Promise<void> {
  await post(
    `✅ Round ${result.round} complete for client ${result.clientId}`,
    [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `✅ *Round ${result.round} Disputes Filed*\n` +
          `*Client:* ${result.clientId}\n` +
          `*Letters Generated:* ${result.lettersGenerated}\n` +
          `*Items Targeted:* ${result.itemsTargeted}\n` +
          `*Bureaus:* ${result.bureausTargeted.join(', ')}\n` +
          `*Next Action:* ${result.nextAction}\n` +
          `*Scheduled:* ${result.nextActionDate.toLocaleDateString()}`,
      },
    }],
  );
}

export async function notifyDeletion(
  clientId: string,
  clientName: string,
  creditor: string,
  bureau: string,
): Promise<void> {
  await post(
    `🎉 Deletion confirmed! ${creditor} removed from ${bureau} for ${clientName}`,
    [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `🎉 *DELETION CONFIRMED*\n` +
          `*Client:* ${clientName}\n` +
          `*Removed:* ${creditor}\n` +
          `*Bureau:* ${bureau}\n` +
          `*Status:* Account removed from credit report ✓`,
      },
    }],
  );
}

export async function notifyError(
  context: string,
  error: Error,
): Promise<void> {
  await post(
    `🚨 JECI AI Error in ${context}: ${error.message}`,
  );
}

// Generic notify for simple messages
export async function notifySlack(message: string): Promise<void> {
  await post(message);
}
