// ============================================================
// JECI AI — Dispute Database (SQLite)
// Replaces brittle note-string parsing for tracking filed
// disputes, score snapshots, and pipeline events.
// DB file lives in /data/disputes.db (persisted on Railway volume)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '../../data');
const DB_PATH   = path.join(DATA_DIR, 'disputes.db');

// Ensure data directory exists before opening DB
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Write-ahead logging for concurrent reads

// ── Schema ─────────────────────────────────────────────────────

db.exec(`
  -- One row per dispute filed per client per bureau per round
  CREATE TABLE IF NOT EXISTS filed_disputes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   TEXT NOT NULL,
    account_id  TEXT NOT NULL,
    bureau      TEXT NOT NULL,
    round       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    creditor    TEXT NOT NULL DEFAULT '',
    filed_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(client_id, account_id, bureau, round)
  );

  -- Credit score snapshots before and after each round
  CREATE TABLE IF NOT EXISTS score_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    TEXT NOT NULL,
    round        INTEGER NOT NULL,   -- 0 = baseline (before Round 1)
    equifax      INTEGER,
    experian     INTEGER,
    transunion   INTEGER,
    recorded_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Audit log of every significant pipeline event
  CREATE TABLE IF NOT EXISTS pipeline_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   TEXT NOT NULL,
    event       TEXT NOT NULL,
    payload     TEXT,               -- JSON blob
    occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Credit report cache (latest pull per client)
  CREATE TABLE IF NOT EXISTS report_cache (
    client_id    TEXT PRIMARY KEY,
    source       TEXT NOT NULL,     -- 'credit_hero' | 'crc_tradelines' | 'manual'
    report_json  TEXT NOT NULL,     -- Full CreditReport serialized as JSON
    pulled_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Types ───────────────────────────────────────────────────────

export interface FiledDisputeRecord {
  clientId:  string;
  accountId: string;
  bureau:    string;
  round:     number;
  reason:    string;
  creditor:  string;
}

export interface ScoreSnapshot {
  round:      number;
  equifax:    number | null;
  experian:   number | null;
  transunion: number | null;
  recordedAt: string;
}

// ── Filed Disputes ─────────────────────────────────────────────

const stmtInsertDispute = db.prepare(`
  INSERT OR IGNORE INTO filed_disputes (client_id, account_id, bureau, round, reason, creditor)
  VALUES (@clientId, @accountId, @bureau, @round, @reason, @creditor)
`);

const txInsertDisputes = db.transaction((records: FiledDisputeRecord[]) => {
  for (const r of records) stmtInsertDispute.run(r);
});

export function recordFiledDisputes(records: FiledDisputeRecord[]): void {
  txInsertDisputes(records);
}

/**
 * Returns a Set of "accountId:bureau" keys for all items already
 * filed for this client in any round. Used by filterItemsForRound()
 * to avoid re-filing identical items.
 */
export function getFiledDisputeKeys(clientId: string): Set<string> {
  const rows = db.prepare(
    `SELECT account_id, bureau FROM filed_disputes WHERE client_id = ?`
  ).all(clientId) as { account_id: string; bureau: string }[];
  return new Set(rows.map(r => `${r.account_id}:${r.bureau}`));
}

/**
 * Returns a Set of "accountId:bureau" keys filed specifically in a given round.
 * Used to identify Round 1 items that survived (bureau "verified") for Round 2.
 */
export function getFiledKeysForRound(clientId: string, round: number): Set<string> {
  const rows = db.prepare(
    `SELECT account_id, bureau FROM filed_disputes WHERE client_id = ? AND round = ?`
  ).all(clientId, round) as { account_id: string; bureau: string }[];
  return new Set(rows.map(r => `${r.account_id}:${r.bureau}`));
}

export function hasFiledRound(clientId: string, round: number): boolean {
  const row = db.prepare(
    `SELECT 1 FROM filed_disputes WHERE client_id = ? AND round = ? LIMIT 1`
  ).get(clientId, round);
  return !!row;
}

export function getFiledDisputeHistory(clientId: string): FiledDisputeRecord[] {
  return (db.prepare(
    `SELECT client_id as clientId, account_id as accountId, bureau, round, reason, creditor
     FROM filed_disputes WHERE client_id = ? ORDER BY filed_at ASC`
  ).all(clientId) as FiledDisputeRecord[]);
}

// ── Score Snapshots ─────────────────────────────────────────────

export function recordScoreSnapshot(
  clientId:   string,
  round:      number,
  scores:     { equifax?: number; experian?: number; transunion?: number },
): void {
  db.prepare(`
    INSERT INTO score_snapshots (client_id, round, equifax, experian, transunion)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    clientId, round,
    scores.equifax    ?? null,
    scores.experian   ?? null,
    scores.transunion ?? null,
  );
}

export function getScoreHistory(clientId: string): ScoreSnapshot[] {
  return (db.prepare(
    `SELECT round, equifax, experian, transunion, recorded_at as recordedAt
     FROM score_snapshots WHERE client_id = ? ORDER BY recorded_at ASC`
  ).all(clientId) as ScoreSnapshot[]);
}

// ── Pipeline Events ─────────────────────────────────────────────

export function recordPipelineEvent(
  clientId: string,
  event:    string,
  payload?: unknown,
): void {
  db.prepare(
    `INSERT INTO pipeline_events (client_id, event, payload) VALUES (?, ?, ?)`
  ).run(clientId, event, payload ? JSON.stringify(payload) : null);
}

// ── Report Cache ────────────────────────────────────────────────

export function cacheReport(clientId: string, source: string, report: unknown): void {
  db.prepare(`
    INSERT INTO report_cache (client_id, source, report_json, pulled_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET
      source      = excluded.source,
      report_json = excluded.report_json,
      pulled_at   = excluded.pulled_at
  `).run(clientId, source, JSON.stringify(report));
}

export function getCachedReport(clientId: string): { source: string; report: unknown; pulledAt: string } | null {
  const row = db.prepare(
    `SELECT source, report_json, pulled_at as pulledAt FROM report_cache WHERE client_id = ?`
  ).get(clientId) as { source: string; report_json: string; pulledAt: string } | undefined;
  if (!row) return null;
  return { source: row.source, report: JSON.parse(row.report_json), pulledAt: row.pulledAt };
}

// ── DB Stats (for /status endpoint) ────────────────────────────

export function getDbStats(): {
  totalDisputes: number;
  totalClients: number;
  dbPath: string;
} {
  const totalDisputes = (db.prepare(
    `SELECT COUNT(*) as n FROM filed_disputes`
  ).get() as { n: number }).n;
  const totalClients = (db.prepare(
    `SELECT COUNT(DISTINCT client_id) as n FROM filed_disputes`
  ).get() as { n: number }).n;
  return { totalDisputes, totalClients, dbPath: DB_PATH };
}
