-- Migration: V7 Foundation tables
-- Created: 2026-04-15
-- All tables use projects.id as swarm_id FK

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Agent execution events (terminal stream, swimlane, graph data source)
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('thinking', 'tool_call', 'tool_result', 'waiting', 'done', 'error', 'delegation')),
  span_id TEXT,
  parent_span_id TEXT,
  content JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kanban job tracking
CREATE TABLE swarm_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'backlog' CHECK (stage IN ('backlog', 'ready', 'progress', 'review', 'done')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_agent TEXT,
  tags JSONB DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent registry per swarm
CREATE TABLE swarm_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  role TEXT,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'waiting', 'error', 'offline')),
  parent_agent TEXT,
  metrics JSONB DEFAULT '{}',
  skills JSONB DEFAULT '[]',
  orqai_deployment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swarm_id, agent_name)
);

-- Cached AI briefing narratives
CREATE TABLE swarm_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  narrative TEXT NOT NULL,
  metrics_snapshot JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_agent_events_swarm ON agent_events(swarm_id, created_at DESC);
CREATE INDEX idx_agent_events_span ON agent_events(span_id);
CREATE INDEX idx_swarm_jobs_swarm_stage ON swarm_jobs(swarm_id, stage);
CREATE INDEX idx_swarm_agents_swarm ON swarm_agents(swarm_id);
CREATE INDEX idx_swarm_briefings_swarm ON swarm_briefings(swarm_id, generated_at DESC);

-- ============================================================
-- 3. REALTIME (REPLICA IDENTITY FULL)
-- ============================================================

ALTER TABLE agent_events REPLICA IDENTITY FULL;
ALTER TABLE swarm_jobs REPLICA IDENTITY FULL;
ALTER TABLE swarm_agents REPLICA IDENTITY FULL;
ALTER TABLE swarm_briefings REPLICA IDENTITY FULL;

-- ============================================================
-- 4. REALTIME PUBLICATION
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE agent_events, swarm_jobs, swarm_agents, swarm_briefings;

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent_events"
  ON agent_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_jobs"
  ON swarm_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_agents"
  ON swarm_agents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_briefings"
  ON swarm_briefings FOR SELECT TO authenticated USING (true);

-- Service role (via admin client) handles all writes -- no INSERT/UPDATE policies for authenticated
