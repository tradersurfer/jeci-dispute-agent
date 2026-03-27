// ============================================================
// JECI AI — Credit Report Analyzer
// The brain of the dispute engine.
// Finds every disputable item under FCRA + FDCPA.
// ============================================================

import {
  CreditReport,
  CreditAccount,
  HardInquiry,
  PublicRecord,
  DisputeItem,
  DisputeAnalysis,
  DisputeReason,
  DisputeRound,
  Bureau,
  Priority,
} from '../types/index.js';

// ── Constants ────────────────────────────────────────────────

const SEVEN_YEARS_MS  = 7  * 365.25 * 24 * 60 * 60 * 1000;
const TEN_YEARS_MS    = 10 * 365.25 * 24 * 60 * 60 * 1000;
const TWO_YEARS_MS    = 2  * 365.25 * 24 * 60 * 60 * 1000;

// CFPB 2023: medical debt under $500 no longer collectible on reports
const MEDICAL_EXEMPT_THRESHOLD = 500;

// Estimated point recovery by account type on deletion
const POINT_RECOVERY_MAP: Record<string, number> = {
  collection:    35,
  charge_off:    40,
  medical:       25,
  late_payment:  15,
  inquiry:        5,
  public_record: 50,
  duplicate:     20,
};

// Legal citation library
const CITATIONS: Record<DisputeReason, string> = {
  EXCEEDS_7_YEAR_LIMIT:
    'FCRA 15 USC 1681c(a) — Prohibits reporting of most negative information beyond 7 years',
  EXCEEDS_10_YEAR_LIMIT:
    'FCRA 15 USC 1681c(a)(1) — Bankruptcies older than 10 years prohibited',
  DUPLICATE_ACCOUNT:
    'FCRA 15 USC 1681e(b) — CRA must follow reasonable procedures to ensure maximum possible accuracy',
  PAID_REPORTING_UNPAID:
    'FCRA 15 USC 1681s-2(a)(1) — Furnishers prohibited from reporting known inaccuracies',
  INCORRECT_BALANCE:
    'FCRA 15 USC 1681s-2(a)(1)(A) — Must report accurate balance information',
  INCORRECT_DATE:
    'FCRA 15 USC 1681c(c) — Must use correct delinquency date for reporting period calculation',
  FUTURE_DATE:
    'FCRA 15 USC 1681e(b) — Future dates constitute factual inaccuracy requiring deletion',
  ACCOUNT_NOT_MINE:
    'FCRA 15 USC 1681i — Consumer has right to dispute and obtain deletion of unverifiable information',
  IDENTITY_THEFT:
    'FCRA 15 USC 1681c-2 — Block of information resulting from identity theft required within 4 days',
  MEDICAL_UNDER_500:
    'CFPB Final Rule 2023 — Medical debt under $500 exempt from credit reporting',
  MEDICAL_INSURANCE_COVERED:
    'FCRA 15 USC 1681s-2 — Insurance-covered medical debt may not be accurately attributed to consumer',
  UNVERIFIABLE_DEBT:
    'FCRA 15 USC 1681i(a)(1) — Unverifiable information must be deleted within 30 days',
  STATUTE_OF_LIMITATIONS:
    'FDCPA 15 USC 1692e — Collection of time-barred debt without disclosure is deceptive practice',
  DISCHARGED_IN_BANKRUPTCY:
    'FCRA 15 USC 1681c + 11 USC 524 — Discharged debts may not be reported as owing',
  FCRA_REPORTING_VIOLATION:
    'FCRA 15 USC 1681n/1681o — Willful or negligent noncompliance carries $1,000 statutory damages',
  FDCPA_VIOLATION:
    'FDCPA 15 USC 1692 — Debt collector violations subject to $1,000 statutory damages per violation',
  DUPLICATE_COLLECTION:
    'FCRA 15 USC 1681e(b) — Same debt may not appear as both original account and collection',
  ORIGINAL_CREDITOR_AND_COLLECTION:
    'FCRA 15 USC 1681e(b) — Double-reporting same debt inflates negative impact inaccurately',
  INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE:
    'FCRA 15 USC 1681b — Only permissible purposes authorize hard inquiry; unauthorized pulls must be removed',
  INQUIRY_BEYOND_2_YEARS:
    'FCRA 15 USC 1681c(a)(3) — Hard inquiries may not be reported beyond 2 years',
  INCORRECT_PERSONAL_INFO:
    'FCRA 15 USC 1681i — Consumer has right to dispute and correct inaccurate personal information',
};

