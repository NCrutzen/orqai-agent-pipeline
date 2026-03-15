-- =============================================
-- Database Schema: Foundation & Auth (Phase 34)
-- =============================================
-- Execute this in the Supabase SQL Editor.

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Project members junction table (composite PK)
CREATE TABLE project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- Index for RLS performance (critical -- avoids per-row evaluation in membership checks)
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies for projects
-- =============================================

-- Users can only see projects they are a member of
CREATE POLICY "Users see own projects" ON projects
  FOR SELECT USING (
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Authenticated users can create projects (creator must match auth user)
CREATE POLICY "Authenticated users can create projects" ON projects
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

-- Project creators can update their projects
CREATE POLICY "Project creators can update projects" ON projects
  FOR UPDATE USING (
    created_by = (SELECT auth.uid())
  );

-- =============================================
-- RLS Policies for project_members
-- =============================================

-- Members can see other members in their projects
CREATE POLICY "Members see project members" ON project_members
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Any member can add new members to their projects (PROJ-04: all members have equal access)
CREATE POLICY "Members can add members" ON project_members
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
    )
    OR
    -- Project creators can always add members (needed for first member addition)
    project_id IN (
      SELECT id FROM projects
      WHERE created_by = (SELECT auth.uid())
    )
  );

-- =============================================
-- Auto-add creator as first project member
-- =============================================
CREATE OR REPLACE FUNCTION add_creator_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id)
  VALUES (NEW.id, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_created
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_as_member();

-- =============================================
-- Auto-update updated_at timestamp
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_project_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
