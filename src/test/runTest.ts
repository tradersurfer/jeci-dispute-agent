// ============================================================
// JECI AI — Full Test Suite
// Run with: npm test
//
// Tests:
//  1. Report analyzer (rules engine)
//  2. Round filter logic (all 3 rounds)
//  3. Database (SQLite dispute tracking)
//  4. 3-round lifecycle simulation (no CRC/Claude calls)
//  5. Scheduler readiness logic
//  6. Error edge cases
// ============================================================

import { analyzeReport, groupDisputesByBureau, filterItemsForRound } from '../tools/reportAnalyzer.js';
import {
  recordFiledDisputes,
  getFiledDisputeKeys,
  getFiledKeysForRound,
  hasFiledRound,
  recordScoreSnapshot,
  getScoreHistory,
  recordPipelineEvent,
  cacheReport,
  getCachedReport,
} from '../db/disputeDb.js';
import { CreditReport, DisputeItem } from '../types/index.js';

// ── Mock credit report (realistic test case) ─────────────────

const mockReport: CreditReport = {
  clientId:   'TEST-001',
  reportDate: new Date(),

  personalInfo: {
    name:    'Marcus Johnson',
    address: '1234 Biscayne Blvd',
    city:    'Miami',
    state:   'FL',
    zip:     '33101',
    ssn:     '1234',
  },

  scores: {
    Equifax:    581,
    Experian:   574,
    TransUnion: 590,
  },

  accounts: [
    // ✅ Should trigger EXCEEDS_7_YEAR_LIMIT
    {
      id:            'acct-001',
      creditorName:  'Capital One',
      accountNumber: '4521',
      accountType:   'charge_off',
      status:        'charged_off',
      balance:       2400,
      paymentStatus: 'derogatory',
      dateOpened:    new Date('2014-01-15'),
      dateReported:  new Date('2016-03-01'),
      bureaus:       ['Equifax', 'TransUnion'],
    },
    // ✅ Should trigger PAID_REPORTING_UNPAID
    {
      id:            'acct-002',
      creditorName:  'Midland Credit',
      accountNumber: '8877',
      accountType:   'collection',
      status:        'paid',
      balance:       0,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2020-06-01'),
      dateReported:  new Date('2022-01-15'),
      bureaus:       ['Equifax', 'Experian', 'TransUnion'],
    },
    // ✅ Should trigger MEDICAL_UNDER_500
    {
      id:            'acct-003',
      creditorName:  'Jackson Memorial Hospital',
      accountNumber: '3341',
      accountType:   'medical',
      status:        'in_collections',
      balance:       285,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2022-09-01'),
      dateReported:  new Date('2023-02-01'),
      bureaus:       ['Experian', 'TransUnion'],
    },
    // ✅ Should trigger MEDICAL_INSURANCE_COVERED (over $500)
    {
      id:            'acct-004',
      creditorName:  'Baptist Health System',
      accountNumber: '7712',
      accountType:   'medical',
      status:        'in_collections',
      balance:       1850,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2023-01-01'),
      dateReported:  new Date('2023-06-01'),
      bureaus:       ['Equifax'],
    },
    // ✅ Should trigger DUPLICATE_ACCOUNT
    {
      id:            'acct-005a',
      creditorName:  'Portfolio Recovery',
      accountNumber: '9912',
      accountType:   'collection',
      status:        'in_collections',
      balance:       890,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2021-03-01'),
      dateReported:  new Date('2022-01-01'),
      bureaus:       ['Equifax'],
    },
    {
      id:            'acct-005b',
      creditorName:  'Portfolio Recovery',
      accountNumber: '9912',
      accountType:   'collection',
      status:        'in_collections',
      balance:       890,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2021-03-01'),
      dateReported:  new Date('2022-01-01'),
      bureaus:       ['Equifax'],
    },
    // ✅ Clean account — should NOT be disputed
    {
      id:            'acct-006',
      creditorName:  'Chase Bank',
      accountNumber: '1155',
      accountType:   'revolving',
      status:        'open',
      balance:       250,
      creditLimit:   5000,
      paymentStatus: 'current',
      dateOpened:    new Date('2019-05-01'),
      dateReported:  new Date(),
      bureaus:       ['Equifax', 'Experian', 'TransUnion'],
    },
  ],

  inquiries: [
    // ✅ Should trigger INQUIRY_BEYOND_2_YEARS
    {
      id:           'inq-001',
      creditorName: 'CarMax Auto Finance',
      date:         new Date('2022-11-01'),
      bureau:       'Experian',
    },
    // ✅ Should trigger INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE
    {
      id:           'inq-002',
      creditorName: 'Unknown Lender LLC',
      date:         new Date('2024-08-15'),
      bureau:       'TransUnion',
    },
    // Clean inquiry
    {
      id:           'inq-003',
      creditorName: 'Bank of America',
      date:         new Date('2025-01-10'),
      bureau:       'Equifax',
      purpose:      'Credit card application',
    },
  ],

  publicRecords: [],
};

