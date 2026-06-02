// Plan 04-05 Task 2 — Zapier-tools client for ClickUp task creation.
//
// Mirror of nxt-zap-client.ts pattern:
//   - loadTool with REGISTRY_CACHE_TTL_MS=60_000
//   - intent allowlist enforcement (default-deny)
//   - body_field auth (Catch-Hook-friendly)
//   - pattern='sync' (ClickUp create-task is synchronous; Zap returns task id directly)
//   - Fail-closed when target_url starts with 'TODO_' or auth_secret_env missing
//
// T-04-05-02 mitigation: NO @clickup/ imports, NO direct api.clickup.com fetch.
// All ClickUp interaction goes through the zapier_tools registry row.
//
// Used by clickup-escalate-handler.ts (intent='clickup-escalate') and
// vendor-draft-handler.ts PRIMARY-MODE (intent='clickup-escalate' — the only
// legitimate allowlist re-use, documented in vendor-draft-handler.ts).

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_ID = "clickup-create-task" as const;
const REGISTRY_CACHE_TTL_MS = 60_000;
const ZAP_POST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ZapierToolRow = {
  tool_id: string;
  backend: string;
  pattern: "sync" | "async_callback";
  target_url: string;
  auth_method: "body_field" | "header_bearer";
  auth_secret_env: string;
  auth_field_name: string;
  callback_route: string | null;
  enabled: boolean;
  allowed_for_intents: string[] | null;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the ClickUp Zap is not yet configured:
 *   - target_url still has the placeholder value ('TODO_...')
 *   - auth_secret_env is missing from process.env
 *
 * clickup-escalate-handler catches this and writes
 * decision='stage_4_clickup_escalate_zap_not_configured' WITHOUT any
 * Zapier call — this is the expected fail-closed path in dev/staging
 * until the operator configures the Zap (Phase 5 task).
 */
export class ClickupZapNotConfiguredError extends Error {
  constructor(
    public readonly reason: "placeholder_target_url" | "missing_auth_secret",
    public readonly tool_id: string,
  ) {
    super(
      reason === "placeholder_target_url"
        ? `ClickUp Zap target_url is still a placeholder for tool_id="${tool_id}" — configure via Zapier dashboard`
        : `ClickUp Zap auth secret env var for tool_id="${tool_id}" is not set`,
    );
    this.name = "ClickupZapNotConfiguredError";
  }
}

/**
 * Phase 64 BUDG-02 / D-06: default-deny intent allowlist breach.
 * Re-declared locally — do NOT import from nxt-zap-client to avoid
 * cross-package coupling. Same shape, fresh class.
 */
export class ToolNotAllowedForIntentError extends Error {
  constructor(
    public readonly tool_id: string,
    public readonly intent: string,
  ) {
    super(`Tool "${tool_id}" not allowed for intent "${intent}"`);
    this.name = "ToolNotAllowedForIntentError";
  }
}

// ---------------------------------------------------------------------------
// Registry cache
// ---------------------------------------------------------------------------

let cache: { fetched_at: number; tools: Map<string, ZapierToolRow> } | null =
  null;

/** Test-only: drop in-process registry cache so each test sees a fresh DB read. */
export function __resetClickupZapToolCacheForTests(): void {
  cache = null;
}

async function loadTool(tool_id: string): Promise<ZapierToolRow> {
  const now = Date.now();
  if (!cache || now - cache.fetched_at > REGISTRY_CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("zapier_tools")
      .select(
        "tool_id, backend, pattern, target_url, auth_method, auth_secret_env, auth_field_name, callback_route, enabled, allowed_for_intents",
      )
      .eq("enabled", true);
    if (error) {
      throw new Error(`zapier_tools registry read failed: ${error.message}`);
    }
    const map = new Map<string, ZapierToolRow>();
    for (const row of data ?? []) map.set(row.tool_id, row as ZapierToolRow);
    cache = { fetched_at: now, tools: map };
  }
  const tool = cache.tools.get(tool_id);
  if (!tool) {
    throw new Error(`zapier_tools: tool_id="${tool_id}" not found or disabled`);
  }
  return tool;
}

// ---------------------------------------------------------------------------
// Zod schema for Zap response
// ---------------------------------------------------------------------------

const zapResponseSchema = z.object({
  clickup_task_id: z.string().min(1),
  clickup_task_url: z.string().url(),
});

// ---------------------------------------------------------------------------
// callClickupCreateTask
// ---------------------------------------------------------------------------

export interface ClickupCreateTaskInput {
  /** ClickUp list ID from support_software_systems.clickup_list_id */
  list_id: string;
  /** ClickUp user ID from support_software_systems.default_assignee_user_id */
  assignee_user_id: string;
  /** Task name (e.g. "[iController] PDF export crash") */
  name: string;
  /** Full task body: AI summary + transcript + video URL + frame URLs + similar refs */
  description: string;
  /** submission_id passed as ClickUp custom_field for Zap-side dedup (T-04-05-01) */
  submission_id: string;
}

/**
 * POST to the Zapier catch-hook for clickup-create-task.
 *
 * Throws:
 *   - Error("zapier_tools: tool_id ... not found") — tool not in registry
 *   - ToolNotAllowedForIntentError — intent not in allowed_for_intents
 *   - ClickupZapNotConfiguredError (reason='placeholder_target_url') — Zap not configured yet
 *   - ClickupZapNotConfiguredError (reason='missing_auth_secret') — secret env var absent
 *   - Error("zapier_tools call clickup-create-task failed: HTTP N") — non-2xx response
 *   - Error("clickup create task: zap returned 200 but missing clickup_task_id") — bad 200 body
 *
 * @param input - Task creation input
 * @param intent - Caller's intent string; checked against allowed_for_intents
 */
/**
 * Pre-flight config probe — loads the tool row and throws ClickupZapNotConfiguredError
 * if the Zap is not ready (placeholder target_url or missing auth secret env var).
 *
 * Called by clickup-escalate-handler BEFORE the Orq AI summary call to avoid wasting
 * tokens when the Zap is not yet configured (T-04-05-08 + plan spec step 4).
 *
 * Does NOT perform any HTTP POST — purely a config validity check.
 */
export async function probeClickupZapConfig(): Promise<void> {
  const tool = await loadTool(TOOL_ID);

  if (tool.target_url.startsWith("TODO_")) {
    throw new ClickupZapNotConfiguredError("placeholder_target_url", TOOL_ID);
  }

  const secret = process.env[tool.auth_secret_env];
  if (!secret) {
    throw new ClickupZapNotConfiguredError("missing_auth_secret", TOOL_ID);
  }
}

export async function callClickupCreateTask(
  input: ClickupCreateTaskInput,
  intent: string,
): Promise<{ clickup_task_id: string; clickup_task_url: string }> {
  // 1. Load tool from registry (with cache)
  const tool = await loadTool(TOOL_ID);

  // 2. Intent allowlist check (default-deny — T-04-05-07)
  const allowed = tool.allowed_for_intents ?? [];
  if (allowed.length === 0 || !allowed.includes(intent)) {
    throw new ToolNotAllowedForIntentError(TOOL_ID, intent);
  }

  // 3. Fail-closed: target_url placeholder check (T-04-05-03 + T-04-05-08)
  // Pre-check BEFORE fetching auth secret so the not-configured error is clear.
  if (tool.target_url.startsWith("TODO_")) {
    throw new ClickupZapNotConfiguredError("placeholder_target_url", TOOL_ID);
  }

  // 4. Fail-closed: auth secret present check
  const secret = process.env[tool.auth_secret_env];
  if (!secret) {
    throw new ClickupZapNotConfiguredError("missing_auth_secret", TOOL_ID);
  }

  // 5. Build request body with body_field auth (Catch-Hook-friendly)
  const body: Record<string, unknown> = {
    list_id: input.list_id,
    assignee_user_id: input.assignee_user_id,
    name: input.name,
    description: input.description,
    submission_id: input.submission_id,
    // Zap-side dedup custom field (T-04-05-01 defense in depth)
    custom_fields: { submission_id: input.submission_id },
  };

  if (tool.auth_method === "body_field") {
    body[tool.auth_field_name] = secret;
  } else {
    body[tool.auth_field_name] = secret;
  }

  // 6. POST to Zap with 10s timeout (sync pattern — Zap returns task_id directly)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ZAP_POST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(tool.target_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(
      `zapier_tools call ${TOOL_ID} failed: HTTP ${res.status}`,
    );
  }

  // 7. Parse Zap response — Zap returns { clickup_task_id, clickup_task_url }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(
      "clickup create task: zap returned 200 but response body is not valid JSON",
    );
  }

  const safe = zapResponseSchema.safeParse(json);
  if (!safe.success) {
    throw new Error(
      "clickup create task: zap returned 200 but missing clickup_task_id",
    );
  }

  return { clickup_task_id: safe.data.clickup_task_id, clickup_task_url: safe.data.clickup_task_url };
}