// ── Helper Functions ─────────────────────────────────────────

function ageMs(date: Date): number {
  return Date.now() - new Date(date).getTime();
}

function yearsSince(date: Date): number {
  return ageMs(date) / (365.25 * 24 * 60 * 60 * 1000);
}

function makeItem(
  account: CreditAccount,
  bureau: Bureau,
  reason: DisputeReason,
  reasonDescription: string,
  priority: Priority,
  expectedDeletionRate: number,
  additionalNotes?: string,
  requiresHumanReview = false,
): DisputeItem {
  return {
    accountId:           account.id,
    creditorName:        account.creditorName,
    accountNumber:       account.accountNumber,
    accountType:         account.accountType,
    bureau,
    reason,
    reasonDescription,
    legalCitation:       CITATIONS[reason],
    priority,
    expectedDeletionRate,
    balance:             account.balance,
    additionalNotes,
    requiresHumanReview,
  };
}

// ── Rule Engine ──────────────────────────────────────────────

function checkReportingAge(
  account: CreditAccount,
  bureau: Bureau,
  disputes: DisputeItem[],
) {
  // Bankruptcies: 10-year rule
  if (account.accountType === 'public_record') return;

  const age = ageMs(account.dateReported);

  if (age > SEVEN_YEARS_MS) {
    disputes.push(makeItem(
      account, bureau,
      'EXCEEDS_7_YEAR_LIMIT',
      `Account has been reporting for ${yearsSince(account.dateReported).toFixed(1)} years, ` +
      `exceeding the 7-year FCRA limit. Must be deleted immediately.`,
      'CRITICAL', 97,
      `Date opened: ${account.dateOpened.toLocaleDateString()}. ` +
      `Reporting since: ${account.dateReported.toLocaleDateString()}.`,
    ));
  }
}

