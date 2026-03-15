-- =============================================
-- Database Schema: Pipeline Engine (Phase 35)
-- =============================================
-- Execute this in the Supabase SQL Editor AFTER schema.sql.
-- Depends on: projects, project_members tables from schema.sql

-- =============================================
-- Pipeline Runs
-- =============================================
-- One row per pipeline execution. Tracks overall status and progress.
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  use_case TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  inngest_run_id TEXT,
  step_count INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  agent_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) NOT NULL
);

-- =============================================
-- Pipeline Steps
-- =============================================
-- One row per pipeline stage within a run.
-- Mutations are service-role only (Inngest functions use admin client).
CREATE TABLE pipeline_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed', 'skipped')),
  step_order INTEGER NOT NULL,
  result JSONB,
  log TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- =============================================
-- Pipeline Files
-- =============================================
-- Reference files uploaded for a pipeline run.
CREATE TABLE pipeline_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_pipeline_runs_project_id ON pipeline_runs(project_id);
CREATE INDEX idx_pipeline_steps_run_id ON pipeline_steps(run_id);

-- =============================================
-- Row Level Security: pipeline_runs
-- =============================================
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Project members can see runs in their projects
CREATE POLICY "Project members see runs" ON pipeline_runs
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Project members can create runs (must set created_by to own uid)
CREATE POLICY "Project members create runs" ON pipeline_runs
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())
    AND project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- =============================================
-- Row Level Security: pipeline_steps
-- =============================================
ALTER TABLE pipeline_steps ENABLE ROW LEVEL SECURITY;

-- Project members can see steps via run's project membership
CREATE POLICY "Project members see steps" ON pipeline_steps
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

-- No INSERT/UPDATE policies for pipeline_steps:
-- Mutations are service-role only (Inngest functions use admin client)

-- =============================================
-- Row Level Security: pipeline_files
-- =============================================
ALTER TABLE pipeline_files ENABLE ROW LEVEL SECURITY;

-- Project members can see files via run's project membership
CREATE POLICY "Project members see files" ON pipeline_files
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

-- Project members can upload files for runs in their projects
CREATE POLICY "Project members upload files" ON pipeline_files
  FOR INSERT WITH CHECK (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );
