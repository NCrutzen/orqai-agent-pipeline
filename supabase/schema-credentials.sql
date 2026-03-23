-- =============================================
-- Database Schema: Credential Vault & Infrastructure (Phase 39)
-- =============================================
-- Execute AFTER schema.sql, schema-pipeline.sql, and schema-approval.sql
-- Depends on: projects, auth.users, update_updated_at() function from schema.sql

-- =============================================
-- Auth Profile Types (template definitions)
-- =============================================
-- Defines what fields each auth type requires.
-- TEXT primary key (not UUID) for readable type IDs.
CREATE TABLE auth_profile_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  field_schema JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Credentials (encrypted secret storage)
-- =============================================
-- Stores encrypted credential values with AES-256-GCM.
-- encrypted_values format: iv:tag:ciphertext (base64-encoded)
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  auth_type TEXT NOT NULL REFERENCES auth_profile_types(id),
  encrypted_values TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_tested'
    CHECK (status IN ('not_tested', 'active', 'needs_rotation', 'failed')),
  failed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Credential-Project Links (many-to-many)
-- =============================================
-- Links credentials to projects. A credential can be used by multiple projects.
CREATE TABLE credential_project_links (
  credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (credential_id, project_id)
);

-- =============================================
-- Health Checks (singleton pattern)
-- =============================================
-- Single row storing latest health check results for all services.
-- TEXT PK defaults to 'latest' to enforce singleton.
CREATE TABLE health_checks (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  browserless JSONB NOT NULL DEFAULT '{"status": "checking"}',
  storage JSONB NOT NULL DEFAULT '{"status": "checking"}',
  mcp JSONB NOT NULL DEFAULT '{"status": "checking"}',
  checked_at TIMESTAMPTZ DEFAULT now(),
  checked_by UUID REFERENCES auth.users(id)
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_credentials_created_by ON credentials(created_by);

-- Partial index: only index credentials needing attention
CREATE INDEX idx_credentials_status ON credentials(status)
  WHERE status IN ('needs_rotation', 'failed');

CREATE INDEX idx_credential_project_links_project ON credential_project_links(project_id);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE auth_profile_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

-- Auth profile types: readable by all authenticated users
CREATE POLICY "Authenticated users see auth profile types" ON auth_profile_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Credentials: users see only their own credentials
CREATE POLICY "Users see own credentials" ON credentials
  FOR SELECT USING (created_by = (SELECT auth.uid()));

-- Credentials: users can create credentials (must be the creator)
CREATE POLICY "Users create credentials" ON credentials
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

-- No UPDATE/DELETE client policies -- admin client handles mutations
-- (status changes, credential replacement, deletion all via server actions)

-- Credential-project links: visible to credential owners OR project members
CREATE POLICY "Credential owners see links" ON credential_project_links
  FOR SELECT USING (
    credential_id IN (
      SELECT id FROM credentials WHERE created_by = (SELECT auth.uid())
    )
    OR
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Credential-project links: insert only by credential owners
CREATE POLICY "Credential owners create links" ON credential_project_links
  FOR INSERT WITH CHECK (
    credential_id IN (
      SELECT id FROM credentials WHERE created_by = (SELECT auth.uid())
    )
  );

-- Health checks: visible to all authenticated users (admin gating is UI-level)
CREATE POLICY "Authenticated users see health checks" ON health_checks
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Health check writes via admin client only (Inngest function)

-- =============================================
-- Trigger: auto-update updated_at on credentials
-- =============================================
-- Reuses the update_updated_at() function from schema.sql
CREATE TRIGGER on_credential_updated
  BEFORE UPDATE ON credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Seed: Auth Profile Types
-- =============================================
INSERT INTO auth_profile_types (id, name, description, field_schema) VALUES
  (
    'username_password',
    'Username + Password',
    'Standard username and password login',
    '{
      "fields": [
        {"key": "username", "label": "Username", "type": "text", "required": true},
        {"key": "password", "label": "Password", "type": "secret", "required": true}
      ]
    }'::jsonb
  ),
  (
    'sso_token',
    'SSO / Azure AD Token',
    'Single sign-on bearer token',
    '{
      "fields": [
        {"key": "token", "label": "SSO Token", "type": "secret", "required": true}
      ]
    }'::jsonb
  ),
  (
    'api_key',
    'API Key / Bearer Token',
    'API key or bearer token authentication',
    '{
      "fields": [
        {"key": "api_key", "label": "API Key", "type": "secret", "required": true}
      ]
    }'::jsonb
  ),
  (
    'certificate',
    'Client Certificate / mTLS',
    'Certificate-based mutual TLS authentication',
    '{
      "fields": [
        {"key": "certificate", "label": "Certificate (PEM)", "type": "secret", "required": true},
        {"key": "private_key", "label": "Private Key (PEM)", "type": "secret", "required": true},
        {"key": "passphrase", "label": "Passphrase", "type": "secret", "required": false}
      ]
    }'::jsonb
  ),
  (
    'totp',
    'TOTP (2FA)',
    'Time-based one-time password for two-factor authentication',
    '{
      "fields": [
        {"key": "totp_secret", "label": "TOTP Secret Key", "type": "secret", "required": true}
      ]
    }'::jsonb
  ),
  (
    'custom',
    'Custom',
    'Define custom key-value credential fields',
    '{
      "fields": [],
      "allow_custom_fields": true
    }'::jsonb
  );