function checkDuplicates(
  accounts: CreditAccount[],
  disputes: DisputeItem[],
) {
  const seen = new Map<string, CreditAccount[]>();

  for (const acct of accounts) {
    // Key by creditor name + last-4 account number
    const key = `${acct.creditorName.toLowerCase()}:${acct.accountNumber}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(acct);
  }

  for (const [, group] of seen) {
    if (group.length < 2) continue;

    for (const acct of group) {
      for (const bureau of acct.bureaus) {
        disputes.push(makeItem(
          acct, bureau,
          'DUPLICATE_ACCOUNT',
          `"${acct.creditorName}" account ${acct.accountNumber} appears ` +
          `${group.length} times on this report. Duplicate reporting inflates ` +
          `negative impact and violates FCRA accuracy requirements.`,
          'CRITICAL', 94,
          `Duplicate found ${group.length} times. All but one instance must be deleted.`,
        ));
      }
    }
  }
}

function checkOriginalPlusCollection(
  accounts: CreditAccount[],
  disputes: DisputeItem[],
) {
  const collections = accounts.filter(a => a.accountType === 'collection');
  const originals   = accounts.filter(a => a.accountType !== 'collection');

  for (const col of collections) {
    const matchingOriginal = originals.find(o =>
      o.originalCreditor &&
      col.creditorName.toLowerCase().includes(o.originalCreditor.toLowerCase()),
    );

    if (matchingOriginal) {
      for (const bureau of col.bureaus) {
        disputes.push(makeItem(
          col, bureau,
          'ORIGINAL_CREDITOR_AND_COLLECTION',
          `"${col.creditorName}" (collection) and "${matchingOriginal.creditorName}" ` +
          `(original) appear to represent the same debt. Double-reporting same ` +
          `obligation is an FCRA accuracy violation.`,
          'HIGH', 82,
          `Original account ID: ${matchingOriginal.id}. ` +
          `The collection entry should be deleted or the original marked closed/transferred.`,
          true,  // Needs human review to confirm match
        ));
      }
    }
  }
}

function checkPaidReportingUnpaid(
  account: CreditAccount,
  bureau: Bureau,
  disputes: DisputeItem[],
) {
  if (
    (account.status === 'paid' || account.balance === 0) &&
    account.paymentStatus === 'unpaid'
  ) {
    disputes.push(makeItem(
      account, bureau,
      'PAID_REPORTING_UNPAID',
      `Account shows $0 balance / paid status but payment status field reports ` +
      `"unpaid." This factual inaccuracy must be corrected or the account deleted.`,
      'HIGH', 91,
    ));
  }
}

function checkMedicalDebt(
  account: CreditAccount,
  bureau: Bureau,
  disputes: DisputeItem[],
) {
  if (account.accountType !== 'medical') return;

  // CFPB 2023 rule: under $500 = exempt
  if (account.balance < MEDICAL_EXEMPT_THRESHOLD) {
    disputes.push(makeItem(
      account, bureau,
      'MEDICAL_UNDER_500',
      `Medical debt of $${account.balance} falls below the CFPB 2023 threshold of ` +
      `$${MEDICAL_EXEMPT_THRESHOLD}. Medical debts under this amount are exempt ` +
      `from credit reporting and must be removed.`,
      'CRITICAL', 98,
    ));
  } else {
    // Larger medical — flag for verification (insurance coverage possible)
    disputes.push(makeItem(
      account, bureau,
      'MEDICAL_INSURANCE_COVERED',
      `Medical debt of $${account.balance} from "${account.creditorName}" should ` +
      `be verified as not covered by insurance. Insurance-covered medical debts ` +
      `cannot be accurately attributed to the consumer.`,
      'MEDIUM', 55,
      `Client should verify EOB (Explanation of Benefits) from insurer.`,
      true,
    ));
  }
}

function checkFutureDates(
  account: CreditAccount,
  bureau: Bureau,
  disputes: DisputeItem[],
) {
  const now = new Date();

  if (account.dateReported > now) {
    disputes.push(makeItem(
      account, bureau,
      'FUTURE_DATE',
      `"${account.creditorName}" shows a report date of ` +
      `${account.dateReported.toLocaleDateString()}, which is in the future. ` +
      `This is a factual impossibility and constitutes an FCRA inaccuracy.`,
      'HIGH', 93,
    ));
  }

  if (account.dateClosed && account.dateClosed > now) {
    disputes.push(makeItem(
      account, bureau,
      'INCORRECT_DATE',
      `Account closure date of ${account.dateClosed.toLocaleDateString()} is in the future.`,
      'MEDIUM', 85,
    ));
  }
}

function checkDischargedBankruptcy(
  account: CreditAccount,
  bureau: Bureau,
  publicRecords: PublicRecord[],
  disputes: DisputeItem[],
) {
  const hasBankruptcy = publicRecords.some(
    r => r.type === 'bankruptcy' && r.dateResolved,
  );

  if (
    hasBankruptcy &&
    (account.accountType === 'collection' || account.accountType === 'charge_off') &&
    account.status !== 'paid'
  ) {
    disputes.push(makeItem(
      account, bureau,
      'DISCHARGED_IN_BANKRUPTCY',
      `Client has a resolved bankruptcy on file. "${account.creditorName}" ` +
      `may be a discharged debt that cannot legally be reported as owing.`,
      'HIGH', 78,
      `Cross-reference with bankruptcy discharge paperwork. Account may need ` +
      `to show "discharged in bankruptcy" or be deleted entirely.`,
      true,
    ));
  }
}

function checkInquiries(
  inquiries: HardInquiry[],
  disputes: DisputeItem[],
) {
  for (const inq of inquiries) {
    const age = ageMs(inq.date);

    if (age > TWO_YEARS_MS) {
      disputes.push({
        accountId:           inq.id,
        creditorName:        inq.creditorName,
        accountNumber:       'N/A',
        accountType:         'revolving',
        bureau:              inq.bureau,
        reason:              'INQUIRY_BEYOND_2_YEARS',
        reasonDescription:   `Hard inquiry from "${inq.creditorName}" on ` +
                             `${inq.date.toLocaleDateString()} is ` +
                             `${yearsSince(inq.date).toFixed(1)} years old, ` +
                             `exceeding the 2-year reporting limit.`,
        legalCitation:       CITATIONS['INQUIRY_BEYOND_2_YEARS'],
        priority:            'MEDIUM',
        expectedDeletionRate: 96,
        requiresHumanReview: false,
      });
    } else if (!inq.purpose) {
      // No stated purpose — challenge permissible basis
      disputes.push({
        accountId:           inq.id,
        creditorName:        inq.creditorName,
        accountNumber:       'N/A',
        accountType:         'revolving',
        bureau:              inq.bureau,
        reason:              'INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE',
        reasonDescription:   `Hard inquiry from "${inq.creditorName}" on ` +
                             `${inq.date.toLocaleDateString()} has no stated ` +
                             `permissible purpose on file. Consumer did not ` +
                             `authorize this pull.`,
        legalCitation:       CITATIONS['INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE'],
        priority:            'MEDIUM',
        expectedDeletionRate: 62,
        requiresHumanReview: true,
        additionalNotes:     'Client must confirm whether they applied for credit with this company.',
      });
    }
  }
}

function checkPublicRecords(
  records: PublicRecord[],
  disputes: DisputeItem[],
) {
  for (const record of records) {
    const age = ageMs(record.dateFiled);

    if (record.type === 'bankruptcy' && age > TEN_YEARS_MS) {
      disputes.push({
        accountId:           record.id,
        creditorName:        `Bankruptcy — Case ${record.caseNumber ?? 'Unknown'}`,
        accountNumber:       record.caseNumber ?? 'N/A',
        accountType:         'public_record',
        bureau:              record.bureau,
        reason:              'EXCEEDS_10_YEAR_LIMIT',
        reasonDescription:   `Bankruptcy filed ${yearsSince(record.dateFiled).toFixed(1)} ` +
                             `years ago exceeds the 10-year FCRA reporting limit.`,
        legalCitation:       CITATIONS['EXCEEDS_10_YEAR_LIMIT'],
        priority:            'CRITICAL',
        expectedDeletionRate: 97,
        requiresHumanReview: false,
      });
    } else if (record.type !== 'bankruptcy' && age > SEVEN_YEARS_MS) {
      disputes.push({
        accountId:           record.id,
        creditorName:        `${record.type.replace('_', ' ')} — Case ${record.caseNumber ?? 'Unknown'}`,
        accountNumber:       record.caseNumber ?? 'N/A',
        accountType:         'public_record',
        bureau:              record.bureau,
        reason:              'EXCEEDS_7_YEAR_LIMIT',
        reasonDescription:   `Public record (${record.type}) filed ` +
                             `${yearsSince(record.dateFiled).toFixed(1)} years ago ` +
                             `exceeds the 7-year FCRA reporting limit.`,
        legalCitation:       CITATIONS['EXCEEDS_7_YEAR_LIMIT'],
        priority:            'CRITICAL',
        expectedDeletionRate: 97,
        requiresHumanReview: false,
      });
    }
  }
}

// ── Point Recovery Estimator ─────────────────────────────────

function estimatePointRecovery(items: DisputeItem[]): number {
  // Weight by priority and deletion probability
  let estimated = 0;

  for (const item of items) {
    const base = POINT_RECOVERY_MAP[item.accountType] ?? 15;
    const confidence = item.expectedDeletionRate / 100;
    const priorityMultiplier =
      item.priority === 'CRITICAL' ? 1.2 :
      item.priority === 'HIGH'     ? 1.0 :
      item.priority === 'MEDIUM'   ? 0.7 : 0.4;

    estimated += base * confidence * priorityMultiplier;
  }

  // Cap at realistic max (+180) and floor at 0
  return Math.min(180, Math.max(0, Math.round(estimated)));
}

// ── Main Analyzer ────────────────────────────────────────────

export function analyzeReport(report: CreditReport): DisputeAnalysis {
  const disputes: DisputeItem[] = [];

  // ── Run all rules ────────────────────────────────────────

  // Account-level rules
  for (const account of report.accounts) {
    for (const bureau of account.bureaus) {
      checkReportingAge(account, bureau, disputes);
      checkPaidReportingUnpaid(account, bureau, disputes);
      checkMedicalDebt(account, bureau, disputes);
      checkFutureDates(account, bureau, disputes);
      checkDischargedBankruptcy(account, bureau, report.publicRecords, disputes);
    }
  }

  // Cross-account rules (run once, not per bureau)
  checkDuplicates(report.accounts, disputes);
  checkOriginalPlusCollection(report.accounts, disputes);

  // Inquiry rules
  checkInquiries(report.inquiries, disputes);

  // Public record rules
  checkPublicRecords(report.publicRecords, disputes);

  // ── Deduplicate ──────────────────────────────────────────
  // Avoid flagging the same account+bureau+reason twice
  const seen = new Set<string>();
  const uniqueDisputes = disputes.filter(d => {
    const key = `${d.accountId}:${d.bureau}:${d.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Sort by priority + deletion rate ─────────────────────
  const priorityOrder: Record<Priority, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };

  uniqueDisputes.sort((a, b) => {
    const pDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (pDiff !== 0) return pDiff;
    return b.expectedDeletionRate - a.expectedDeletionRate;
  });

  // ── Quick wins (high confidence, no human review needed) ─
  const quickWins = uniqueDisputes.filter(
    d => d.expectedDeletionRate >= 85 && !d.requiresHumanReview,
  );

  // ── Human review flags ───────────────────────────────────
  const humanReviewItems = uniqueDisputes.filter(d => d.requiresHumanReview);
  const humanReviewReasons = humanReviewItems.map(
    d => `${d.creditorName} (${d.bureau}): ${d.reasonDescription.slice(0, 80)}...`,
  );

  // ── Point recovery estimate ──────────────────────────────
  const estimatedPoints = estimatePointRecovery(uniqueDisputes);

  // ── Summary ──────────────────────────────────────────────
  const criticalCount = uniqueDisputes.filter(d => d.priority === 'CRITICAL').length;
  const highCount     = uniqueDisputes.filter(d => d.priority === 'HIGH').length;

  const summary =
    `JECI AI analysis complete for ${report.personalInfo.name}. ` +
    `Found ${uniqueDisputes.length} disputable items across ` +
    `${new Set(uniqueDisputes.map(d => d.bureau)).size} bureaus. ` +
    `${criticalCount} CRITICAL (immediate deletion), ${highCount} HIGH priority. ` +
    `${quickWins.length} quick wins requiring no human review. ` +
    `Estimated score recovery: +${estimatedPoints} points upon successful deletion.`;

  return {
    clientId:              report.clientId,
    clientName:            report.personalInfo.name,
    analysisDate:          new Date(),
    totalNegativeItems:    report.accounts.filter(
                             a => a.paymentStatus !== 'current' && a.status !== 'open',
                           ).length,
    disputeItems:          uniqueDisputes,
    quickWins,
    estimatedPointRecovery: estimatedPoints,
    recommendedRound:      1,
    humanReviewRequired:   humanReviewItems.length > 0,
    humanReviewReasons,
    summary,
  };
}

// ── Group by Bureau (for letter generation) ──────────────────

export function groupDisputesByBureau(
  items: DisputeItem[],
): Map<Bureau, DisputeItem[]> {
  const map = new Map<Bureau, DisputeItem[]>();

  for (const item of items) {
    if (!map.has(item.bureau)) map.set(item.bureau, []);
    map.get(item.bureau)!.push(item);
  }

  return map;
}

// ── Filter for Round ─────────────────────────────────────────
// Each round targets progressively harder items

export function filterItemsForRound(
  items: DisputeItem[],
  round: DisputeRound,
  previouslyFiled?: Set<string>,
): DisputeItem[] {
  const filed = previouslyFiled ?? new Set();

  if (round === 1) {
    // Round 1: High confidence, no human review needed, not already filed
    return items.filter(
      i => i.expectedDeletionRate >= 75 &&
           !i.requiresHumanReview &&
           !filed.has(`${i.accountId}:${i.bureau}`),
    );
  }

  if (round === 2) {
    // Round 2: Items that survived Round 1 (verified by bureau)
    // + medium confidence items now ready
    return items.filter(
      i => i.expectedDeletionRate >= 50 &&
           filed.has(`${i.accountId}:${i.bureau}`),
    );
  }

  // Round 3: Everything remaining — go legal
  return items.filter(
    i => !filed.has(`${i.accountId}:${i.bureau}`) ||
         (i.requiresHumanReview && i.priority !== 'LOW'),
  );
}