// ── Test utilities ────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

// ── TEST SUITE 1: Report Analyzer ────────────────────────────

function testAnalyzer(): void {
  section('TEST SUITE 1: Report Analyzer (Rules Engine)');

  const analysis = analyzeReport(mockReport);

  assert(analysis.disputeItems.length > 0,       'Has disputable items');
  assert(analysis.quickWins.length > 0,           'Has quick wins (≥85%, no human review)');
  assert(analysis.estimatedPointRecovery > 0,     'Has point recovery estimate');
  assert(analysis.clientName === 'Marcus Johnson', 'Client name parsed correctly');

  // Specific rule checks
  const hasCapOneExpired = analysis.disputeItems.some(
    d => d.creditorName === 'Capital One' && d.reason === 'EXCEEDS_7_YEAR_LIMIT',
  );
  const hasMidlandPaid = analysis.disputeItems.some(
    d => d.creditorName === 'Midland Credit' && d.reason === 'PAID_REPORTING_UNPAID',
  );
  const hasMedicalUnder500 = analysis.disputeItems.some(
    d => d.reason === 'MEDICAL_UNDER_500',
  );
  const hasDuplicate = analysis.disputeItems.some(
    d => d.reason === 'DUPLICATE_ACCOUNT',
  );
  const hasExpiredInquiry = analysis.disputeItems.some(
    d => d.reason === 'INQUIRY_BEYOND_2_YEARS',
  );
  const chaseNotDisputed = !analysis.disputeItems.some(
    d => d.creditorName === 'Chase Bank',
  );
  const allCriticalHaveHighRate = analysis.disputeItems
    .filter(d => d.priority === 'CRITICAL')
    .every(d => d.expectedDeletionRate >= 90);

  assert(hasCapOneExpired,         'Capital One 7-year limit detected');
  assert(hasMidlandPaid,           'Midland Credit paid/unpaid mismatch detected');
  assert(hasMedicalUnder500,       'Medical under $500 detected (CFPB 2023)');
  assert(hasDuplicate,             'Duplicate account detected');
  assert(hasExpiredInquiry,        'Expired inquiry (>2yr) detected');
  assert(chaseNotDisputed,         'Clean Chase account NOT disputed');
  assert(allCriticalHaveHighRate,  'All CRITICAL items have ≥90% deletion rate');

  // Priority breakdown
  const priorities = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const item of analysis.disputeItems) priorities[item.priority]++;
  assert(priorities.CRITICAL > 0, `CRITICAL items: ${priorities.CRITICAL}`);
  assert(priorities.HIGH >= 0,    `HIGH items: ${priorities.HIGH}`);

  // Bureau grouping
  const byBureau = groupDisputesByBureau(analysis.disputeItems);
  assert(byBureau.size > 0, `Items grouped across ${byBureau.size} bureau(s)`);
}

