/**
 * Phase 82.5 Plan 01 — operator_id → display_name resolver.
 *
 * Given a list of operator UUIDs, returns a Record<string, string> mapping
 * each id to the email local-part (everything before `@`) of the matching
 * `auth.users` row. Falls back to `id.slice(0, 8)` when the email is null
 * or contains no `@`.
 *
 * Privacy posture (CONTEXT D-3): the raw `auth.users` rows never leave this
 * function. Only the local-part Record crosses out. Callers MUST be
 * server-side and MUST pass a service-role admin client — `auth.users`
 * lives in the `auth` schema and is denied to anon/authenticated by RLS.
 *
 * Threat-model anchor: T-82.5.01-03 (info disclosure on operator identity)
 * mitigated by this server-only boundary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadOperatorDisplayMap(
  admin: SupabaseClient,
  operatorIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (operatorIds.length === 0) return out;

  // Dedup to keep the IN list small (CONTEXT assumption: <20 distinct ops).
  const unique = Array.from(new Set(operatorIds));

  // auth.users lives in the `auth` schema — service-role required (D-3).
  const { data, error } = await admin
    .schema("auth")
    .from("users")
    .select("id, email")
    .in("id", unique);

  if (error) {
    // Defensive: surface fallback shape for all ids so callers don't crash.
    for (const id of unique) out[id] = id.slice(0, 8);
    return out;
  }

  const rowMap = new Map<string, string | null>();
  for (const row of (data ?? []) as Array<{ id: string; email: string | null }>) {
    rowMap.set(row.id, row.email);
  }

  for (const id of unique) {
    const email = rowMap.get(id);
    if (email && email.includes("@")) {
      out[id] = email.split("@")[0];
    } else {
      out[id] = id.slice(0, 8); // CONTEXT D-3 defensive fallback
    }
  }

  return out;
}
