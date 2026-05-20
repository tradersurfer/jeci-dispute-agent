import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface RawParsedAccount {
  creditor_name: string;
  account_type: string;
  account_number: string | null;
  balance: number;
  credit_limit: number | null;
  status: string;
  payment_status: string;
  date_opened: string | null;
  date_closed: string | null;
  date_of_last_activity: string | null;
  date_of_first_delinquency: string | null;
  late_payments: { days_30: number; days_60: number; days_90: number } | null;
  on_equifax: boolean;
  on_experian: boolean;
  on_transunion: boolean;
  remarks: string[];
}

export interface RawParsedInquiry {
  creditor_name: string;
  inquiry_date: string;
  purpose: string | null;
  on_equifax: boolean;
  on_experian: boolean;
  on_transunion: boolean;
}

export interface RawParsedPublicRecord {
  type: string;
  date_filed: string;
  date_resolved: string | null;
  amount: number | null;
  status: string | null;
  bureau: string;
}

export interface RawParsedReport {
  personal: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    ssn_last4: string | null;
    date_of_birth: string | null;
  };
  scores: {
    equifax: number | null;
    experian: number | null;
    transunion: number | null;
  };
  accounts: RawParsedAccount[];
  inquiries: RawParsedInquiry[];
  public_records: RawParsedPublicRecord[];
}

export async function extractPDFText(fileBuffer: Buffer): Promise<string> {
  // Dynamically import pdf-parse (CommonJS module)
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(fileBuffer);
  return data.text;
}

export async function parseCreditReportText(rawText: string): Promise<RawParsedReport> {
  const systemPrompt = `You are a credit report parser for a professional credit repair service.
Extract ALL structured data from raw credit report text into JSON.
Rules:
- Respond with valid JSON ONLY — no markdown, no preamble, no explanation.
- If a field is ambiguous or missing, use null.
- Dates must be ISO format: YYYY-MM-DD.
- Account types: revolving, installment, mortgage, collection, charge_off, medical, student_loan, auto, utility, public_record, other.
- Payment statuses: current, late_30, late_60, late_90, late_120, unpaid, paid, derogatory.
- Bureau presence: set on_equifax/on_experian/on_transunion based on which bureau sections list this account.
- Be thorough — extract ALL accounts including closed, paid, and collections.
- For inquiries, include all hard inquiries listed under each bureau.`;

  const userPrompt = `Parse this credit report and return the JSON object below with all extracted data.

JSON shape:
{
  "personal": {
    "name": "string",
    "address": "string",
    "city": "string",
    "state": "string (2-letter)",
    "zip": "string",
    "ssn_last4": "string | null",
    "date_of_birth": "YYYY-MM-DD | null"
  },
  "scores": {
    "equifax": "number | null",
    "experian": "number | null",
    "transunion": "number | null"
  },
  "accounts": [
    {
      "creditor_name": "string",
      "account_type": "revolving|installment|mortgage|collection|charge_off|medical|student_loan|auto|utility|public_record|other",
      "account_number": "last 4 digits only | null",
      "balance": "number (0 if paid/closed)",
      "credit_limit": "number | null",
      "status": "string (open/closed/paid/etc)",
      "payment_status": "current|late_30|late_60|late_90|late_120|unpaid|paid|derogatory",
      "date_opened": "YYYY-MM-DD | null",
      "date_closed": "YYYY-MM-DD | null",
      "date_of_last_activity": "YYYY-MM-DD | null",
      "date_of_first_delinquency": "YYYY-MM-DD | null",
      "late_payments": { "days_30": 0, "days_60": 0, "days_90": 0 } | null,
      "on_equifax": true|false,
      "on_experian": true|false,
      "on_transunion": true|false,
      "remarks": ["string array of remarks/comments"]
    }
  ],
  "inquiries": [
    {
      "creditor_name": "string",
      "inquiry_date": "YYYY-MM-DD",
      "purpose": "string | null",
      "on_equifax": true|false,
      "on_experian": true|false,
      "on_transunion": true|false
    }
  ],
  "public_records": [
    {
      "type": "bankruptcy|tax_lien|civil_judgment|foreclosure|other",
      "date_filed": "YYYY-MM-DD",
      "date_resolved": "YYYY-MM-DD | null",
      "amount": "number | null",
      "status": "string | null",
      "bureau": "Equifax|Experian|TransUnion"
    }
  ]
}

Credit report text (first 14,000 characters):
${rawText.slice(0, 14000)}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim());
}
