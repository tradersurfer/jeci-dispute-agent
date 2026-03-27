// ============================================================
// JECI AI Dispute Agent — Core Types
// 700 Credit Club Experts | JECI Group
// ============================================================

export type Bureau = 'Equifax' | 'Experian' | 'TransUnion';
export type DisputeRound = 1 | 2 | 3;
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type PipelineStage =
  | 'New Lead'
  | 'Audit Completed'
  | 'Enrolled / Active'
  | 'Round 1 Disputes Filed'
  | 'Round 2 Disputes Filed'
  | 'Round 3 / Advanced Legal'
  | 'Credit Building Phase'
  | 'Graduated (700+)'
  | 'Maintenance Member';

// ── Credit Report Types ──────────────────────────────────────

export interface CreditAccount {
  id: string;
  creditorName: string;
  accountNumber: string;           // Last 4 digits only
  accountType: AccountType;
  status: AccountStatus;
  balance: number;
  creditLimit?: number;
  paymentStatus: PaymentStatus;
  dateOpened: Date;
  dateReported: Date;
  dateClosed?: Date;
  lastPaymentDate?: Date;
  originalCreditor?: string;
  bureaus: Bureau[];               // Which bureaus report this
  latePayments?: LatePayment[];
  remarks?: string[];
  isDisputed?: boolean;
}

export type AccountType =
  | 'revolving'
  | 'installment'
  | 'mortgage'
  | 'collection'
  | 'charge_off'
  | 'medical'
  | 'student_loan'
  | 'auto'
  | 'utility'
  | 'public_record';

export type AccountStatus =
  | 'open'
  | 'closed'
  | 'paid'
  | 'in_collections'
  | 'charged_off'
  | 'transferred'
  | 'settled';

export type PaymentStatus =
  | 'current'
  | 'late_30'
  | 'late_60'
  | 'late_90'
  | 'late_120'
  | 'unpaid'
  | 'paid'
  | 'derogatory';

export interface LatePayment {
  date: Date;
  daysLate: 30 | 60 | 90 | 120;
  bureau: Bureau;
}

export interface HardInquiry {
  id: string;
  creditorName: string;
  date: Date;
  bureau: Bureau;
  purpose?: string;
}

export interface PublicRecord {
  id: string;
  type: 'bankruptcy' | 'tax_lien' | 'civil_judgment' | 'foreclosure';
  dateFiled: Date;
  dateResolved?: Date;
  amount?: number;
  bureau: Bureau;
  caseNumber?: string;
}

export interface PersonalInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ssn?: string;                    // Last 4 only, used in letters
  dob?: Date;
}

export interface CreditReport {
  clientId: string;
  personalInfo: PersonalInfo;
  scores: Record<Bureau, number>;
  accounts: CreditAccount[];
  inquiries: HardInquiry[];
  publicRecords: PublicRecord[];
  reportDate: Date;
  rawReportText?: string;          // Original text if parsed from PDF
}

// ── Dispute Types ────────────────────────────────────────────

export type DisputeReason =
  | 'EXCEEDS_7_YEAR_LIMIT'
  | 'EXCEEDS_10_YEAR_LIMIT'
  | 'DUPLICATE_ACCOUNT'
  | 'PAID_REPORTING_UNPAID'
  | 'INCORRECT_BALANCE'
  | 'INCORRECT_DATE'
  | 'FUTURE_DATE'
  | 'ACCOUNT_NOT_MINE'
  | 'IDENTITY_THEFT'
  | 'MEDICAL_UNDER_500'
  | 'MEDICAL_INSURANCE_COVERED'
  | 'UNVERIFIABLE_DEBT'
  | 'STATUTE_OF_LIMITATIONS'
  | 'DISCHARGED_IN_BANKRUPTCY'
  | 'FCRA_REPORTING_VIOLATION'
  | 'FDCPA_VIOLATION'
  | 'DUPLICATE_COLLECTION'
  | 'ORIGINAL_CREDITOR_AND_COLLECTION'
  | 'INQUIRY_WITHOUT_PERMISSIBLE_PURPOSE'
  | 'INQUIRY_BEYOND_2_YEARS'
  | 'INCORRECT_PERSONAL_INFO';

export interface DisputeItem {
  accountId: string;
  creditorName: string;
  accountNumber: string;
  accountType: AccountType;
  bureau: Bureau;
  reason: DisputeReason;
  reasonDescription: string;
  legalCitation: string;
  priority: Priority;
  expectedDeletionRate: number;    // 0-100 percentage
  balance?: number;
  additionalNotes?: string;
  requiresHumanReview: boolean;
}

export interface DisputeAnalysis {
  clientId: string;
  clientName: string;
  analysisDate: Date;
  totalNegativeItems: number;
  disputeItems: DisputeItem[];
  quickWins: DisputeItem[];        // >85% expected deletion rate
  estimatedPointRecovery: number;
  recommendedRound: DisputeRound;
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
  summary: string;
}

// ── Letter Types ─────────────────────────────────────────────

export interface DisputeLetter {
  clientId: string;
  clientName: string;
  bureau: Bureau;
  round: DisputeRound;
  items: DisputeItem[];
  letterContent: string;
  generatedAt: Date;
  filename: string;
}

export interface LetterGenerationParams {
  clientName: string;
  clientAddress: string;
  ssn?: string;                    // Last 4
  bureau: Bureau;
  items: DisputeItem[];
}

// ── CRC API Types ────────────────────────────────────────────

export interface CRCClient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  pipelineStage: PipelineStage;
  enrolledAt: Date;
  scores?: Record<Bureau, number>;
  negativeItemCount?: number;
  affiliateId?: string;
}

export interface CRCWebhookPayload {
  event: CRCWebhookEvent;
  clientId: string;
  clientName?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type CRCWebhookEvent =
  | 'client.enrolled'
  | 'client.report_uploaded'
  | 'client.bureau_response'
  | 'client.deletion_confirmed'
  | 'client.stage_changed'
  | 'lead.created';

// ── Workflow Types ───────────────────────────────────────────

export interface WorkflowResult {
  clientId: string;
  round: DisputeRound;
  success: boolean;
  lettersGenerated: number;
  itemsTargeted: number;
  bureausTargeted: Bureau[];
  errors: string[];
  nextAction: string;
  nextActionDate: Date;
}