-- =============================================
-- Migration: Add environment column to systems and credentials
-- Purpose: Enable test-first automation pattern by distinguishing
--          production/acceptance/test environments per system and credential
-- =============================================

-- 0. Deduplicate systems table (keep newest row per name)
DELETE FROM systems
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM systems
  ORDER BY name, created_at DESC
);

-- 1. Add environment column to systems table
ALTER TABLE systems
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'acceptance', 'test'));

-- 2. Add environment column to credentials table
ALTER TABLE credentials
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'acceptance', 'test'));

-- 3. Unique constraint: one row per system name + environment
CREATE UNIQUE INDEX idx_systems_name_environment ON systems(name, environment);

-- 4. Composite index for fast credential lookups by name + environment
CREATE INDEX idx_credentials_name_environment ON credentials(name, environment);
