// ============================================================
// JECI AI — Credit Repair Cloud API Client
// CRC uses query param auth (apiauthkey + secretkey)
// and XML data format — NOT Bearer tokens
// Base URL: https://app.creditrepaircloud.com/api/
// ============================================================

import {
  CRCClient,
  PipelineStage,
  DisputeLetter,
} from '../types/index.js';

const CRC_BASE     = 'https://app.creditrepaircloud.com/api';
const CRC_AUTH_KEY = process.env.CRC_API_KEY!;
const CRC_SECRET   = process.env.CRC_SECRET_KEY!;

// ── Build authenticated URL ───────────────────────────────────
// CRC auth goes as query params on every request

function authParams(extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    apiauthkey: CRC_AUTH_KEY,
    secretkey:  CRC_SECRET,
    ...extra,
  });
}

// ── Core fetch wrapper ────────────────────────────────────────

async function crcFetch(
  path: string,
  method = 'POST',
  xmlData?: string,
): Promise<string> {
  const params = authParams(xmlData ? { xmlData } : {});
  const url    = `${CRC_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  const text = await res.text();

  // CRC returns HTML when auth fails — catch it clearly
  if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().startsWith('<html')) {
    throw new Error(
      `CRC API returned HTML on ${path} — check CRC_API_KEY and CRC_SECRET_KEY env vars. ` +
      `Make sure you have Scale plan with API access enabled in CRC → Settings → API.`
    );
  }

  if (!res.ok) {
    throw new Error(`CRC API ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }

  return text;
}

// ── XML builder helpers ───────────────────────────────────────

function wrapXML(inner: string): string {
  return `<crcloud>${inner}</crcloud>`;
}

function parseXMLField(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's'));
  return match ? match[1].trim() : '';
}

function parseXMLClients(xml: string): CRCClient[] {
  const matches = [...xml.matchAll(/<client>(.*?)<\/client>/gs)];
  return matches.map(m => parseClientXML(m[1]));
}

function parseClientXML(xml: string): CRCClient {
  return {
    id:            parseXMLField(xml, 'id'),
    name:          `${parseXMLField(xml, 'firstname')} ${parseXMLField(xml, 'lastname')}`.trim(),
    email:         parseXMLField(xml, 'email'),
    phone:         parseXMLField(xml, 'phone'),
    address:       parseXMLField(xml, 'address'),
    city:          parseXMLField(xml, 'city'),
    state:         parseXMLField(xml, 'state'),
    zip:           parseXMLField(xml, 'zip'),
    pipelineStage: parseXMLField(xml, 'status') as PipelineStage,
    enrolledAt:    new Date(parseXMLField(xml, 'created_at') || Date.now()),
    affiliateId:   parseXMLField(xml, 'affiliate_id') || undefined,
  };
}

// ── Client reads ──────────────────────────────────────────────

export async function getCRCClient(clientId: string): Promise<CRCClient> {
  const xml = wrapXML(`<client><id>${clientId}</id></client>`);
  const res  = await crcFetch('/client/viewRecord', 'POST', xml);
  const match = res.match(/<client>(.*?)<\/client>/s);
  if (!match) throw new Error(`CRC: client ${clientId} not found`);
  return parseClientXML(match[1]);
}

export async function getAllActiveClients(): Promise<(CRCClient & { notes: string[] })[]> {
  const xml = wrapXML(`<client><status>Active</status></client>`);
  const res  = await crcFetch('/client/viewAllRecords', 'POST', xml);
  const clients = parseXMLClients(res);

  // Attach notes to each client for scheduler date-checking
  const withNotes = await Promise.all(
    clients.map(async (client) => {
      const notes = await getClientNotes(client.id);
      return { ...client, notes };
    }),
  );

  return withNotes;
}

export async function getClientNotes(clientId: string): Promise<string[]> {
  try {
    const xml = wrapXML(`<note><client_id>${clientId}</client_id></note>`);
    const res  = await crcFetch('/note/viewAllRecords', 'POST', xml);
    const matches = [...res.matchAll(/<body>(.*?)<\/body>/gs)];
    return matches.map(m => m[1].trim());
  } catch {
    return [];
  }
}

