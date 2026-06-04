// Phase 5 Plan 04 — support-tickets registries loader (ADMIN-02 + ADMIN-03).
//
// loadRegistries(admin) returns both:
//   intents — support-tickets swarm_intents rows via the canonical
//             loadSwarmIntents helper from @/lib/swarms/registry.
//             Re-exported as IntentRow (alias of SwarmIntentRow) so callers
//             have a local type without duplicating the canonical definition.
//   systems — support_software_systems rows including last_clickup_sync_at
//             (the Plan 05-01 column — NULL ⇒ "Never synced" in the shell).
//
// Design: loadSwarmIntents from @/lib/swarms/registry is the canonical path
// for swarm_intents reads (Phase 68 + ADMIN-02 W2 constraint). Do NOT
// define a local IntentRow type; re-export SwarmIntentRow under the alias.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSwarmIntents,
} from "@/lib/swarms/registry";
import type { SwarmIntentRow } from "@/lib/swarms/types";

// ADMIN-02: re-export the canonical type (no local duplicate per plan W2).
export type IntentRow = SwarmIntentRow;

// ADMIN-03: shape of a support_software_systems row.
export interface SystemRow {
  id: string;
  system_key: string;
  display_name: string;
  clickup_list_id: string | null;
  default_assignee_user_id: string | null;
  vendor_locale: string | null;
  vendor_email: string | null;
  enabled: boolean;
  last_clickup_sync_at: string | null;
}

export interface RegistriesResult {
  intents: IntentRow[];
  systems: SystemRow[];
}

/**
 * loadRegistries — server-side fetch of both admin-read registries.
 * Throws on Supabase query error (mirrors loadSubmissions pattern).
 */
export async function loadRegistries(
  admin: SupabaseClient,
): Promise<RegistriesResult> {
  // ADMIN-02: canonical helper; keyed by swarm_type='support-tickets'.
  const intents = await loadSwarmIntents(admin, "support-tickets");

  // ADMIN-03: direct select (no helper for support_software_systems).
  const { data, error } = await admin
    .from("support_software_systems")
    .select(
      [
        "id",
        "system_key",
        "display_name",
        "clickup_list_id",
        "default_assignee_user_id",
        "vendor_locale",
        "vendor_email",
        "enabled",
        "last_clickup_sync_at",
      ].join(", "),
    )
    .order("system_key", { ascending: true });

  if (error) throw error;

  return {
    intents,
    systems: (data ?? []) as unknown as SystemRow[],
  };
}
