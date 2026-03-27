// ============================================================
// JECI AI — Dispute Letter Generator
// Powered by Claude API (claude-sonnet-4-6)
// Generates FCRA/FDCPA-compliant dispute letters per round
// ============================================================

import {
  DisputeItem,
  DisputeLetter,
  LetterGenerationParams,
  Bureau,
  DisputeRound,
} from '../types/index.js';

// ── Bureau Mailing Addresses ─────────────────────────────────

const BUREAU_ADDRESSES: Record<Bureau, string> = {
  Equifax:
    'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374',
  Experian:
    'Experian\nP.O. Box 4500\nAllen, TX 75013',
  TransUnion:
    'TransUnion LLC Consumer Dispute Center\nP.O. Box 2000\nChester, PA 19016',
};

// ── Round-specific system prompts ────────────────────────────

const ROUND_SYSTEM_PROMPTS: Record<DisputeRound, string> = {
  1: `You are a Consumer Law expert writing Round 1 direct bureau dispute letters 
under the Fair Credit Reporting Act (FCRA), specifically 15 USC 1681.

Your style:
- Professional, authoritative, and legally precise
- Aggressive toward inaccuracies but formally worded
- Always cite specific statutes
- Reference the bureau's 30-day investigation obligation
- Demand deletion of unverifiable items
- Do NOT threaten legal action yet (that's Round 3)
- Format as a ready-to-mail formal letter
- Output ONLY the letter text — no commentary, no preamble`,

  2: `You are a Consumer Law expert writing Round 2 creditor-direct dispute letters
under FCRA (15 USC 1681s-2) and FDCPA (15 USC 1692).

Your style:
- More assertive than Round 1 — the bureau already "verified" these items
- Demand Method of Verification (MOV) documentation
- Request original signed contract or application
- Challenge their verification process explicitly
- Remind them of FCRA furnisher obligations
- Hint that legal escalation is the next step
- Output ONLY the letter text — no commentary, no preamble`,

  3: `You are a Consumer Law expert writing Round 3 advanced legal escalation letters
under FCRA (15 USC 1681n/1681o) and FDCPA (15 USC 1692).

Your style:
- This is the final warning before legal action
- Reference CFPB complaint filing as imminent
- Cite $1,000 statutory damages per willful violation
- Cite potential State Attorney General complaint
- Set a firm 15-day response deadline
- Make clear that continued reporting will be treated as willful noncompliance
- Be firm but not inflammatory — maintain professional tone
- Output ONLY the letter text — no commentary, no preamble`,
};

// ── Group items into a readable dispute list ─────────────────

function formatDisputeList(items: DisputeItem[]): string {
  return items
    .map((item, idx) =>
      `${idx + 1}. ${item.creditorName} (Account: ${item.accountNumber})\n` +
      `   Issue: ${item.reasonDescription}\n` +
      `   Legal Basis: ${item.legalCitation}`,
    )
    .join('\n\n');
}

// ── Main letter generator ────────────────────────────────────

export async function generateDisputeLetter(
  params: LetterGenerationParams,
  round: DisputeRound,
): Promise<DisputeLetter> {
  const { clientName, clientAddress, ssn, bureau, items } = params;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const disputeList = formatDisputeList(items);

  const userPrompt = `
Generate a Round ${round} dispute letter with these exact details:

SENDER:
Name: ${clientName}
Address: ${clientAddress}
${ssn ? `SSN (Last 4): ${ssn}` : ''}
Date: ${today}

RECIPIENT:
${BUREAU_ADDRESSES[bureau]}

DISPUTED ITEMS (${items.length} total):
${disputeList}

Round ${round} specific instructions:
${round === 1 ? 'Direct bureau dispute. Focus on factual inaccuracies. Demand investigation and deletion within 30 days per FCRA.' : ''}
${round === 2 ? 'Creditor direct. Demand Method of Verification for each item listed. Request original signed documentation.' : ''}
${round === 3 ? 'Legal escalation. Reference imminent CFPB complaint. Cite $1,000 per violation. Give 15-day deadline.' : ''}

Format the letter professionally with proper date, addresses, salutation, body paragraphs, and closing signature.
`.trim();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: ROUND_SYSTEM_PROMPTS[round],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const letterContent: string = data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');

  const timestamp = Date.now();
  const filename = `Round${round}_${bureau}_Dispute_${clientName.replace(/\s+/g, '_')}_${timestamp}.txt`;

  return {
    clientId:      params.clientName,   // Overwritten by caller with real ID
    clientName,
    bureau,
    round,
    items,
    letterContent,
    generatedAt:   new Date(),
    filename,
  };
}

// ── Batch generator: all bureaus for a round ─────────────────

export async function generateLettersForRound(
  params: Omit<LetterGenerationParams, 'bureau'>,
  round: DisputeRound,
  itemsByBureau: Map<Bureau, DisputeItem[]>,
): Promise<DisputeLetter[]> {
  const letters: DisputeLetter[] = [];

  for (const [bureau, items] of itemsByBureau) {
    if (items.length === 0) continue;

    console.log(`  → Generating Round ${round} letter for ${bureau} (${items.length} items)...`);

    try {
      const letter = await generateDisputeLetter(
        { ...params, bureau },
        round,
      );
      letters.push(letter);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ✗ Failed to generate letter for ${bureau}:`, err);
    }
  }

  return letters;
}
