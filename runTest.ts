// ============================================================
// JECI AI — Test Runner
// Run with: npm test
// Tests the report analyzer with a realistic mock client
// ============================================================

import { analyzeReport, groupDisputesByBureau, filterItemsForRound } from '../tools/reportAnalyzer.js';
import { CreditReport } from '../types/index.js';

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
      id:             'acct-001',
      creditorName:   'Capital One',
      accountNumber:  '4521',
      accountType:    'charge_off',
      status:         'charged_off',
      balance:        2400,
      paymentStatus:  'derogatory',
      dateOpened:     new Date('2014-01-15'),
      dateReported:   new Date('2016-03-01'),  // 9+ years ago
      bureaus:        ['Equifax', 'TransUnion'],
    },

    // ✅ Should trigger PAID_REPORTING_UNPAID
    {
      id:             'acct-002',
      creditorName:   'Midland Credit',
      accountNumber:  '8877',
      accountType:    'collection',
      status:         'paid',
      balance:        0,
      paymentStatus:  'unpaid',               // Bug: paid but shows unpaid
      dateOpened:     new Date('2020-06-01'),
      dateReported:   new Date('2022-01-15'),
      bureaus:        ['Equifax', 'Experian', 'TransUnion'],
    },

    // ✅ Should trigger MEDICAL_UNDER_500
    {
      id:             'acct-003',
      creditorName:   'Jackson Memorial Hospital',
      accountNumber:  '3341',
      accountType:    'medical',
      status:         'in_collections',
      balance:        285,                    // Under $500 threshold
      paymentStatus:  'unpaid',
      dateOpened:     new Date('2022-09-01'),
      dateReported:   new Date('2023-02-01'),
      bureaus:        ['Experian', 'TransUnion'],
    },

    // ✅ Should trigger MEDICAL_INSURANCE_COVERED (over $500)
    {
      id:             'acct-004',
      creditorName:   'Baptist Health System',
      accountNumber:  '7712',
      accountType:    'medical',
      status:         'in_collections',
      balance:        1850,
      paymentStatus:  'unpaid',
      dateOpened:     new Date('2023-01-01'),
      dateReported:   new Date('2023-06-01'),
      bureaus:        ['Equifax'],
    },

    // ✅ Should trigger DUPLICATE_ACCOUNT (same account twice)
    {
      id:             'acct-005a',
      creditorName:   'Portfolio Recovery',
      accountNumber:  '9912',
      accountType:    'collection',
      status:         'in_collections',
      balance:        890,
      paymentStatus:  'unpaid',
      dateOpened:     new Date('2021-03-01'),
      dateReported:   new Date('2022-01-01'),
      bureaus:        ['Equifax'],
    },
    {
      id:             'acct-005b',
      creditorName:   'Portfolio Recovery',
      accountNumber:  '9912',                 // Same last-4
      accountType:    'collection',
      status:         'in_collections',
      balance:        890,
      paymentStatus:  'unpaid',
      dateOpened:     new Date('2021-03-01'),
      dateReported:   new Date('2022-01-01'),
      bureaus:        ['Equifax'],             // Duplicate on same bureau
    },

    // ✅ Clean account — should NOT be disputed
    {
      id:             'acct-006',
      creditorName:   'Chase Bank',
      accountNumber:  '1155',
      accountType:    'revolving',
      status:         'open',
      balance:        250,
      creditLimit:    5000,
      paymentStatus:  'current',
      dateOpened:     new Date('2019-05-01'),
      dateReported:   new Date(),
      bureaus:        ['Equifax', 'Experian', 'TransUnion'],
    },
  ],

  inquiries: [
    // ✅ Should trigger INQUIRY_BEYOND_2_YEARS
    {
      id:           'inq-001',
      creditorName: 'CarMax Auto Finance',
      date:         new Date('2022-11-01'),   // 3+ years ago
      bureau:       'Experian',
    },
    // ✅ Should trigger INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE (no purpose)
    {
      id:           'inq-002',
      creditorName: 'Unknown Lender LLC',
      date:         new Date('2024-08-15'),
      bureau:       'TransUnion',
    },
    // Clean inquiry — recent and purposeful
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

// ── Run tests ────────────────────────────────────────────────

function runTests() {
  console.log('\n========================================');
  console.log('  JECI AI — Report Analyzer Test Suite');
  console.log('  700 Credit Club Experts | JECI Group');
  console.log('========================================\n');

  // Test 1: Full analysis
  console.log('TEST 1: Full Report Analysis');
  console.log('─────────────────────────────');
  const analysis = analyzeReport(mockReport);

  console.log(`Client:          ${analysis.clientName}`);
  console.log(`Dispute items:   ${analysis.disputeItems.length}`);
  console.log(`Quick wins:      ${analysis.quickWins.length}`);
  console.log(`Est. recovery:   +${analysis.estimatedPointRecovery} pts`);
  console.log(`Human review:    ${analysis.humanReviewRequired}`);
  console.log('');

  // Test 2: Priority breakdown
  console.log('TEST 2: Priority Breakdown');
  console.log('─────────────────────────────');
  const priorities = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const item of analysis.disputeItems) {
    priorities[item.priority]++;
  }
  console.log(`CRITICAL: ${priorities.CRITICAL}`);
  console.log(`HIGH:     ${priorities.HIGH}`);
  console.log(`MEDIUM:   ${priorities.MEDIUM}`);
  console.log(`LOW:      ${priorities.LOW}`);
  console.log('');

  // Test 3: All dispute items
  console.log('TEST 3: All Disputable Items');
  console.log('─────────────────────────────');
  for (const item of analysis.disputeItems) {
    console.log(`[${item.priority}] ${item.creditorName} (${item.bureau})`);
    console.log(`       Reason: ${item.reason}`);
    console.log(`       Rate:   ${item.expectedDeletionRate}%`);
    console.log(`       Review: ${item.requiresHumanReview ? '⚠️ Yes' : '✅ No'}`);
    console.log('');
  }

  // Test 4: Bureau grouping
  console.log('TEST 4: Group by Bureau');
  console.log('─────────────────────────────');
  const byBureau = groupDisputesByBureau(analysis.disputeItems);
  for (const [bureau, items] of byBureau) {
    console.log(`${bureau}: ${items.length} items`);
  }
  console.log('');

  // Test 5: Round 1 filter
  console.log('TEST 5: Round 1 Targets (≥75% rate, no human review)');
  console.log('─────────────────────────────');
  const round1 = filterItemsForRound(analysis.disputeItems, 1);
  console.log(`Round 1 targets: ${round1.length} items`);
  for (const item of round1) {
    console.log(`  → ${item.creditorName} (${item.bureau}) — ${item.expectedDeletionRate}%`);
  }
  console.log('');

  // Test 6: Validation checks
  console.log('TEST 6: Validation Checks');
  console.log('─────────────────────────────');

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

  console.log(`✅ Capital One expired: ${hasCapOneExpired}`);
  console.log(`✅ Midland paid/unpaid: ${hasMidlandPaid}`);
  console.log(`✅ Medical under $500:  ${hasMedicalUnder500}`);
  console.log(`✅ Duplicate detected:  ${hasDuplicate}`);
  console.log(`✅ Expired inquiry:     ${hasExpiredInquiry}`);
  console.log(`✅ Chase not disputed:  ${chaseNotDisputed}`);

  const allPassed = [
    hasCapOneExpired, hasMidlandPaid, hasMedicalUnder500,
    hasDuplicate, hasExpiredInquiry, chaseNotDisputed,
  ].every(Boolean);

  console.log('');
  console.log(allPassed
    ? '✅ ALL TESTS PASSED — Analyzer is working correctly'
    : '❌ SOME TESTS FAILED — Review analyzer logic',
  );
  console.log('\n========================================\n');
}

runTests();
