-- =============================================
-- Migration: Uren Controle automation tables
-- Purpose: Support the monthly hour-calculation review pipeline.
--          Adds 4 tables: runs, flagged_rows, reviews, known_exceptions.
--          Environment defaults to 'acceptance' per CLAUDE.md test-first rule.
-- =============================================

-- 1. Runs table — one row per processed Hour Calculation Excel file
CREATE TABLE uren_controle_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  period TEXT,                          -- YYYY-MM derived from filename or sheet
  source_url TEXT,                      -- SharePoint URL (metadata only — no auth/download)
  storage_path TEXT,                    -- path inside automation-files bucket
  parsed_employee_count INT,
  flagged_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','parsing','rules_running','completed','failed')),
  -- CLAUDE.md test-first pattern: DEFAULT 'acceptance'; production requires explicit flip
  environment TEXT NOT NULL DEFAULT 'acceptance'
    CHECK (environment IN ('production','acceptance','test')),
  error_message TEXT,
  triggered_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_uren_runs_status ON uren_controle_runs(status);
CREATE INDEX idx_uren_runs_period ON uren_controle_runs(period);
CREATE INDEX idx_uren_runs_environment ON uren_controle_runs(environment);

-- 2. Flagged rows — one row per detected issue
CREATE TABLE uren_controle_flagged_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES uren_controle_runs(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_category TEXT,               -- 'monteur' | 'detexie' | 'kantoor' | 'onbekend'
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('tnt_mismatch','verschil_outlier','weekend_flip','verzuim_bcs_duplicate')),
  severity TEXT NOT NULL DEFAULT 'review'
    CHECK (severity IN ('review','warning','info')),
  day_date DATE,                        -- specific day (nullable for week-level detections)
  week_number INT,
  raw_values JSONB NOT NULL,            -- { iar, iaw, iew, ier, uar, uaw, uew, uer, ar, aw, ew, er, verschil, verzuim }
  description TEXT NOT NULL,
  suppressed_by_exception BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_uren_flagged_run ON uren_controle_flagged_rows(run_id);
CREATE INDEX idx_uren_flagged_employee ON uren_controle_flagged_rows(employee_name);

-- 3. Reviews — HR accept/reject actions on flagged rows
CREATE TABLE uren_controle_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagged_row_id UUID NOT NULL REFERENCES uren_controle_flagged_rows(id) ON DELETE CASCADE,
  decision TEXT NOT NULL
    CHECK (decision IN ('accept','reject')),
  reason TEXT,                          -- required for reject, optional for accept
  reviewer_id UUID,                     -- auth.users reference (nullable in v1)
  reviewer_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Enforce: one review per flagged row (upsert semantics in the review API)
CREATE UNIQUE INDEX idx_uren_review_one_per_row ON uren_controle_reviews(flagged_row_id);

-- 4. Known exceptions — hardcoded seed for v1, learn-loop comes later
CREATE TABLE known_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation TEXT NOT NULL DEFAULT 'uren-controle',
  employee_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  reason TEXT NOT NULL,                 -- "Structureel overwerk — bekend"
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_known_exc_automation ON known_exceptions(automation, active);

-- 5. Seed: generic placeholder — NOT a real name.
-- HR fills in real names via approved Supabase update after production rollout.
-- Kept inactive (active=false) so it doesn't suppress anything until HR flips it.
INSERT INTO known_exceptions (employee_name, rule_type, reason, active) VALUES
  ('Medewerker_01', 'verschil_outlier', 'Structureel overwerk — placeholder; HR vervangt door echte naam na go-live', false);
