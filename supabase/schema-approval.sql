-- =============================================
-- Database Schema: HITL Approval (Phase 37)
-- =============================================
-- Execute this in the Supabase SQL Editor AFTER schema-pipeline.sql.
-- Depends on: pipeline_runs, project_members tables

-- Add "waiting" to pipeline_runs status CHECK constraint
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_status_check
  CHECK (status IN ('pending', 'running', 'complete', 'failed', 'waiting'));

-- Add "waiting" to pipeline_steps status CHECK constraint
ALTER TABLE pipeline_steps DROP CONSTRAINT IF EXISTS pipeline_steps_status_check;
ALTER TABLE pipeline_steps ADD CONSTRAINT pipeline_steps_status_check
  CHECK (status IN ('pending', 'running', 'complete', 'failed', 'skipped', 'waiting'));

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  step_name TEXT NOT NULL,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_requests_run_id ON approval_requests(run_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status)
  WHERE status = 'pending';

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members see approvals" ON approval_requests
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );
-- No INSERT/UPDATE policies for client: all writes via admin client (server actions)
