-- ============================================================
-- JECI DISPUTE AGENT — SUPABASE SCHEMA
-- 700 Credit Club
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  date_of_birth DATE,
  ssn_last4 TEXT, -- Store ONLY last 4 digits

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- CRC Integration
  crc_client_id TEXT UNIQUE, -- External CRC ID for sync
  crc_synced_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_hold', 'completed')),
  onboarded_at TIMESTAMPTZ,
  notes TEXT
);

-- ============================================================
-- CREDIT SCORE SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS score_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ DEFAULT NOW(),

  -- Scores per bureau
  equifax_score INTEGER,
  experian_score INTEGER,
  transunion_score INTEGER,

  -- Source
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'upload', 'crc_sync', 'api')),
  report_date DATE,
  notes TEXT
);

-- ============================================================
-- CREDIT ACCOUNTS (TRADELINES)
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Account Info
  account_name TEXT NOT NULL,
  account_type TEXT CHECK (account_type IN (
    'credit_card', 'auto_loan', 'mortgage', 'student_loan',
    'personal_loan', 'collection', 'charge_off', 'medical',
    'utility', 'other'
  )),
  account_number_masked TEXT, -- Last 4 only: e.g. "****1234"
  original_creditor TEXT,
  current_creditor TEXT,

  -- Financials
  credit_limit NUMERIC(12,2),
  balance NUMERIC(12,2),
  monthly_payment NUMERIC(12,2),
  past_due_amount NUMERIC(12,2),

  -- Status
  account_status TEXT CHECK (account_status IN (
    'current', 'late_30', 'late_60', 'late_90', 'late_120',
    'charge_off', 'collection', 'closed', 'paid', 'settled',
    'transferred', 'unknown'
  )),
  is_negative BOOLEAN DEFAULT FALSE,
  is_open BOOLEAN DEFAULT TRUE,

  -- Dates
  date_opened DATE,
  date_closed DATE,
  date_of_last_activity DATE,
  date_of_first_delinquency DATE,

  -- Bureau Reporting
  reports_equifax BOOLEAN DEFAULT FALSE,
  reports_experian BOOLEAN DEFAULT FALSE,
  reports_transunion BOOLEAN DEFAULT FALSE,

  -- Dispute eligibility
  is_disputable BOOLEAN DEFAULT FALSE,
  dispute_reason TEXT,
  notes TEXT
);

-- ============================================================
-- NEGATIVE ITEMS (Flagged for dispute)
-- ============================================================
CREATE TABLE IF NOT EXISTS negative_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id UUID REFERENCES credit_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Item Details
  item_type TEXT NOT NULL CHECK (item_type IN (
    'collection', 'charge_off', 'late_payment', 'repossession',
    'foreclosure', 'bankruptcy', 'judgment', 'tax_lien',
    'inquiry', 'mixed_file', 'identity_theft', 'other'
  )),
  description TEXT,
  amount NUMERIC(12,2),

  -- Bureau Presence
  on_equifax BOOLEAN DEFAULT FALSE,
  on_experian BOOLEAN DEFAULT FALSE,
  on_transunion BOOLEAN DEFAULT FALSE,

  -- Dispute Status per bureau
  equifax_status TEXT DEFAULT 'pending' CHECK (equifax_status IN ('pending', 'in_dispute', 'deleted', 'verified', 'updated', 'not_applicable')),
  experian_status TEXT DEFAULT 'pending' CHECK (experian_status IN ('pending', 'in_dispute', 'deleted', 'verified', 'updated', 'not_applicable')),
  transunion_status TEXT DEFAULT 'pending' CHECK (transunion_status IN ('pending', 'in_dispute', 'deleted', 'verified', 'updated', 'not_applicable')),

  -- Dates
  date_of_first_delinquency DATE,
  expected_fall_off_date DATE, -- 7 years from first delinquency (or 10 for bankruptcy)

  -- Priority
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 1 = highest

  notes TEXT
);

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  negative_item_id UUID REFERENCES negative_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Dispute Details
  round_number INTEGER NOT NULL DEFAULT 1,
  bureau TEXT NOT NULL CHECK (bureau IN ('equifax', 'experian', 'transunion', 'all')),
  dispute_type TEXT CHECK (dispute_type IN (
    'not_mine', 'incorrect_balance', 'incorrect_status',
    'duplicate', 'obsolete', 'unverifiable', 'fraud',
    'incorrect_dates', 'paid_shown_unpaid', 'settled_shown_unpaid', 'other'
  )),
  dispute_reason TEXT NOT NULL,

  -- Letter
  letter_template_id UUID,
  letter_content TEXT, -- Full generated dispute letter
  letter_sent_at TIMESTAMPTZ,
  letter_method TEXT CHECK (letter_method IN ('mail', 'online', 'certified_mail', 'email', 'fax')),
  tracking_number TEXT,

  -- Response
  response_received_at TIMESTAMPTZ,
  response_outcome TEXT CHECK (response_outcome IN (
    'deleted', 'updated', 'verified', 'no_response', 'pending', 'partial'
  )),
  response_notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'ready_to_send', 'sent', 'awaiting_response',
    'responded', 'escalated', 'closed_win', 'closed_loss'
  )),

  -- Deadlines
  response_due_date DATE, -- 30 days from send date (FCRA)
  follow_up_date DATE,

  notes TEXT
);

