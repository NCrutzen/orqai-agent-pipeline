// Plan 04-07 (rework of Plan 04-05 Task 2) — Zapier-tools client for ClickUp task creation.
//
// Reworked from `sync` to `async_callback` pattern — mirrors nxt-zap-client.ts exactly.
//
// WHY: a Zapier Catch Hook CANNOT return a synchronous custom response (verified in
// nxt-zap-client.ts:3 + every working nxt.* tool uses async_callback). The original
// `sync` implementation parsed { clickup_task_id, clickup_task_url } from the POST
// response — which will never arrive. Mocked tests hid this. This blocked Phase 4 (04-06)
// + Phase 5 (05-05) live smokes.
//
// Async-callback flow:
//   1. Insert pending row in public.support_clickup_create_requests.
//   2. POST the Zap with { requestId, callback_url, ...payload, auth }.
//   3. Wait via Supabase Realtime UPDATE on the row (~50s timeout).
//   4. Zap's terminal POST step calls
//      /api/automations/support-tickets/clickup-create/callback,
//      which UPDATEs status='done' with clickup_task_id + clickup_task_url.
//
// Auth: body_field (Catch-Hook-friendly — headers aren't reliably exposed).
//
// T-04-05-02 mitigation: NO @clickup/ imports, NO direct api.clickup.com fetch.
// All ClickUp interaction goes through the zapier_tools registry row.
//
// Used by clickup-escalate-handler.ts (intent='clickup-escalate') and
// vendor-draft-handler.ts PRIMARY-MODE (intent='clickup-escalate' — the only
// legitimate allowlist re-use, documented in vendor-draft-handler.ts).

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_ID = "clickup-create-task" as const;
const REGISTRY_CACHE_TTL_MS = 60_000;
const ZAP_POST_TIMEOUT_MS = 10_000; // POST→Zap ack only; the Zap itself is async.
const WAIT_TIMEOUT_MS = 50_000;     // Wait for Zap terminal callback via Realtime.


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

type ClickupCreateRequestRow = {
  id: string;
  status: "pending" | "done" | "error";
  clickup_task_id: string | null;
  clickup_task_url: string | null;
  error: string | null;
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
// Zod schema for callback row validation
// ---------------------------------------------------------------------------

const zapResponseSchema = z.object({
  clickup_task_id: z.string().min(1),
  clickup_task_url: z.string().url(),
});

// ---------------------------------------------------------------------------
// Input type
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

// ---------------------------------------------------------------------------
// probeClickupZapConfig
// ---------------------------------------------------------------------------

/**
 * Pre-flight config probe — loads the tool row and throws ClickupZapNotConfiguredError
 * if the Zap is not ready (placeholder target_url or missing auth secret env var).
 *
 * Called by clickup-escalate-handler BEFORE the Orq AI summary call to avoid wasting
 * tokens when the Zap is not yet configured (T-04-05-08 + plan spec step 4).
 *
 * Does NOT perform any HTTP POST or DB insert — purely a config validity check.
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

// ---------------------------------------------------------------------------
// callClickupCreateTask
// ---------------------------------------------------------------------------

/**
 * Async-callback Zapier-tool call for ClickUp task creation.
 *
 * Preserved signature: (input: ClickupCreateTaskInput, intent: string) => Promise<{clickup_task_id, clickup_task_url}>
 *
 * Throws:
 *   - Error("zapier_tools: tool_id ... not found") — tool not in registry
 *   - ToolNotAllowedForIntentError — intent not in allowed_for_intents
 *   - ClickupZapNotConfiguredError (reason='placeholder_target_url') — Zap not configured
 *   - ClickupZapNotConfiguredError (reason='missing_auth_secret') — secret env var absent
 *   - Error("NEXT_PUBLIC_APP_URL is not set") — callback_url cannot be built
 *   - Error("zapier_tools call clickup-create-task failed: HTTP N") — non-2xx ack
 *   - Error("clickup create task timed out ...") — Realtime wait exceeded 50s
 *   - Error("clickup create task: zap returned 200 but missing clickup_task_id") — bad result shape
 *
 * @param input - Task creation input
 * @param intent - Caller's intent string; checked against allowed_for_intents
 */
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
  if (tool.target_url.startsWith("TODO_")) {
    throw new ClickupZapNotConfiguredError("placeholder_target_url", TOOL_ID);
  }

  // 4. Fail-closed: auth secret present check
  const secret = process.env[tool.auth_secret_env];
  if (!secret) {
    throw new ClickupZapNotConfiguredError("missing_auth_secret", TOOL_ID);
  }

  // 5. async_callback validation (pattern + callback_route + APP_URL)
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set — cannot build callback_url");
  }
  if (tool.pattern !== "async_callback") {
    throw new Error(
      `zapier_tools: tool "${TOOL_ID}" pattern=${tool.pattern}, expected async_callback`,
    );
  }
  if (!tool.callback_route) {
    throw new Error(`zapier_tools: tool "${TOOL_ID}" missing callback_route`);
  }

  // 6. Generate requestId + insert pending tracking row
  const requestId = randomUUID();
  const admin = createAdminClient();

  const { error: insertErr } = await admin
    .from("support_clickup_create_requests")
    .insert({
      id: requestId,
      submission_id: input.submission_id,
      status: "pending",
      payload: {
        list_id: input.list_id,
        assignee_user_id: input.assignee_user_id,
        name: input.name,
        submission_id: input.submission_id,
      },
    });

  if (insertErr) {
    throw new Error(`support_clickup_create_requests insert failed: ${insertErr.message}`);
  }

  const callbackUrl = `${APP_URL.replace(/\/$/, "")}${tool.callback_route}`;

  // 7. Build POST body with body_field auth (Catch-Hook-friendly — T-04-05-02)
  const body: Record<string, unknown> = {
    requestId,
    callback_url: callbackUrl,
    list_id: input.list_id,
    assignee_user_id: input.assignee_user_id,
    name: input.name,
    description: input.description,
    submission_id: input.submission_id,
    // Zap-side dedup custom field (T-04-05-01 defense in depth)
    custom_fields: { submission_id: input.submission_id },
    timestamp: new Date().toISOString(),
  };

  // body_field auth (Catch-Hook-friendly)
  body[tool.auth_field_name] = secret;

  // 8. POST to Zap. Short timeout — this is just the 200 ack.
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
    throw new Error(`zapier_tools call ${TOOL_ID} failed: HTTP ${res.status}`);
  }

  // 9. Wait for callback via Realtime.
  const row = await waitForClickupCreateRequest(requestId, WAIT_TIMEOUT_MS);
  if (row === null) {
    throw new Error(
      `clickup create task timed out after ${WAIT_TIMEOUT_MS}ms (request_id=${requestId})`,
    );
  }

  // 10. Validate callback row shape
  const safe = zapResponseSchema.safeParse({
    clickup_task_id: row.clickup_task_id,
    clickup_task_url: row.clickup_task_url,
  });
  if (!safe.success) {
    throw new Error(
      "clickup create task: zap returned 200 but missing clickup_task_id",
    );
  }

  return {
    clickup_task_id: safe.data.clickup_task_id,
    clickup_task_url: safe.data.clickup_task_url,
  };
}

