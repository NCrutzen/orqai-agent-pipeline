// Phase 56-02 (revised 2026-04-29): async-callback client.
//
// Zapier Catch Hook cannot return a Custom Response — verified via Zapier
// community + product docs. So all 3 NXT lookup tools follow the same
// async-callback pattern as nxt.invoice_fetch:
//
//   1. Insert pending row in debtor.nxt_lookup_requests.
//   2. POST the Zap with { requestId, callback_url, secret, ...payload }.
//   3. Wait via Supabase Realtime UPDATE on the row.
//   4. Zap's terminal POST step calls /api/automations/debtor/nxt-lookup/callback,
//      which UPDATEs status='complete' with the SQL matches array.
//
// Tools:
//   - nxt.contact_lookup       sender_email -> top-level customer
//   - nxt.identifier_lookup    invoice_numbers -> paying customer
//   - nxt.candidate_details    customer_ids -> details for LLM tiebreaker
//
// Auth: `auth_secret_env` env var, injected as a body field per
// `auth_field_name` (Catch-Hook-friendly — headers aren't reliably exposed
// in Zapier's field picker).

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const ZAP_POST_TIMEOUT_MS = 10_000; // POST→Zap ack only; the Zap itself is async.
const WAIT_TIMEOUT_MS = 20_000; // Tight enough to avoid label-email blocking; relies on
// Zapier's Find Multiple Rows configured with success_on_miss=true so callbacks fire
// even on 0 matches. If Zap halts on miss the wait still bounds at 20s.
const REGISTRY_CACHE_TTL_MS = 60_000;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

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
};

let cache: { fetched_at: number; tools: Map<string, ZapierToolRow> } | null =
  null;

async function loadTool(tool_id: string): Promise<ZapierToolRow> {
  const now = Date.now();
  if (!cache || now - cache.fetched_at > REGISTRY_CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("zapier_tools")
      .select(
        "tool_id, backend, pattern, target_url, auth_method, auth_secret_env, auth_field_name, callback_route, enabled",
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

export type NxtToolId =
  | "nxt.contact_lookup"
  | "nxt.identifier_lookup"
  | "nxt.candidate_details";

export type ContactLookupInput = {
  nxt_database: string;
  brand_id: string;
  sender_email: string;
};
export type IdentifierLookupInput = {
  nxt_database: string;
  brand_id: string;
  invoice_numbers: string[];
};
export type CandidateDetailsInput = {
  nxt_database: string;
  brand_id: string;
  customer_ids: string[];
};

const BRAND_ID_RE = /^[A-Z]{2}$/;

const ContactMatchSchema = z.object({
  contact_id: z.union([z.string(), z.number()]).transform(String),
  top_level_customer_id: z.union([z.string(), z.number()]).transform(String),
  top_level_customer_name: z.string(),
  brand_id: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? v : String(v))),
  status: z.string().nullable().optional(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  depth: z.number().int().nonnegative(),
});

const IdentifierMatchSchema = z.object({
  invoice_id: z.union([z.string(), z.number()]).transform(String),
  invoice_number: z.union([z.string(), z.number()]).transform(String),
  customer_id: z.union([z.string(), z.number()]).transform(String),
  top_level_customer_id: z.union([z.string(), z.number()]).transform(String),
  site_id: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? v : String(v))),
  job_id: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? v : String(v))),
  invoice_date: z.string(),
  status: z.string(),
});

const CandidateDetailMatchSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  status: z.string(),
  brand_id: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? v : String(v))),
  country_id: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? v : String(v))),
  city: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  modified_on: z.string(),
});

const ResponseSchemaByTool = {
  "nxt.contact_lookup": z.object({ matches: z.array(ContactMatchSchema) }),
  "nxt.identifier_lookup": z.object({ matches: z.array(IdentifierMatchSchema) }),
  "nxt.candidate_details": z.object({ matches: z.array(CandidateDetailMatchSchema) }),
} as const;

export type ContactMatch = z.infer<typeof ContactMatchSchema>;
export type IdentifierMatch = z.infer<typeof IdentifierMatchSchema>;
export type CandidateDetail = z.infer<typeof CandidateDetailMatchSchema>;

const LookupKindByTool: Record<NxtToolId, string> = {
  "nxt.contact_lookup": "sender_to_account",
  "nxt.identifier_lookup": "identifier_to_account",
  "nxt.candidate_details": "candidate_details",
};

type LookupRequestRow = {
  id: string;
  status: "pending" | "complete" | "failed";
  result: { matches?: unknown } | null;
  error: string | null;
};

/**
 * Async-callback Zapier-tool call.
 *
 * Throws on:
 *   - tool not in registry / disabled
 *   - tool.pattern != 'async_callback' or callback_route missing
 *   - secret env / NEXT_PUBLIC_APP_URL missing
 *   - row insert failure
 *   - Zap POST non-2xx (the ack, not the actual result)
 *   - timeout (50s) — surfaces as Error("nxt lookup timed out")
 *   - response shape that fails Zod parse
 */
