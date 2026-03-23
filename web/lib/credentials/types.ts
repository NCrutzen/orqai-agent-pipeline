// Credential status values matching DB CHECK constraint
export type CredentialStatus = "not_tested" | "active" | "needs_rotation" | "failed";

// Auth profile type IDs matching DB auth_profile_types.id
export type AuthProfileTypeId =
  | "username_password"
  | "sso_token"
  | "api_key"
  | "certificate"
  | "totp"
  | "custom";

// Field definition within an auth profile type
export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "secret";
  required: boolean;
}

// Schema defining what fields an auth type requires
export interface CredentialFieldSchema {
  fields: CredentialField[];
  allow_custom_fields?: boolean;
}

// Auth profile type (mirrors auth_profile_types table)
export interface AuthProfileType {
  id: AuthProfileTypeId;
  name: string;
  description: string;
  field_schema: CredentialFieldSchema;
  created_at: string;
}

// Credential (mirrors credentials table, WITHOUT encrypted_values)
export interface Credential {
  id: string;
  name: string;
  auth_type: AuthProfileTypeId;
  status: CredentialStatus;
  failed_at: string | null;
  key_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Credential with linked project count (for list display)
export interface CredentialWithLinks extends Credential {
  linked_project_count: number;
}

// Credential-project link
export interface CredentialProjectLink {
  credential_id: string;
  project_id: string;
  linked_at: string;
}

// Health check service status
export type HealthServiceStatus = "connected" | "degraded" | "unreachable" | "checking";

// Individual service health result
export interface ServiceHealthResult {
  status: HealthServiceStatus;
  latencyMs?: number;
  error?: string;
}

// Full health check result (mirrors health_checks table)
export interface HealthCheckResult {
  id: string;
  browserless: ServiceHealthResult;
  storage: ServiceHealthResult;
  mcp: ServiceHealthResult;
  checked_at: string;
  checked_by: string | null;
}

// Health update broadcast payload
export interface HealthUpdatePayload {
  browserless: ServiceHealthResult;
  storage: ServiceHealthResult;
  mcp: ServiceHealthResult;
  checked_at: string;
}

// Create credential request body
export interface CreateCredentialRequest {
  name: string;
  authType: AuthProfileTypeId;
  values: Record<string, string>;
  projectIds?: string[];
}

// Replace credential request body
export interface ReplaceCredentialRequest {
  values: Record<string, string>;
}