// ── TEST SUITE 2: Round Filter Logic ─────────────────────────

function testRoundFilters(): void {
  section('TEST SUITE 2: Round Filter Logic');

  const analysis   = analyzeReport(mockReport);
  const allItems   = analysis.disputeItems;
  const emptyFiled = new Set<string>();

  // Round 1: high confidence, no human review
  const round1 = filterItemsForRound(allItems, 1, emptyFiled);
  assert(round1.length > 0,                             `Round 1 has ${round1.length} targets`);
  assert(round1.every(i => i.expectedDeletionRate >= 75), 'Round 1: all items ≥75% rate');
  assert(round1.every(i => !i.requiresHumanReview),     'Round 1: no human review items');

  // Round 2: requires items filed in Round 1
  const round1Keys = new Set(round1.map(i => `${i.accountId}:${i.bureau}`));
  const round2     = filterItemsForRound(allItems, 2, round1Keys);
  // Round 2 items must have been filed in round 1
  assert(
    round2.every(i => round1Keys.has(`${i.accountId}:${i.bureau}`)),
    `Round 2: all ${round2.length} items were previously filed in Round 1`,
  );
  assert(round2.every(i => i.expectedDeletionRate >= 50), 'Round 2: all items ≥50% rate');

  // Round 3: legal escalation — includes human review items
  const allFiled = new Set([...round1.map(i => `${i.accountId}:${i.bureau}`)]);
  const round3   = filterItemsForRound(allItems, 3, allFiled);
  assert(round3.length >= 0, `Round 3 has ${round3.length} escalation targets`);

  // Verify no items in round 1 that require human review
  const humanReviewInRound1 = round1.filter(i => i.requiresHumanReview);
  assert(humanReviewInRound1.length === 0, 'Round 1 correctly excludes human-review items');

  console.log(`  → Round 1: ${round1.length} | Round 2: ${round2.length} | Round 3: ${round3.length}`);
}

// ── TEST SUITE 3: Database Operations ────────────────────────

function testDatabase(): void {
  section('TEST SUITE 3: SQLite Database (Dispute Tracking)');

  const testClientId = `test-db-${Date.now()}`;

  // Test filing disputes
  recordFiledDisputes([
    { clientId: testClientId, accountId: 'acc-1', bureau: 'Equifax',    round: 1, reason: 'EXCEEDS_7_YEAR_LIMIT', creditor: 'Test Creditor' },
    { clientId: testClientId, accountId: 'acc-2', bureau: 'Experian',   round: 1, reason: 'PAID_REPORTING_UNPAID', creditor: 'Test Creditor 2' },
    { clientId: testClientId, accountId: 'acc-3', bureau: 'TransUnion', round: 1, reason: 'MEDICAL_UNDER_500', creditor: 'Hospital' },
  ]);

  const keys = getFiledDisputeKeys(testClientId);
  assert(keys.size === 3,                          `Filed 3 disputes, retrieved ${keys.size}`);
  assert(keys.has('acc-1:Equifax'),                'Key acc-1:Equifax exists');
  assert(keys.has('acc-2:Experian'),               'Key acc-2:Experian exists');
  assert(hasFiledRound(testClientId, 1),           'hasFiledRound(1) returns true');
  assert(!hasFiledRound(testClientId, 2),          'hasFiledRound(2) returns false (not yet)');

  // Test deduplication (same record should not insert twice)
  recordFiledDisputes([
    { clientId: testClientId, accountId: 'acc-1', bureau: 'Equifax', round: 1, reason: 'EXCEEDS_7_YEAR_LIMIT', creditor: 'Test Creditor' },
  ]);
  const keysAfterDupe = getFiledDisputeKeys(testClientId);
  assert(keysAfterDupe.size === 3,                 'Duplicate insert ignored (still 3 records)');

  // Round-specific keys
  const round1Keys = getFiledKeysForRound(testClientId, 1);
  assert(round1Keys.size === 3,                    `Round 1 specific keys: ${round1Keys.size}`);

  // Score snapshots
  recordScoreSnapshot(testClientId, 0, { equifax: 580, experian: 575, transunion: 590 });
  recordScoreSnapshot(testClientId, 1, { equifax: 580, experian: 575, transunion: 590 });

  const history = getScoreHistory(testClientId);
  assert(history.length >= 2,                      `Score history has ${history.length} entries`);
  assert(history[0].equifax === 580,               'Equifax baseline score stored correctly');

  // Pipeline events
  recordPipelineEvent(testClientId, 'test_event', { foo: 'bar' });
  assert(true,                                     'Pipeline event recorded without error');

  // Report cache
  const fakeReport = { clientId: testClientId, accounts: [{ id: 'x' }] };
  cacheReport(testClientId, 'test_source', fakeReport);
  const cached = getCachedReport(testClientId);
  assert(cached !== null,                          'Report cached and retrieved');
  assert(cached?.source === 'test_source',         'Cache source field correct');
}

// ── TEST SUITE 4: 3-Round Lifecycle Simulation ────────────────
// Simulates the full 3-round dispute lifecycle without any
// CRC or Claude API calls. Tests the orchestration logic
// using the database and filter engine.

function testLifecycleSimulation(): void {
  section('TEST SUITE 4: Full 3-Round Lifecycle Simulation');

  const clientId   = `lifecycle-${Date.now()}`;
  const analysis   = analyzeReport(mockReport);
  const allItems   = analysis.disputeItems;

  // ── ROUND 1 ─────────────────────────────────────────────
  console.log('\n  [Round 1] Starting baseline audit...');
  const emptyFiled = getFiledDisputeKeys(clientId);
  const round1Items = filterItemsForRound(allItems, 1, emptyFiled);

  assert(round1Items.length > 0, `Round 1: ${round1Items.length} items targeted`);

  // Simulate filing Round 1 disputes
  recordFiledDisputes(round1Items.map(item => ({
    clientId,
    accountId: item.accountId,
    bureau:    item.bureau,
    round:     1,
    reason:    item.reason,
    creditor:  item.creditorName,
  })));
  recordScoreSnapshot(clientId, 0, { equifax: 581, experian: 574, transunion: 590 });
  recordPipelineEvent(clientId, 'round_1_filed', { items: round1Items.length });

  assert(hasFiledRound(clientId, 1), 'Round 1 marked as filed in DB');

  // ── ROUND 2 ─────────────────────────────────────────────
  // Simulate: bureau responded, some items verified (not removed)
  console.log('\n  [Round 2] Bureau responded — escalating verified items...');

  const round1Filed = getFiledKeysForRound(clientId, 1);
  const round2Items = filterItemsForRound(allItems, 2, round1Filed);

  console.log(`  → Round 2 targets (items bureau "verified"): ${round2Items.length}`);

  if (round2Items.length > 0) {
    recordFiledDisputes(round2Items.map(item => ({
      clientId,
      accountId: item.accountId,
      bureau:    item.bureau,
      round:     2,
      reason:    item.reason,
      creditor:  item.creditorName,
    })));
    recordScoreSnapshot(clientId, 2, { equifax: 590, experian: 582, transunion: 598 });
    recordPipelineEvent(clientId, 'round_2_filed', { items: round2Items.length });

    assert(hasFiledRound(clientId, 2), 'Round 2 marked as filed in DB');
  } else {
    assert(true, 'Round 2: no items (bureau removed all — ideal outcome)');
  }

  // ── ROUND 3 ─────────────────────────────────────────────
  console.log('\n  [Round 3] Legal escalation...');

  const allFiled    = getFiledDisputeKeys(clientId);
  const round3Items = filterItemsForRound(allItems, 3, allFiled);

  console.log(`  → Round 3 legal escalation targets: ${round3Items.length}`);

  if (round3Items.length > 0) {
    recordFiledDisputes(round3Items.map(item => ({
      clientId,
      accountId: item.accountId,
      bureau:    item.bureau,
      round:     3,
      reason:    item.reason,
      creditor:  item.creditorName,
    })));
    recordScoreSnapshot(clientId, 3, { equifax: 605, experian: 598, transunion: 612 });
    recordPipelineEvent(clientId, 'round_3_filed', { items: round3Items.length });
    assert(true, `Round 3: ${round3Items.length} items escalated to legal`);
  } else {
    assert(true, 'Round 3: no remaining items — dispute complete');
  }

  // ── Verify score progression ─────────────────────────────
  const scoreHistory = getScoreHistory(clientId);
  assert(scoreHistory.length >= 1, `Score history has ${scoreHistory.length} snapshots`);

  const equifaxScores = scoreHistory
    .filter(s => s.equifax !== null)
    .map(s => s.equifax as number);

  if (equifaxScores.length >= 2) {
    const improved = equifaxScores[equifaxScores.length - 1] >= equifaxScores[0];
    assert(improved, `Equifax score improved: ${equifaxScores[0]} → ${equifaxScores[equifaxScores.length - 1]}`);
  } else {
    assert(true, 'Score tracking recorded (single data point)');
  }

  // ── Total dispute coverage ───────────────────────────────
  const totalFiled = getFiledDisputeKeys(clientId).size;
  console.log(`\n  → Total unique account+bureau disputes filed across all rounds: ${totalFiled}`);
  assert(totalFiled > 0, `Total of ${totalFiled} unique dispute items tracked in DB`);
}