// ---------------------------------------------------------------------------
// waitForClickupCreateRequest
// ---------------------------------------------------------------------------

/**
 * Wait for a public.support_clickup_create_requests row to leave 'pending'.
 * Mirrors waitForLookupRequest in nxt-zap-client.ts.
 */
async function waitForClickupCreateRequest(
  requestId: string,
  timeoutMs: number,
): Promise<ClickupCreateRequestRow | null> {
  const admin = createAdminClient();

  return new Promise<ClickupCreateRequestRow | null>((resolve, reject) => {
    let settled = false;
    let channel: RealtimeChannel | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (channel) admin.removeChannel(channel).catch(() => null);
    };

    const finish = (
      outcome:
        | { kind: "ok"; value: ClickupCreateRequestRow | null }
        | { kind: "err"; error: Error },
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome.kind === "ok") resolve(outcome.value);
      else reject(outcome.error);
    };

    channel = admin
      .channel(`support_clickup_create_req:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_clickup_create_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload: RealtimePostgresChangesPayload<ClickupCreateRequestRow>) => {
          const row = payload.new as ClickupCreateRequestRow | undefined;
          if (!row) return;
          if (row.status === "done") {
            finish({ kind: "ok", value: row });
          } else if (row.status === "error") {
            finish({
              kind: "err",
              error: new Error(row.error ?? "clickup create task failed"),
            });
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        // Race guard: the callback may have arrived before we subscribed.
        const { data, error } = await admin
          .from("support_clickup_create_requests")
          .select("id, status, clickup_task_id, clickup_task_url, error")
          .eq("id", requestId)
          .maybeSingle();

        if (error) {
          finish({
            kind: "err",
            error: new Error(`support_clickup_create_requests poll failed: ${error.message}`),
          });
          return;
        }
        if (!data) return;
        const row = data as ClickupCreateRequestRow;
        if (row.status === "done") {
          finish({ kind: "ok", value: row });
        } else if (row.status === "error") {
          finish({ kind: "err", error: new Error(row.error ?? "clickup create task failed") });
        }
      });

    timeoutId = setTimeout(() => finish({ kind: "ok", value: null }), timeoutMs);
  });
}
