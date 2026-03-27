// ============================================================
// JECI AI — Credit Repair Cloud API Client
// Handles all CRC data reads and writes
// ============================================================

import {
  CRCClient,
  PipelineStage,
  DisputeLetter,
} from '../types/index.js';

const CRC_BASE = 'https://app.creditrepaircloud.com/webapi';

function headers() {
  return {
    'Authorization': `Bearer ${process.env.CRC_API_KEY}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
}

async function crcFetch(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = `${CRC_BASE}${path}`;
  const res = await fetch(url, { ...options, headers: headers() });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CRC API ${res.status} on ${path}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Client reads ─────────────────────────────────────────────

export async function getCRCClient(clientId: string): Promise<CRCClient> {
  const data = await crcFetch(`/client/${clientId}`) as CRCClient;
  return data;
}

export async function getAllActiveClients(): Promise<CRCClient[]> {
  const data = await crcFetch('/clients?status=active') as { clients: CRCClient[] };
  return data.clients ?? [];
}

// ── Pipeline management ──────────────────────────────────────

export async function updatePipelineStage(
  clientId: string,
  stage: PipelineStage,
): Promise<void> {
  await crcFetch(`/client/${clientId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: stage }),
  });
  console.log(`  ✓ CRC: ${clientId} moved to "${stage}"`);
}

// ── Notes ────────────────────────────────────────────────────

export async function addCRCNote(
  clientId: string,
  note: string,
): Promise<void> {
  await crcFetch(`/client/${clientId}/notes`, {
    method:  'POST',
    body: JSON.stringify({
      note,
      created_by: 'JECI_AI',
      created_at: new Date().toISOString(),
    }),
  });
}

// ── Document / letter upload ─────────────────────────────────

export async function attachDisputeLetter(
  clientId: string,
  letter: DisputeLetter,
): Promise<void> {
  await crcFetch(`/client/${clientId}/documents`, {
    method:  'POST',
    body: JSON.stringify({
      filename:    letter.filename,
      content:     letter.letterContent,
      type:        'dispute_letter',
      bureau:      letter.bureau,
      round:       letter.round,
      created_at:  letter.generatedAt.toISOString(),
      created_by:  'JECI_AI',
    }),
  });
  console.log(`  ✓ CRC: Letter "${letter.filename}" attached to ${clientId}`);
}

// ── Score update ──────────────────────────────────────────────

export async function updateClientScores(
  clientId: string,
  scores: { equifax?: number; experian?: number; transunion?: number },
): Promise<void> {
  await crcFetch(`/client/${clientId}/scores`, {
    method: 'PUT',
    body: JSON.stringify(scores),
  });
}

// ── Lead creation (from Facebook intake / website form) ──────

export async function createCRCLead(lead: {
  name: string;
  email: string;
  phone?: string;
  source?: string;
  affiliateId?: string;
}): Promise<{ leadId: string }> {
  const data = await crcFetch('/leads', {
    method: 'POST',
    body: JSON.stringify({
      ...lead,
      source:     lead.source ?? 'website',
      created_at: new Date().toISOString(),
    }),
  }) as { leadId: string };
  return data;
}
