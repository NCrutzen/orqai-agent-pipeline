-- =============================================
-- Database Schema: Systems Registry & Automation Tasks (Phase 40)
-- =============================================
-- Execute AFTER schema.sql, schema-pipeline.sql, schema-approval.sql, schema-credentials.sql
-- Depends on: projects, pipeline_runs, project_members, auth.users, update_updated_at() function from schema.sql

-- =============================================
-- Systems (global registry)
-- =============================================
-- Stores target systems with their integration method.
-- Mirrors the credentials global-with-project-linking pattern.
CREATE TABLE systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'acceptance', 'test')),
  integration_method TEXT NOT NULL
    CHECK (integration_method IN ('api', 'browser-automation', 'knowledge-base', 'manual')),
  url TEXT,
  auth_notes TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- System-Project Links (many-to-many)
-- =============================================
-- Links systems to projects. A system can be used by multiple projects.
CREATE TABLE system_project_links (
  system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (system_id, project_id)
);

-- =============================================
-- Automation Tasks (per-run automation detection results)
-- =============================================
-- Tracks each detected automation need per pipeline run.
CREATE TABLE automation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  agent_name TEXT NOT NULL,
  system_name TEXT NOT NULL,
  system_id UUID REFERENCES systems(id),
  detected_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'analyzing', 'reviewing',
                      'confirmed', 'failed', 'skipped')),
  sop_text TEXT,
  analysis_result JSONB,
  confirmed_steps JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_systems_created_by ON systems(created_by);
CREATE UNIQUE INDEX idx_systems_name_environment ON systems(name, environment);
CREATE INDEX idx_system_project_links_project ON system_project_links(project_id);
CREATE INDEX idx_automation_tasks_run_id ON automation_tasks(run_id);

-- Partial index: only index tasks still in progress
CREATE INDEX idx_automation_tasks_status ON automation_tasks(status)
  WHERE status NOT IN ('confirmed', 'skipped');

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_tasks ENABLE ROW LEVEL SECURITY;

-- Systems: users see only their own systems
CREATE POLICY "Users see own systems" ON systems
  FOR SELECT USING (created_by = (SELECT auth.uid()));

-- Systems: users can create systems (must be the creator)
CREATE POLICY "Users create systems" ON systems
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

-- No UPDATE/DELETE client policies -- admin client handles mutations
-- (status changes, system deletion all via server actions)

-- System-project links: visible to system owners OR project members
CREATE POLICY "System owners see links" ON system_project_links
  FOR SELECT USING (
    system_id IN (
      SELECT id FROM systems WHERE created_by = (SELECT auth.uid())
    )
    OR
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- System-project links: insert only by system owners
CREATE POLICY "System owners create links" ON system_project_links
  FOR INSERT WITH CHECK (
    system_id IN (
      SELECT id FROM systems WHERE created_by = (SELECT auth.uid())
    )
  );

-- Automation tasks: visible to run owners via pipeline_runs join
CREATE POLICY "Run owners see automation tasks" ON automation_tasks
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs WHERE created_by = (SELECT auth.uid())
    )
  );

-- =============================================
-- Triggers: auto-update updated_at
-- =============================================
-- Reuses the update_updated_at() function from schema.sql
CREATE TRIGGER on_system_updated
  BEFORE UPDATE ON systems
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_automation_task_updated
  BEFORE UPDATE ON automation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