-- ============================================================
-- DISPUTE LETTER TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS dispute_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  dispute_type TEXT NOT NULL,
  round_number INTEGER DEFAULT 1,
  bureau TEXT CHECK (bureau IN ('equifax', 'experian', 'transunion', 'all', 'creditor')),

  -- Template content with {{placeholder}} variables
  subject_line TEXT,
  body TEXT NOT NULL,

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  notes TEXT
);

-- ============================================================
-- BUREAU RESPONSES
-- ============================================================
CREATE TABLE IF NOT EXISTS bureau_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  bureau TEXT NOT NULL CHECK (bureau IN ('equifax', 'experian', 'transunion')),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  response_method TEXT CHECK (response_method IN ('mail', 'online', 'email')),

  -- Parsed outcome
  outcome TEXT CHECK (outcome IN ('deleted', 'updated', 'verified', 'partial', 'no_change')),
  items_deleted INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_verified INTEGER DEFAULT 0,

  -- Raw content
  raw_response_text TEXT,
  document_url TEXT, -- Supabase storage path to uploaded response doc

  notes TEXT
);

-- ============================================================
-- HARD INQUIRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS hard_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  creditor_name TEXT NOT NULL,
  inquiry_date DATE NOT NULL,
  expected_fall_off_date DATE GENERATED ALWAYS AS (inquiry_date + INTERVAL '2 years') STORED,

  on_equifax BOOLEAN DEFAULT FALSE,
  on_experian BOOLEAN DEFAULT FALSE,
  on_transunion BOOLEAN DEFAULT FALSE,

  is_authorized BOOLEAN DEFAULT TRUE,
  is_disputable BOOLEAN DEFAULT FALSE,
  dispute_status TEXT DEFAULT 'none' CHECK (dispute_status IN ('none', 'in_dispute', 'deleted', 'verified')),

  notes TEXT
);

-- ============================================================
-- ACTION QUEUE (What JECI should do next per client)
-- ============================================================
CREATE TABLE IF NOT EXISTS action_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  action_type TEXT NOT NULL CHECK (action_type IN (
    'generate_letter', 'send_dispute', 'follow_up',
    'parse_response', 'escalate', 'update_score',
    'notify_client', 'request_validation', 'close_dispute',
    'recommend_next_round'
  )),
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),

  -- References
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  negative_item_id UUID REFERENCES negative_items(id) ON DELETE SET NULL,

  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Payload for agent
  payload JSONB,
  result JSONB,
  error_message TEXT,

  notes TEXT
);

-- ============================================================
-- CRC SYNC LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS crc_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  sync_type TEXT CHECK (sync_type IN ('client', 'dispute', 'account', 'score', 'full')),
  crc_entity_id TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('success', 'failed', 'partial')),
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  raw_payload JSONB
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clients_crc_id ON clients(crc_client_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_client ON credit_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_negative ON credit_accounts(client_id, is_negative);
CREATE INDEX IF NOT EXISTS idx_negative_items_client ON negative_items(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_client ON disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_bureau ON disputes(bureau);
CREATE INDEX IF NOT EXISTS idx_action_queue_pending ON action_queue(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_action_queue_client ON action_queue(client_id, status);
CREATE INDEX IF NOT EXISTS idx_bureau_responses_dispute ON bureau_responses(dispute_id);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_client ON score_snapshots(client_id, captured_at DESC);

-- ============================================================
-- UPDATED_AT AUTO-TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_credit_accounts
  BEFORE UPDATE ON credit_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_negative_items
  BEFORE UPDATE ON negative_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_disputes
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_action_queue
  BEFORE UPDATE ON action_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