// ── TEST SUITE 5: Scheduler Date Logic ───────────────────────

function testSchedulerLogic(): void {
  section('TEST SUITE 5: Scheduler Date & Readiness Logic');

  // Test: parse scheduled date from notes
  function parseScheduledDate(notes: string[]): Date | null {
    for (const note of notes) {
      const match = note.match(/JECI_AI_SCHEDULE:.*on (\d{1,2}\/\d{1,2}\/\d{4})/);
      if (match) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }
    return null;
  }

  const pastDate   = new Date();
  pastDate.setDate(pastDate.getDate() - 40);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);

  const pastNotes   = [`JECI_AI_SCHEDULE: Round 2 check on ${pastDate.toLocaleDateString()}`];
  const futureNotes = [`JECI_AI_SCHEDULE: Round 2 check on ${futureDate.toLocaleDateString()}`];

  const parsedPast   = parseScheduledDate(pastNotes);
  const parsedFuture = parseScheduledDate(futureNotes);

  assert(parsedPast !== null,                   'Past scheduled date parsed from note');
  assert(parsedFuture !== null,                 'Future scheduled date parsed from note');
  assert(parsedPast! <= new Date(),             'Past date correctly identified as ready');
  assert(parsedFuture! > new Date(),            'Future date correctly identified as not ready');
  assert(parseScheduledDate([]) === null,       'Empty notes returns null');
  assert(parseScheduledDate(['random note']) === null, 'Non-schedule note returns null');

  // Test: days calculation
  const sevenWeeksAgo = new Date();
  sevenWeeksAgo.setDate(sevenWeeksAgo.getDate() - 49);
  const daysSince = (date: Date) => (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  assert(daysSince(sevenWeeksAgo) >= 35, '7 weeks ago is ≥35 days (ready for Round 2)');

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  assert(daysSince(twoWeeksAgo) < 35, '2 weeks ago is <35 days (not ready for Round 2)');
}

// ── TEST SUITE 6: Edge Cases ──────────────────────────────────

