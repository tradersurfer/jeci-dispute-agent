-- ============================================================
-- CREDORA AI — ADDITIONAL TABLES
-- Run this in Supabase SQL editor after schema.sql
-- ============================================================

-- ── Analyses ─────────────────────────────────────────────────
-- Stores each PDF analysis result and generated letters
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  client_name TEXT NOT NULL,
  client_address TEXT,
  session_id TEXT,              -- Stripe checkout session ID

  -- Summary stats
  total_items INTEGER DEFAULT 0,
  quick_wins INTEGER DEFAULT 0,
  estimated_points INTEGER DEFAULT 0,

  -- Full results as JSONB
  dispute_items JSONB DEFAULT '[]',
  letters_generated JSONB DEFAULT '[]',  -- [{bureau, round, preview, full_content}]
  categories JSONB DEFAULT '{}',          -- {category: count}
  bureaus_affected TEXT[] DEFAULT '{}',
  scores JSONB DEFAULT '{}',             -- {equifax, experian, transunion}

  -- ZIP storage path in Supabase Storage
  zip_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_analyses_session ON analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);

-- ── Paid Sessions ─────────────────────────────────────────────
-- Tracks Stripe-confirmed payments to gate dashboard access
CREATE TABLE IF NOT EXISTS paid_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  session_id TEXT UNIQUE NOT NULL,      -- Stripe session or subscription ID
  customer_email TEXT,
  customer_name TEXT,
  plan TEXT,                            -- 'Credora Scan' | 'Credora Sweep' | 'Credora Repair'
  price_id TEXT,
  amount_total INTEGER,                 -- in cents
  currency TEXT DEFAULT 'usd',
  payment_status TEXT,                  -- 'paid' | 'unpaid' | 'canceled'
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paid_sessions_email ON paid_sessions(customer_email);

-- ── Supabase Storage Bucket ───────────────────────────────────
-- Create the dispute-packages bucket (run once)
-- Note: you can also create this in Supabase dashboard → Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-packages', 'dispute-packages', false)
ON CONFLICT (id) DO NOTHING;
