// Phase 56-00 + 56-01b registry refactor.
//
// Generic Zapier-tool client that resolves URL + auth from public.zapier_tools
// at runtime. Adding a new automation = INSERT a row in zapier_tools (no env
// var, no code change here, no Vercel deploy).
//
// Tools shipped today:
//   - nxt.contact_lookup      sync   sender_email -> top-level customer
//   - nxt.identifier_lookup   sync   invoice_numbers -> paying customer
//   - nxt.candidate_details   sync   customer_ids -> details for LLM tiebreaker
//
// Auth transport per tool:
//   - body_field   → secret injected as a body field (Catch-Hook-friendly)
//   - header_bearer → Authorization: Bearer <secret>
// The secret value is read from the env var named in tool.auth_secret_env.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const ZAP_TIMEOUT_MS = 25_000; // < 30s Zapier hard limit
const REGISTRY_CACHE_TTL_MS = 60_000; // mirrors classifier_rules cache cadence

type ZapierToolRow = {
  tool_id: string;
  backend: string;
  pattern: "sync" | "async_callback";
  target_url: string;
  auth_method: "body_field" | "header_bearer";
  auth_secret_env: string;
  auth_field_name: string;
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
        "tool_id, backend, pattern, target_url, auth_method, auth_secret_env, auth_field_name, enabled",
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

// Per-tool input shapes (Vercel side — what callers pass)
export type ContactLookupInput = {
  nxt_database: string;
  sender_email: string;
};
export type IdentifierLookupInput = {
  nxt_database: string;
  invoice_numbers: string[];
};
export type CandidateDetailsInput = {
  nxt_database: string;
  customer_ids: string[];
};

// Output shape mirrors the Zap's Custom Response: `{ matches: [...] }`
const ContactMatchSchema = z.object({
  contact_id: z.string(),
  top_level_customer_id: z.string(),
  top_level_customer_name: z.string(),
  brand_id: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  depth: z.number().int().nonnegative(),
});

const IdentifierMatchSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  customer_id: z.string(),
  top_level_customer_id: z.string(),
  site_id: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
  invoice_date: z.string(),
  status: z.string(),
});

const CandidateDetailMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  brand_id: z.string().nullable().optional(),
  country_id: z.string().nullable().optional(),
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

/**
 * Generic synchronous Zapier-tool call. Resolves the tool from
 * public.zapier_tools, formats the auth per `auth_method`, POSTs, validates
 * response shape against the tool-specific Zod schema.
 *
 * For each NXT tool we pass the body via `wrappedBody` so the Zap sees
 * `auth`, `tool_id`, and the inline lookup_kind+payload it already expects.
 *
 * Throws on:
 *   - tool not in registry
 *   - secret env var missing
 *   - timeout (>25s)
 *   - non-2xx response
 *   - response body that fails Zod parse
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
  const tool = await loadTool(tool_id);
  const secret = process.env[tool.auth_secret_env];
  if (!secret) {
    throw new Error(
      `zapier_tools: env var "${tool.auth_secret_env}" (auth secret for ${tool_id}) is empty`,
    );
  }

  // Map tool_id → lookup_kind expected inside the Zap body. The registry
  // doesn't model this 1:1 because future tools may be in their own Zap.
  // For the current "NXT generic-lookup" Zap, all 3 tools route there with
  // a lookup_kind discriminator.
  const lookupKind: Record<NxtToolId, string> = {
    "nxt.contact_lookup": "sender_to_account",
    "nxt.identifier_lookup": "identifier_to_account",
    "nxt.candidate_details": "candidate_details",
  };

  // Strip nxt_database out of the per-tool input so it sits at the body
  // top level (the Zap whitelist filter reads it from there).
  const { nxt_database, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };

  const body: Record<string, unknown> = {
    nxt_database,
    lookup_kind: lookupKind[tool_id],
    tool_id,
    payload,
    request_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (tool.auth_method === "body_field") {
    body[tool.auth_field_name] = secret;
  } else {
    headers[tool.auth_field_name.toLowerCase() === "authorization" ? "authorization" : tool.auth_field_name] =
      `Bearer ${secret}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ZAP_TIMEOUT_MS);
  try {
    const res = await fetch(tool.target_url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`zapier_tools call ${tool_id} failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    const schema = ResponseSchemaByTool[tool_id];
    return schema.parse(json) as z.infer<(typeof ResponseSchemaByTool)[T]>;
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience wrappers — clearer at call sites in the resolver pipeline. */
export const lookupSenderToAccount = (input: ContactLookupInput) =>
  callNxtTool("nxt.contact_lookup", input);

export const lookupIdentifierToAccount = (input: IdentifierLookupInput) =>
  callNxtTool("nxt.identifier_lookup", input);

export const lookupCandidateDetails = (input: CandidateDetailsInput) =>
  callNxtTool("nxt.candidate_details", input);
