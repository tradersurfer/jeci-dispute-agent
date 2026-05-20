// ============================================================
// JECI Credit — Dispute Letter Generator
// AI engine: Claude (via @anthropic-ai/sdk)
// Generates FCRA/FDCPA-compliant dispute letters per round
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  DisputeItem,
  DisputeLetter,
  LetterGenerationParams,
  Bureau,
  DisputeRound,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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
- Cite specific statutes for every disputed item
- Reference the bureau's 30-day investigation obligation
- Demand deletion of all unverifiable items
- Do NOT threaten legal action yet
- Format as a complete, ready-to-mail formal letter
- Output ONLY the letter text — no commentary, no preamble`,

  2: `You are a Consumer Law expert writing Round 2 creditor-direct dispute letters
under FCRA (15 USC 1681s-2) and FDCPA (15 USC 1692).

Your style:
- More assertive than Round 1 — previous verification was inadequate
- Demand Method of Verification (MOV) documentation
- Request original signed contract or application
- Challenge the verification process explicitly
- Remind furnishers of FCRA obligations
- Signal that legal escalation is the next step
- Output ONLY the letter text — no commentary, no preamble`,

  3: `You are a Consumer Law expert writing Round 3 legal escalation letters
under FCRA (15 USC 1681n/1681o) and FDCPA (15 USC 1692).

Your style:
- Final warning before legal action
- Reference imminent CFPB complaint filing
- Cite $1,000 statutory damages per willful violation
- Cite potential State Attorney General complaint
- Set a firm 15-day response deadline
- Continued reporting will be treated as willful noncompliance
- Professional tone — firm, not inflammatory
- Output ONLY the letter text — no commentary, no preamble`,
};

// ── Format disputed items list ───────────────────────────────

function formatDisputeList(items: DisputeItem[]): string {
  return items
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.creditorName} (Account: ${item.accountNumber})\n` +
        `   Issue: ${item.reasonDescription}\n` +
        `   Legal Basis: ${item.legalCitation}`
    )
    .join('\n\n');
}

// ── Main letter generator ────────────────────────────────────

export async function generateDisputeLetter(
  params: LetterGenerationParams,
  round: DisputeRound
): Promise<DisputeLetter> {
  const { clientName, clientAddress, ssn, bureau, items } = params;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

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
${formatDisputeList(items)}

${round === 1 ? 'Direct bureau dispute. Demand investigation and deletion within 30 days per FCRA.' : ''}
${round === 2 ? 'Creditor direct. Demand Method of Verification for each item. Request original signed documentation.' : ''}
${round === 3 ? 'Legal escalation. Reference imminent CFPB complaint. Cite $1,000 per violation. 15-day deadline.' : ''}

Format with proper date, addresses, salutation, body, and closing.
`.trim();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: ROUND_SYSTEM_PROMPTS[round],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const letterContent =
    response.content[0].type === 'text' ? response.content[0].text : '';

  const filename = `JECI_Round${round}_${bureau}_${clientName.replace(/\s+/g, '_')}_${Date.now()}.txt`;

  return {
    clientId: '',  // Populated by caller with real UUID
    clientName,
    bureau,
    round,
    items,
    letterContent,
    generatedAt: new Date(),
    filename,
  };
}

// ── Batch generator: all bureaus for a round ─────────────────
// Accepts Record<Bureau, DisputeItem[]> matching groupDisputesByBureau() output

export async function generateLettersForRound(
  params: Omit<LetterGenerationParams, 'bureau'>,
  itemsByBureau: Record<Bureau, DisputeItem[]>,
  round: DisputeRound
): Promise<DisputeLetter[]> {
  const letters: DisputeLetter[] = [];

  for (const [bureau, items] of Object.entries(itemsByBureau) as [Bureau, DisputeItem[]][]) {
    if (!items || items.length === 0) continue;

    console.log(
      `[JECI] Generating Round ${round} letter — ${bureau} (${items.length} items)...`
    );

    try {
      const letter = await generateDisputeLetter({ ...params, bureau }, round);
      letters.push(letter);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[JECI] Letter generation failed — ${bureau}:`, err);
    }
  }

  return letters;
}
