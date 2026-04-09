// ============================================================
// JECI AI — SendGrid Email Service
// Sends copies of all communications to the client.
// Every letter filed, every bureau response received, and every
// round summary is emailed to the client so they always know
// what's happening on their behalf.
//
// ENV VARS:
//   SENDGRID_API_KEY     — SendGrid API key
//   SENDGRID_FROM_EMAIL  — Verified sender (e.g. disputes@700creditclub.com)
//   SENDGRID_FROM_NAME   — (optional) Defaults to "700 Credit Club Experts"
// ============================================================

import sgMail from '@sendgrid/mail';
import { DisputeLetter, WorkflowResult, CRCClient, DisputeAnalysis } from '../types/index.js';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? '';
const FROM_NAME  = process.env.SENDGRID_FROM_NAME  ?? '700 Credit Club Experts | JECI Group';
const ENABLED    = Boolean(process.env.SENDGRID_API_KEY && FROM_EMAIL);

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function enabled(): boolean {
  if (!ENABLED) {
    console.log('  ℹ️  SendGrid not configured — email skipped');
    return false;
  }
  return true;
}

async function send(msg: sgMail.MailDataRequired): Promise<void> {
  try {
    await sgMail.send(msg);
    console.log(`  ✓ Email sent to ${Array.isArray(msg.to) ? msg.to.join(', ') : msg.to}`);
  } catch (err: unknown) {
    // Log but don't throw — email failure should never block the dispute pipeline
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ SendGrid error: ${message}`);
  }
}

// ── 1. Welcome email when client enrolls ─────────────────────

export async function emailClientWelcome(client: CRCClient): Promise<void> {
  if (!enabled() || !client.email) return;

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Welcome to 700 Credit Club — Your Dispute Journey Starts Now`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Welcome, ${client.name}!</h2>
        <p>Your credit repair journey with <strong>700 Credit Club Experts | JECI Group</strong>
        is now active. Our AI-powered dispute system (JECI AI) has been notified and will
        begin your credit audit shortly.</p>

        <div style="background: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 20px 0;">
          <strong>What happens next:</strong>
          <ol>
            <li>JECI AI will analyze your credit report for FCRA/FDCPA violations</li>
            <li>Dispute letters will be generated and filed with the credit bureaus</li>
            <li>You'll receive copies of every letter we send on your behalf</li>
            <li>We'll follow up 35 days later with Round 2 if needed</li>
          </ol>
        </div>

        <p><strong>Important:</strong> Please make sure your credit report has been pulled
        and uploaded. If you haven't done so, log into your portal and pull your 3-bureau
        report from Credit Hero Score.</p>

        <p style="color: #718096; font-size: 13px;">
          Legal. Moral. Ethical &amp; Factual Credit Services.<br/>
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}

// ── 2. Analysis complete — what we found ─────────────────────

export async function emailClientAnalysis(
  client: CRCClient,
  analysis: DisputeAnalysis,
): Promise<void> {
  if (!enabled() || !client.email) return;

  const criticalCount = analysis.disputeItems.filter(d => d.priority === 'CRITICAL').length;
  const highCount     = analysis.disputeItems.filter(d => d.priority === 'HIGH').length;

  const itemRows = analysis.disputeItems
    .slice(0, 15) // Cap at 15 items in email to avoid bloat
    .map(item => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px;">${item.creditorName}</td>
        <td style="padding: 8px;">${item.bureau}</td>
        <td style="padding: 8px; color: ${item.priority === 'CRITICAL' ? '#c53030' : item.priority === 'HIGH' ? '#c05621' : '#2d3748'};">
          ${item.priority}
        </td>
        <td style="padding: 8px;">${item.expectedDeletionRate}%</td>
      </tr>
    `).join('');

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Your Credit Audit is Complete — ${analysis.disputeItems.length} Items Found`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Your Credit Report Audit Results</h2>
        <p>Hello ${client.name}, JECI AI has completed your credit report analysis.</p>

        <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div><strong>${analysis.disputeItems.length}</strong><br/>Total disputable items</div>
            <div><strong style="color: #c53030;">${criticalCount}</strong><br/>CRITICAL priority</div>
            <div><strong style="color: #c05621;">${highCount}</strong><br/>HIGH priority</div>
            <div><strong style="color: #276749;">+${analysis.estimatedPointRecovery} pts</strong><br/>Estimated recovery</div>
          </div>
        </div>

        ${analysis.disputeItems.length > 0 ? `
        <h3>Disputable Items Found:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead style="background: #edf2f7;">
            <tr>
              <th style="padding: 8px; text-align: left;">Creditor</th>
              <th style="padding: 8px; text-align: left;">Bureau</th>
              <th style="padding: 8px; text-align: left;">Priority</th>
              <th style="padding: 8px; text-align: left;">Est. Rate</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        ${analysis.disputeItems.length > 15 ? `<p style="color: #718096;">...and ${analysis.disputeItems.length - 15} more items</p>` : ''}
        ` : '<p>No disputable items found at this time.</p>'}

        ${analysis.humanReviewRequired ? `
        <div style="background: #fff5f5; border: 1px solid #fc8181; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <strong>Note:</strong> Some items require additional documentation from you.
          Our team will reach out shortly regarding these items.
        </div>
        ` : ''}

        <p style="color: #718096; font-size: 13px;">
          JECI AI will now generate dispute letters and file them with the credit bureaus.
          You'll receive a copy of every letter sent on your behalf.<br/><br/>
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}

// ── 3. Dispute letters filed — send copies ────────────────────

export async function emailClientDisputeLetters(
  client:  CRCClient,
  letters: DisputeLetter[],
  round:   number,
): Promise<void> {
  if (!enabled() || !client.email || letters.length === 0) return;

  const bureauList = letters.map(l => l.bureau).join(', ');

  const letterSections = letters.map(letter => `
    <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px;
                padding: 20px; margin: 16px 0; font-family: 'Courier New', monospace;
                font-size: 13px; white-space: pre-wrap; line-height: 1.6;">
      <strong style="font-family: Arial, sans-serif; color: #1a365d;">
        ${letter.bureau} — Round ${round} Dispute Letter
      </strong>
      <hr style="border: 1px solid #e2e8f0; margin: 12px 0;"/>
      ${letter.letterContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    </div>
  `).join('');

  const roundLabels: Record<number, string> = {
    1: 'Round 1 — Direct Bureau Dispute',
    2: 'Round 2 — Creditor Direct (Method of Verification)',
    3: 'Round 3 — Legal Escalation',
  };

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `[Action Taken] ${roundLabels[round] ?? `Round ${round}`} Letters Filed — ${bureauList}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Your Dispute Letters Have Been Filed</h2>
        <p>Hello ${client.name}, JECI AI has generated and filed dispute letters
        on your behalf. Below are exact copies of every letter submitted.</p>

        <div style="background: #f0fff4; border-left: 4px solid #38a169; padding: 16px; margin: 20px 0;">
          <strong>Round ${round} Summary:</strong><br/>
          • Letters filed: ${letters.length}<br/>
          • Bureaus targeted: ${bureauList}<br/>
          • Items disputed: ${letters.reduce((sum, l) => sum + l.items.length, 0)}<br/>
          • Filed on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        ${round === 1 ? `
        <div style="background: #fffaf0; border: 1px solid #f6ad55; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <strong>What to expect:</strong> The credit bureaus have 30 days (+ 5 day buffer)
          to investigate your disputes under FCRA 15 USC 1681i. JECI AI will automatically
          follow up in 35 days with Round 2 if any items are not removed.
        </div>
        ` : ''}

        <h3>Copies of Your Dispute Letters:</h3>
        ${letterSections}

        <p style="color: #718096; font-size: 13px;">
          Keep these letters for your records. Do not respond directly to the bureaus —
          let JECI AI manage all communications on your behalf.<br/><br/>
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}

// ── 4. Round complete summary ─────────────────────────────────

export async function emailClientRoundSummary(
  client: CRCClient,
  result: WorkflowResult,
): Promise<void> {
  if (!enabled() || !client.email) return;

  const nextDateStr = result.nextActionDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Round ${result.round} Complete — ${result.lettersGenerated} Letters Filed`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Round ${result.round} Disputes Filed Successfully</h2>
        <p>Hello ${client.name}, here is your Round ${result.round} summary.</p>

        <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr><td><strong>Letters Generated:</strong></td><td>${result.lettersGenerated}</td></tr>
            <tr><td><strong>Items Targeted:</strong></td><td>${result.itemsTargeted}</td></tr>
            <tr><td><strong>Bureaus Contacted:</strong></td><td>${result.bureausTargeted.join(', ')}</td></tr>
            <tr><td><strong>Next Action:</strong></td><td>${result.nextAction}</td></tr>
            <tr><td><strong>Next Date:</strong></td><td>${nextDateStr}</td></tr>
          </table>
        </div>

        ${result.errors.length > 0 ? `
        <div style="background: #fff5f5; border: 1px solid #fc8181; border-radius: 8px; padding: 16px;">
          <strong>Note:</strong> Some items encountered issues and may need manual attention.
          Our team has been notified.
        </div>
        ` : ''}

        <p style="color: #718096; font-size: 13px;">
          You do not need to take any action. JECI AI will automatically monitor for bureau
          responses and proceed to ${result.nextAction} on ${nextDateStr}.<br/><br/>
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}

// ── 5. Bureau response received ───────────────────────────────

export async function emailClientBureauResponse(
  client:          CRCClient,
  bureau:          string,
  responseContent: string,
  round:           number,
): Promise<void> {
  if (!enabled() || !client.email) return;

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Bureau Response Received — ${bureau} (Round ${round})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Bureau Response Received from ${bureau}</h2>
        <p>Hello ${client.name}, we received a response from ${bureau} regarding
        your Round ${round} dispute. JECI AI is reviewing it and will determine
        the next steps automatically.</p>

        <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px;
                    padding: 20px; margin: 20px 0; font-family: 'Courier New', monospace;
                    font-size: 13px; white-space: pre-wrap; line-height: 1.6;">
          ${responseContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </div>

        <p style="color: #718096; font-size: 13px;">
          If items were deleted, great news — your score should improve within 30-45 days.
          If items were "verified," JECI AI will escalate to the next round automatically.<br/><br/>
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}

// ── 6. Report not ready — action needed ──────────────────────

export async function emailClientReportNeeded(client: CRCClient): Promise<void> {
  if (!enabled() || !client.email) return;

  await send({
    to:   client.email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Action Required — Please Pull Your Credit Report`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c53030;">Action Required: Credit Report Needed</h2>
        <p>Hello ${client.name}, JECI AI attempted to start your credit audit
        but could not find your credit report data.</p>

        <div style="background: #fff5f5; border-left: 4px solid #c53030; padding: 16px; margin: 20px 0;">
          <strong>Please complete these steps:</strong>
          <ol>
            <li>Log into your <strong>Credit Hero Score</strong> portal</li>
            <li>Pull your 3-bureau credit report</li>
            <li>Sync or upload the report to your CRC client file</li>
            <li>Once uploaded, JECI AI will automatically detect it and begin the audit</li>
          </ol>
        </div>

        <p>If you need help pulling your report, please contact your credit advisor directly.</p>

        <p style="color: #718096; font-size: 13px;">
          700 Credit Club Experts | JECI Group
        </p>
      </div>
    `,
  });
}