export async function callNxtTool<T extends NxtToolId>(
  tool_id: T,
  input: T extends "nxt.contact_lookup"
    ? ContactLookupInput
    : T extends "nxt.identifier_lookup"
      ? IdentifierLookupInput
      : T extends "nxt.candidate_details"
        ? CandidateDetailsInput
        : never,
): Promise<z.infer<(typeof ResponseSchemaByTool)[T]>> {
  if (!APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set — cannot build callback_url");
  }

  const tool = await loadTool(tool_id);

  if (tool.pattern !== "async_callback") {
    throw new Error(
      `zapier_tools: tool "${tool_id}" pattern=${tool.pattern}, expected async_callback`,
    );
  }
  if (!tool.callback_route) {
    throw new Error(`zapier_tools: tool "${tool_id}" missing callback_route`);
  }

  const secret = process.env[tool.auth_secret_env];
  if (!secret) {
    throw new Error(
      `zapier_tools: env var "${tool.auth_secret_env}" (auth secret for ${tool_id}) is empty`,
    );
  }

  const requestId = randomUUID();
  const lookup_kind = LookupKindByTool[tool_id];
  const { nxt_database, brand_id, ...payloadRest } = input;
  if (!BRAND_ID_RE.test(brand_id)) {
    throw new Error(
      `nxt lookup ${tool_id}: brand_id "${brand_id}" must match ^[A-Z]{2}$`,
    );
  }
  const payload: Record<string, unknown> = { ...payloadRest };

  const admin = createAdminClient();

  // 1. Insert pending row.
  const insertErr = await admin
    .schema("debtor")
    .from("nxt_lookup_requests")
    .insert({
      id: requestId,
      tool_id,
      lookup_kind,
      nxt_database,
      payload: { ...payload, brand_id },
      status: "pending",
    })
    .then(
      ({ error }) => error,
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    );

  if (insertErr) {
    throw new Error(`nxt_lookup_requests insert failed: ${insertErr.message}`);
  }

  const callbackUrl = `${APP_URL.replace(/\/$/, "")}${tool.callback_route}`;

  const body: Record<string, unknown> = {
    requestId,
    callback_url: callbackUrl,
    nxt_database,
    brand_id,
    lookup_kind,
    tool_id,
    payload,
    timestamp: new Date().toISOString(),
  };

  // body_field auth (Catch-Hook-friendly).
  if (tool.auth_method === "body_field") {
    body[tool.auth_field_name] = secret;
  } else {
    // header_bearer fallback. Same auth value, different transport.
    // (None of the 3 lookup tools use this today.)
    body[tool.auth_field_name] = secret;
  }

  // 2. POST to Zap. Short timeout — this is just the 200 ack.
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
    throw new Error(`zapier_tools call ${tool_id} failed: HTTP ${res.status}`);
  }

  // 3. Wait for callback via Realtime.
  const result = await waitForLookupRequest(requestId, WAIT_TIMEOUT_MS);
  if (result === null) {
    throw new Error(`nxt lookup timed out after ${WAIT_TIMEOUT_MS}ms (request_id=${requestId})`);
  }

  const matches = Array.isArray(result.matches) ? result.matches : [];
  const schema = ResponseSchemaByTool[tool_id];
  return schema.parse({ matches }) as z.infer<(typeof ResponseSchemaByTool)[T]>;
}

/**
 * Wait for a debtor.nxt_lookup_requests row to leave 'pending'.
 * Mirrors waitForFetchRequest in fetch-document.ts.
 */
async function waitForLookupRequest(
  requestId: string,
  timeoutMs: number,
): Promise<{ matches?: unknown } | null> {
  const admin = createAdminClient();

  return new Promise<{ matches?: unknown } | null>((resolve, reject) => {
    let settled = false;
    let channel: RealtimeChannel | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (channel) admin.removeChannel(channel).catch(() => null);
    };

    const finish = (
      outcome:
        | { kind: "ok"; value: { matches?: unknown } | null }
        | { kind: "err"; error: Error },
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome.kind === "ok") resolve(outcome.value);
      else reject(outcome.error);
    };

    channel = admin
      .channel(`nxt_lookup_req:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "debtor",
          table: "nxt_lookup_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload: RealtimePostgresChangesPayload<LookupRequestRow>) => {
          const row = payload.new as LookupRequestRow | undefined;
          if (!row) return;
          if (row.status === "complete") {
            finish({ kind: "ok", value: row.result ?? {} });
          } else if (row.status === "failed") {
            finish({
              kind: "err",
              error: new Error(row.error ?? "nxt lookup failed"),
            });
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        // Race guard.
        const { data, error } = await admin
          .schema("debtor")
          .from("nxt_lookup_requests")
          .select("id, status, result, error")
          .eq("id", requestId)
          .maybeSingle();

        if (error) {
          finish({ kind: "err", error: new Error(`nxt_lookup_requests lookup failed: ${error.message}`) });
          return;
        }
        if (!data) return;
        const row = data as LookupRequestRow;
        if (row.status === "complete") {
          finish({ kind: "ok", value: row.result ?? {} });
        } else if (row.status === "failed") {
          finish({ kind: "err", error: new Error(row.error ?? "nxt lookup failed") });
        }
      });

    timeoutId = setTimeout(() => finish({ kind: "ok", value: null }), timeoutMs);
  });
}

export const lookupSenderToAccount = (input: ContactLookupInput) =>
  callNxtTool("nxt.contact_lookup", input);

export const lookupIdentifierToAccount = (input: IdentifierLookupInput) =>
  callNxtTool("nxt.identifier_lookup", input);

export const lookupCandidateDetails = (input: CandidateDetailsInput) =>
  callNxtTool("nxt.candidate_details", input);
