-- Consolidate automation_projects into projects table
-- automation_projects is deprecated after this migration
-- EXECUTED: 2026-04-15

-- Step 1: Add missing columns from automation_projects to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS systems text[] DEFAULT ARRAY[]::text[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_url text;

-- Step 2: Migrate automation_projects data into projects
-- Map type values: zapier → zapier-only, standalone → standalone-app, agent → orqai-agent
INSERT INTO projects (name, description, status, automation_type, systems, github_url, created_by, created_at, updated_at)
SELECT
  ap.name,
  ap.description,
  ap.status,
  CASE ap.type
    WHEN 'zapier' THEN 'zapier-only'
    WHEN 'hybrid' THEN 'hybrid'
    WHEN 'standalone' THEN 'standalone-app'
    WHEN 'agent' THEN 'orqai-agent'
    ELSE 'unknown'
  END,
  ap.systems,
  ap.github_url,
  '0f918892-129f-453b-9048-f53c3436fc4e'::uuid,  -- default user
  ap.created_at,
  ap.updated_at
FROM automation_projects ap
WHERE NOT EXISTS (
  SELECT 1 FROM projects p WHERE lower(p.name) = lower(ap.name)
);

-- Step 3: Mark automation_projects as deprecated
COMMENT ON TABLE automation_projects IS 'DEPRECATED — use projects table instead. Do not insert new rows.';
