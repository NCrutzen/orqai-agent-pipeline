-- Migration: Phase 50 Data Pipeline -- trace sync infrastructure
-- Created: 2026-04-16
--
-- Provides:
-- 1. Partial unique index on agent_events(span_id, event_type) for idempotent cron re-runs
-- 2. orqai_sync_state table tracking watermark per swarm
-- 3. projects.orqai_project_id column mapping our swarms to Orq.ai workspace projects

-- ============================================================
-- 1. IDEMPOTENCY INDEX ON agent_events
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS agent_events_span_event_idx
  ON agent_events(span_id, event_type)
  WHERE span_id IS NOT NULL;

-- ============================================================
-- 2. SYNC WATERMARK TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS orqai_sync_state (
  swarm_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_end_time TIMESTAMPTZ,
  last_cursor TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT,
  last_inserted_count INT DEFAULT 0
);

-- ============================================================
-- 3. ORQ.AI PROJECT MAPPING ON projects
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS orqai_project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_orqai_project_id
  ON projects(orqai_project_id)
  WHERE orqai_project_id IS NOT NULL;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE orqai_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read orqai_sync_state"
  ON orqai_sync_state FOR SELECT TO authenticated USING (true);

-- Service role (admin client) handles all writes -- no INSERT/UPDATE policies for authenticated
