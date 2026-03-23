-- =============================================
-- Migration: Chat Messages for Conversational Pipeline (Phase 37.1)
-- =============================================
-- Stores assistant and user chat messages for conversational pipeline stages.
-- Depends on: pipeline_runs table from schema-pipeline.sql

CREATE TABLE pipeline_chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  content      TEXT NOT NULL,
  stage_name   TEXT,
  turn_index   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_run_id ON pipeline_chat_messages(run_id);

ALTER TABLE pipeline_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members see chat messages" ON pipeline_chat_messages
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );
