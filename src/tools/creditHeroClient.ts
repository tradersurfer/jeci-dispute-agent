// ============================================================
// JECI AI — Credit Hero Score API Client
// Fetches the parsed 3-bureau credit report that the client
// pulled and synced from Credit Hero Score (or CRC tradelines
// as fallback). Maps their format to our CreditReport type.
//
// ENV VARS:
//   CREDIT_HERO_API_KEY   — API key for Credit Hero Score
//   CREDIT_HERO_API_URL   — Base URL (default: https://api.creditheroscore.com/v1)
//
// When CRC_API_ENABLED is false (free trial), Credit Hero Score
// is the primary report source since it has its own API.
// When CRC is enabled (Grow/Scale plan), we also pull CRC tradelines
// as a cross-reference.
// ============================================================

import {
  CreditReport,
  CreditAccount,
  HardInquiry,
  PublicRecord,
  Bureau,
  AccountType,
  AccountStatus,
  PaymentStatus,
} from '../types/index.js';

const CREDIT_HERO_BASE = process.env.CREDIT_HERO_API_URL ?? 'https://api.creditheroscore.com/v1';
const CREDIT_HERO_KEY  = process.env.CREDIT_HERO_API_KEY ?? '';

// ── Credit Hero Score API Response Types ──────────────────────
// These reflect the expected JSON shape from Credit Hero Score.
// Adjust field names if their actual API differs.

interface CHSScore {
  equifax:    number;
  experian:   number;
  transunion: number;
}

interface CHSAccount {
  id:                string;
  creditor_name:     string;
  account_number:    string;   // Last 4 only
  account_type:      string;   // 'revolving','installment','collection', etc.
  status:            string;   // 'open','closed','charged_off','in_collections'
  balance:           number;
  credit_limit?:     number;
  payment_status:    string;   // 'current','late_30','unpaid', etc.
  date_opened:       string;   // ISO date
  date_reported:     string;
  date_closed?:      string;
  last_payment_date?: string;
  original_creditor?: string;
  bureaus:           string[]; // ['Equifax','Experian','TransUnion']
  remarks?:          string[];
  is_medical?:       boolean;
}

interface CHSInquiry {
  id:            string;
  creditor_name: string;
  date:          string;
  bureau:        string;
  purpose?:      string;
}

interface CHSPublicRecord {
  id:             string;
  type:           string;   // 'bankruptcy','tax_lien','civil_judgment','foreclosure'
  date_filed:     string;
  date_resolved?: string;
  amount?:        number;
  bureau:         string;
  case_number?:   string;
}

interface CHSReportResponse {
  client_id:       string;
  report_date:     string;
  personal_info: {
    name:    string;
    address: string;
    city:    string;
    state:   string;
    zip:     string;
    ssn?:    string;   // Last 4
    dob?:    string;
  };
  scores:          CHSScore;
  accounts:        CHSAccount[];
  inquiries:       CHSInquiry[];
  public_records:  CHSPublicRecord[];
  raw_text?:       string;
}

// ── Type mappers ──────────────────────────────────────────────

function mapAccountType(raw: string): AccountType {
  const map: Record<string, AccountType> = {
    revolving:   'revolving',
    installment: 'installment',
    mortgage:    'mortgage',
    collection:  'collection',
    charge_off:  'charge_off',
    charged_off: 'charge_off',
    medical:     'medical',
    student:     'student_loan',
    student_loan:'student_loan',
    auto:        'auto',
    utility:     'utility',
    public:      'public_record',
  };
  return map[raw.toLowerCase()] ?? 'revolving';
}

function mapAccountStatus(raw: string): AccountStatus {
  const map: Record<string, AccountStatus> = {
    open:           'open',
    closed:         'closed',
    paid:           'paid',
    in_collections: 'in_collections',
    collection:     'in_collections',
    charged_off:    'charged_off',
    charge_off:     'charged_off',
    transferred:    'transferred',
    settled:        'settled',
  };
  return map[raw.toLowerCase()] ?? 'open';
}

function mapPaymentStatus(raw: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    current:    'current',
    late_30:    'late_30',
    '30_days':  'late_30',
    late_60:    'late_60',
    '60_days':  'late_60',
    late_90:    'late_90',
    '90_days':  'late_90',
    late_120:   'late_120',
    '120_days': 'late_120',
    unpaid:     'unpaid',
    paid:       'paid',
    derogatory: 'derogatory',
  };
  return map[raw.toLowerCase()] ?? 'current';
}