// ── Pipeline management ───────────────────────────────────────

export async function updatePipelineStage(
  clientId: string,
  stage: PipelineStage,
): Promise<void> {
  const xml = wrapXML(`<client><id>${clientId}</id><status>${stage}</status></client>`);
  await crcFetch('/client/updateRecord', 'POST', xml);
  console.log(`  ✓ CRC: ${clientId} moved to "${stage}"`);
}

// ── Notes ─────────────────────────────────────────────────────

export async function addCRCNote(clientId: string, note: string): Promise<void> {
  // Escape XML special chars
  const safeNote = note
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xml = wrapXML(
    `<note><client_id>${clientId}</client_id><body>${safeNote}</body><created_by>JECI_AI</created_by></note>`
  );
  await crcFetch('/note/addRecord', 'POST', xml);
}

// ── Document / letter upload ──────────────────────────────────

export async function attachDisputeLetter(
  clientId: string,
  letter: DisputeLetter,
): Promise<void> {
  const safeContent = letter.letterContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xml = wrapXML(
    `<document>` +
    `<client_id>${clientId}</client_id>` +
    `<filename>${letter.filename}</filename>` +
    `<content>${safeContent}</content>` +
    `<type>dispute_letter</type>` +
    `<bureau>${letter.bureau}</bureau>` +
    `<round>${letter.round}</round>` +
    `<created_by>JECI_AI</created_by>` +
    `</document>`
  );

  await crcFetch('/document/addRecord', 'POST', xml);
  console.log(`  ✓ CRC: Letter "${letter.filename}" attached to ${clientId}`);
}

// ── Score update ──────────────────────────────────────────────

export async function updateClientScores(
  clientId: string,
  scores: { equifax?: number; experian?: number; transunion?: number },
): Promise<void> {
  const xml = wrapXML(
    `<client>` +
    `<id>${clientId}</id>` +
    `<score_equifax>${scores.equifax ?? ''}</score_equifax>` +
    `<score_experian>${scores.experian ?? ''}</score_experian>` +
    `<score_transunion>${scores.transunion ?? ''}</score_transunion>` +
    `</client>`
  );
  await crcFetch('/client/updateRecord', 'POST', xml);
}

// ── Lead creation ─────────────────────────────────────────────

export async function createCRCLead(lead: {
  name: string;
  email: string;
  phone?: string;
  source?: string;
}): Promise<{ leadId: string }> {
  const [firstname, ...rest] = lead.name.split(' ');
  const lastname = rest.join(' ') || '';

  const xml = wrapXML(
    `<lead>` +
    `<firstname>${firstname}</firstname>` +
    `<lastname>${lastname}</lastname>` +
    `<email>${lead.email}</email>` +
    `<phone>${lead.phone ?? ''}</phone>` +
    `<source>${lead.source ?? 'website'}</source>` +
    `</lead>`
  );

  const res = await crcFetch('/lead/addRecord', 'POST', xml);
  const id  = parseXMLField(res, 'id');
  return { leadId: id };
}

// ── API connection diagnostic ─────────────────────────────────
// Call this from /status endpoint to verify CRC is reachable

export async function testCRCConnection(): Promise<{
  ok: boolean;
  message: string;
  keysPresent: boolean;
}> {
  const keysPresent = Boolean(CRC_AUTH_KEY && CRC_SECRET);

  if (!keysPresent) {
    return {
      ok: false,
      message: 'CRC_API_KEY or CRC_SECRET_KEY env var is missing',
      keysPresent: false,
    };
  }

  try {
    // Ping CRC with a minimal list request
    const xml = wrapXML(`<client><status>Active</status></client>`);
    await crcFetch('/client/viewAllRecords', 'POST', xml);
    return { ok: true, message: 'CRC API connected ✅', keysPresent: true };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      keysPresent: true,
    };
  }
}