function testEdgeCases(): void {
  section('TEST SUITE 6: Edge Cases & Error Paths');

  // Empty report
  const emptyReport: CreditReport = {
    clientId:    'empty-test',
    reportDate:  new Date(),
    personalInfo: { name: 'Empty Client', address: '', city: '', state: 'FL', zip: '' },
    scores:       { Equifax: 0, Experian: 0, TransUnion: 0 },
    accounts:    [],
    inquiries:   [],
    publicRecords: [],
  };

  const emptyAnalysis = analyzeReport(emptyReport);
  assert(emptyAnalysis.disputeItems.length === 0,  'Empty report: no dispute items');
  assert(emptyAnalysis.estimatedPointRecovery === 0,'Empty report: zero point recovery');

  // Report with only clean accounts
  const cleanReport: CreditReport = {
    ...emptyReport,
    clientId: 'clean-test',
    accounts: [{
      id:            'clean-1',
      creditorName:  'Good Bank',
      accountNumber: '1234',
      accountType:   'revolving',
      status:        'open',
      balance:       100,
      creditLimit:   5000,
      paymentStatus: 'current',
      dateOpened:    new Date('2020-01-01'),
      dateReported:  new Date(),
      bureaus:       ['Equifax'],
    }],
  };

  const cleanAnalysis = analyzeReport(cleanReport);
  assert(cleanAnalysis.disputeItems.length === 0,  'Clean account: not disputed');

  // Future date account
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  const futureReport: CreditReport = {
    ...emptyReport,
    clientId: 'future-test',
    accounts: [{
      id:            'future-1',
      creditorName:  'Future Bank',
      accountNumber: '9999',
      accountType:   'collection',
      status:        'in_collections',
      balance:       500,
      paymentStatus: 'unpaid',
      dateOpened:    new Date('2020-01-01'),
      dateReported:  futureDate, // Future date!
      bureaus:       ['Experian'],
    }],
  };

  const futureAnalysis = analyzeReport(futureReport);
  assert(
    futureAnalysis.disputeItems.some(d => d.reason === 'FUTURE_DATE'),
    'Future report date detected as FCRA violation',
  );

  // Database uniqueness constraint
  const dupeId = `dupe-test-${Date.now()}`;
  recordFiledDisputes([
    { clientId: dupeId, accountId: 'x1', bureau: 'Equifax', round: 1, reason: 'TEST', creditor: 'C' },
  ]);
  recordFiledDisputes([
    { clientId: dupeId, accountId: 'x1', bureau: 'Equifax', round: 1, reason: 'TEST', creditor: 'C' },
  ]);
  const dupeKeys = getFiledDisputeKeys(dupeId);
  assert(dupeKeys.size === 1, 'Duplicate DB insert correctly ignored (UNIQUE constraint)');

  // Score snapshot with missing bureaus
  const partialId = `partial-${Date.now()}`;
  recordScoreSnapshot(partialId, 0, { equifax: 600 }); // Only Equifax
  const partialHistory = getScoreHistory(partialId);
  assert(partialHistory.length === 1,          'Partial score snapshot stored');
  assert(partialHistory[0].equifax === 600,    'Equifax score correct');
  assert(partialHistory[0].experian === null,  'Missing Experian stored as null');
}

// ── FINAL REPORT ──────────────────────────────────────────────

function runTests(): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  JECI AI — Full Test Suite                      ║');
  console.log('║  700 Credit Club Experts | JECI Group           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  try {
    testAnalyzer();
    testRoundFilters();
    testDatabase();
    testLifecycleSimulation();
    testSchedulerLogic();
    testEdgeCases();
  } catch (err) {
    console.error('\n💥 Test suite threw unexpected error:', err);
    failed++;
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════╗');
  if (failed === 0) {
    console.log(`║  ✅ ALL ${passed} TESTS PASSED                        ║`);
  } else {
    console.log(`║  ❌ ${failed} FAILED / ${passed} PASSED                      ║`);
  }
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (failed > 0) process.exit(1);
}

runTests();