function mapBureau(raw: string): Bureau | null {
  const map: Record<string, Bureau> = {
    equifax:    'Equifax',
    experian:   'Experian',
    transunion: 'TransUnion',
    trans_union:'TransUnion',
  };
  return map[raw.toLowerCase()] ?? null;
}

function mapCHSReport(raw: CHSReportResponse, clientId: string): CreditReport {
  const accounts: CreditAccount[] = raw.accounts.map(a => ({
    id:              a.id,
    creditorName:    a.creditor_name,
    accountNumber:   a.account_number,
    accountType:     a.is_medical ? 'medical' : mapAccountType(a.account_type),
    status:          mapAccountStatus(a.status),
    balance:         a.balance,
    creditLimit:     a.credit_limit,
    paymentStatus:   mapPaymentStatus(a.payment_status),
    dateOpened:      new Date(a.date_opened),
    dateReported:    new Date(a.date_reported),
    dateClosed:      a.date_closed ? new Date(a.date_closed) : undefined,
    lastPaymentDate: a.last_payment_date ? new Date(a.last_payment_date) : undefined,
    originalCreditor:a.original_creditor,
    bureaus:         a.bureaus.map(b => mapBureau(b)).filter((b): b is Bureau => b !== null),
    remarks:         a.remarks,
  }));

  const inquiries: HardInquiry[] = raw.inquiries.map(i => ({
    id:           i.id,
    creditorName: i.creditor_name,
    date:         new Date(i.date),
    bureau:       mapBureau(i.bureau) ?? 'Equifax',
    purpose:      i.purpose,
  }));

  const publicRecords: PublicRecord[] = raw.public_records.map(r => ({
    id:           r.id,
    type:         r.type as PublicRecord['type'],
    dateFiled:    new Date(r.date_filed),
    dateResolved: r.date_resolved ? new Date(r.date_resolved) : undefined,
    amount:       r.amount,
    bureau:       mapBureau(r.bureau) ?? 'Equifax',
    caseNumber:   r.case_number,
  }));

  return {
    clientId,
    reportDate:   new Date(raw.report_date),
    personalInfo: {
      name:    raw.personal_info.name,
      address: raw.personal_info.address,
      city:    raw.personal_info.city,
      state:   raw.personal_info.state,
      zip:     raw.personal_info.zip,
      ssn:     raw.personal_info.ssn,
      dob:     raw.personal_info.dob ? new Date(raw.personal_info.dob) : undefined,
    },
    scores: {
      Equifax:    raw.scores.equifax,
      Experian:   raw.scores.experian,
      TransUnion: raw.scores.transunion,
    },
    accounts,
    inquiries,
    publicRecords,
    rawReportText: raw.raw_text,
  };
}

// ── Fetch report from Credit Hero Score API ───────────────────

