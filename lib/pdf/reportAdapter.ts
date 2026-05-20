/**
 * Adapts the Claude-parsed credit report (RawParsedReport)
 * into the CreditReport type expected by the existing reportAnalyzer.ts engine.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  CreditReport,
  CreditAccount,
  HardInquiry,
  PublicRecord,
  AccountType,
  AccountStatus,
  PaymentStatus,
  Bureau,
} from '../../src/types/index.js';
import type { RawParsedReport, RawParsedAccount } from './reportParser.js';

function toBureaus(account: { on_equifax: boolean; on_experian: boolean; on_transunion: boolean }): Bureau[] {
  const bureaus: Bureau[] = [];
  if (account.on_equifax) bureaus.push('Equifax');
  if (account.on_experian) bureaus.push('Experian');
  if (account.on_transunion) bureaus.push('TransUnion');
  return bureaus.length > 0 ? bureaus : ['Equifax', 'Experian', 'TransUnion'];
}

function toAccountType(raw: string): AccountType {
  const map: Record<string, AccountType> = {
    revolving: 'revolving',
    installment: 'installment',
    mortgage: 'mortgage',
    collection: 'collection',
    charge_off: 'charge_off',
    medical: 'medical',
    student_loan: 'student_loan',
    auto: 'auto',
    utility: 'utility',
    public_record: 'public_record',
  };
  return map[raw?.toLowerCase()] ?? 'revolving';
}

function toAccountStatus(raw: string): AccountStatus {
  const map: Record<string, AccountStatus> = {
    open: 'open',
    closed: 'closed',
    paid: 'paid',
    in_collections: 'in_collections',
    collection: 'in_collections',
    charged_off: 'charged_off',
    charge_off: 'charged_off',
    transferred: 'transferred',
    settled: 'settled',
  };
  return map[raw?.toLowerCase()] ?? 'open';
}

function toPaymentStatus(raw: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    current: 'current',
    late_30: 'late_30',
    late_60: 'late_60',
    late_90: 'late_90',
    late_120: 'late_120',
    unpaid: 'unpaid',
    paid: 'paid',
    derogatory: 'derogatory',
  };
  return map[raw?.toLowerCase()] ?? 'current';
}

function parseDate(dateStr: string | null): Date {
  if (!dateStr) return new Date(0);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function adaptAccount(raw: RawParsedAccount, index: number): CreditAccount {
  const bureaus = toBureaus(raw);

  return {
    id: uuidv4(),
    creditorName: raw.creditor_name ?? `Account ${index + 1}`,
    accountNumber: raw.account_number ?? '****',
    accountType: toAccountType(raw.account_type),
    status: toAccountStatus(raw.status),
    balance: raw.balance ?? 0,
    creditLimit: raw.credit_limit ?? undefined,
    paymentStatus: toPaymentStatus(raw.payment_status),
    dateOpened: parseDate(raw.date_opened),
    dateReported: parseDate(raw.date_of_last_activity ?? raw.date_opened),
    dateClosed: raw.date_closed ? parseDate(raw.date_closed) : undefined,
    lastPaymentDate: raw.date_of_last_activity ? parseDate(raw.date_of_last_activity) : undefined,
    bureaus,
    latePayments: raw.late_payments
      ? Object.entries(raw.late_payments)
          .flatMap(([key, count]) => {
            const days = parseInt(key.replace('days_', '')) as 30 | 60 | 90 | 120;
            return Array.from({ length: count as number }, () => ({
              date: parseDate(raw.date_of_first_delinquency),
              daysLate: days,
              bureau: bureaus[0] ?? 'Equifax',
            }));
          })
      : undefined,
    remarks: raw.remarks ?? [],
    isDisputed: false,
  };
}

export function adaptParsedReport(
  raw: RawParsedReport,
  clientId: string
): CreditReport {
  const accounts: CreditAccount[] = raw.accounts.map(adaptAccount);

  const inquiries: HardInquiry[] = raw.inquiries.flatMap((inq) => {
    const result: HardInquiry[] = [];
    const bureaus: Bureau[] = toBureaus(inq);
    bureaus.forEach((bureau) => {
      result.push({
        id: uuidv4(),
        creditorName: inq.creditor_name,
        date: parseDate(inq.inquiry_date),
        bureau,
        purpose: inq.purpose ?? undefined,
      });
    });
    return result;
  });

  const publicRecords: PublicRecord[] = raw.public_records.map((pr) => {
    const typeMap: Record<string, PublicRecord['type']> = {
      bankruptcy: 'bankruptcy',
      tax_lien: 'tax_lien',
      civil_judgment: 'civil_judgment',
      foreclosure: 'foreclosure',
    };
    return {
      id: uuidv4(),
      type: typeMap[pr.type] ?? 'civil_judgment',
      dateFiled: parseDate(pr.date_filed),
      dateResolved: pr.date_resolved ? parseDate(pr.date_resolved) : undefined,
      amount: pr.amount ?? undefined,
      bureau: (pr.bureau as Bureau) ?? 'Equifax',
      caseNumber: undefined,
    };
  });

  const scores = {
    Equifax: raw.scores.equifax ?? 0,
    Experian: raw.scores.experian ?? 0,
    TransUnion: raw.scores.transunion ?? 0,
  };

  return {
    clientId,
    personalInfo: {
      name: raw.personal.name,
      address: raw.personal.address,
      city: raw.personal.city,
      state: raw.personal.state,
      zip: raw.personal.zip,
      ssn: raw.personal.ssn_last4 ?? undefined,
      dob: raw.personal.date_of_birth ? parseDate(raw.personal.date_of_birth) : undefined,
    },
    scores,
    accounts,
    inquiries,
    publicRecords,
    reportDate: new Date(),
    rawReportText: undefined,
  };
}