export async function fetchCreditHeroReport(
  clientId:     string,
  clientEmail:  string,
): Promise<CreditReport | null> {
  if (!CREDIT_HERO_KEY) {
    console.log('  ⚠️  CREDIT_HERO_API_KEY not set — skipping Credit Hero fetch');
    return null;
  }

  try {
    // Credit Hero Score identifies clients by email (their account holder)
    const url = `${CREDIT_HERO_BASE}/report?email=${encodeURIComponent(clientEmail)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CREDIT_HERO_KEY}`,
        'Accept':        'application/json',
      },
    });

    if (res.status === 404) {
      console.log(`  ℹ️  No Credit Hero report found for ${clientEmail}`);
      return null;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Credit Hero API ${res.status}: ${err.slice(0, 200)}`);
    }

    const raw: CHSReportResponse = await res.json();

    if (!raw.accounts || raw.accounts.length === 0) {
      console.log(`  ⚠️  Credit Hero returned empty report for ${clientEmail}`);
      return null;
    }

    const report = mapCHSReport(raw, clientId);
    console.log(
      `  ✓ Credit Hero: ${report.accounts.length} accounts, ` +
      `${report.inquiries.length} inquiries, ` +
      `${report.publicRecords.length} public records`
    );
    return report;

  } catch (err) {
    console.error(`  ✗ Credit Hero fetch failed: ${(err as Error).message}`);
    return null;
  }
}

// ── CRC tradeline fetch (fallback when Credit Hero unavailable) ─
// Parses tradelines stored in CRC's XML API.
// CRC stores imported tradelines under /tradeline/viewAllRecords

export async function fetchCRCTradelines(
  clientId: string,
  personalInfo: {
    name: string; address: string; city: string; state: string; zip: string;
  },
  scores: { Equifax: number; Experian: number; TransUnion: number },
  crcFetchFn: (path: string, xmlData: string) => Promise<string>,
): Promise<CreditReport> {
  const accounts:      CreditAccount[]  = [];
  const inquiries:     HardInquiry[]    = [];
  const publicRecords: PublicRecord[]   = [];

  try {
    // ── Tradelines (accounts + collections) ────────────────
    const tradelineXml = `<crcloud><tradeline><client_id>${clientId}</client_id></tradeline></crcloud>`;
    const tradelineRes = await crcFetchFn('/tradeline/viewAllRecords', tradelineXml);

    const tradelineMatches = [...tradelineRes.matchAll(/<tradeline>(.*?)<\/tradeline>/gs)];
    for (const [, xml] of tradelineMatches) {
      const get = (tag: string) => {
        const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's'));
        return m ? m[1].trim() : '';
      };

      const bureauRaw  = get('bureau');
      const bureau     = mapBureau(bureauRaw);
      if (!bureau) continue;

      const dateOpenedRaw   = get('date_opened') || get('dateOpened');
      const dateReportedRaw = get('date_reported') || get('dateReported') || dateOpenedRaw;

      accounts.push({
        id:             get('id') || `crc-${Date.now()}-${Math.random()}`,
        creditorName:   get('creditor_name') || get('creditorName') || 'Unknown',
        accountNumber:  get('account_number') || get('accountNumber') || '0000',
        accountType:    mapAccountType(get('account_type') || get('accountType') || 'revolving'),
        status:         mapAccountStatus(get('status') || 'open'),
        balance:        parseFloat(get('balance') || '0') || 0,
        creditLimit:    parseFloat(get('credit_limit') || '0') || undefined,
        paymentStatus:  mapPaymentStatus(get('payment_status') || get('paymentStatus') || 'current'),
        dateOpened:     new Date(dateOpenedRaw || Date.now()),
        dateReported:   new Date(dateReportedRaw || Date.now()),
        dateClosed:     get('date_closed') ? new Date(get('date_closed')) : undefined,
        originalCreditor: get('original_creditor') || undefined,
        bureaus:        [bureau],
        remarks:        get('remarks') ? [get('remarks')] : undefined,
      });
    }

    // ── Inquiries ───────────────────────────────────────────
    const inquiryXml = `<crcloud><inquiry><client_id>${clientId}</client_id></inquiry></crcloud>`;
    const inquiryRes = await crcFetchFn('/inquiry/viewAllRecords', inquiryXml);

    const inquiryMatches = [...inquiryRes.matchAll(/<inquiry>(.*?)<\/inquiry>/gs)];
    for (const [, xml] of inquiryMatches) {
      const get = (tag: string) => {
        const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's'));
        return m ? m[1].trim() : '';
      };
      const bureau = mapBureau(get('bureau'));
      if (!bureau) continue;
      inquiries.push({
        id:           get('id') || `inq-${Date.now()}`,
        creditorName: get('creditor_name') || get('creditorName') || 'Unknown',
        date:         new Date(get('inquiry_date') || get('date') || Date.now()),
        bureau,
        purpose:      get('purpose') || undefined,
      });
    }

    // ── Public Records ──────────────────────────────────────
    const prXml = `<crcloud><publicrecord><client_id>${clientId}</client_id></publicrecord></crcloud>`;
    const prRes  = await crcFetchFn('/publicrecord/viewAllRecords', prXml);

    const prMatches = [...prRes.matchAll(/<publicrecord>(.*?)<\/publicrecord>/gs)];
    for (const [, xml] of prMatches) {
      const get = (tag: string) => {
        const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's'));
        return m ? m[1].trim() : '';
      };
      const bureau = mapBureau(get('bureau'));
      if (!bureau) continue;
      publicRecords.push({
        id:           get('id') || `pr-${Date.now()}`,
        type:         (get('type') || 'civil_judgment') as PublicRecord['type'],
        dateFiled:    new Date(get('date_filed') || get('dateFiled') || Date.now()),
        dateResolved: get('date_resolved') ? new Date(get('date_resolved')) : undefined,
        amount:       parseFloat(get('amount') || '0') || undefined,
        bureau,
        caseNumber:   get('case_number') || undefined,
      });
    }

  } catch (err) {
    // Non-fatal: return whatever we managed to collect
    console.warn(`  ⚠️  CRC tradeline fetch partial failure: ${(err as Error).message}`);
  }

  console.log(
    `  ✓ CRC tradelines: ${accounts.length} accounts, ` +
    `${inquiries.length} inquiries, ` +
    `${publicRecords.length} public records`
  );

  return {
    clientId,
    reportDate: new Date(),
    personalInfo,
    scores,
    accounts,
    inquiries,
    publicRecords,
  };
}
