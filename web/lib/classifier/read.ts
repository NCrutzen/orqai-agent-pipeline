// Phase 60-00. Server-only read helpers for the classifier engine.
// readWhitelist (cached, hot path) is re-exported from ./cache.
// listRulesForSwarm reads the full row set for the dashboard (no caching).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifierRule } from "./types";
import { readWhitelist } from "./cache";

export { readWhitelist };

export async function listRulesForSwarm(
  admin: SupabaseClient,
  swarmType: string,
): Promise<ClassifierRule[]> {
  const { data, error } = await admin
    .from("classifier_rules")
    .select(
      "id, swarm_type, rule_key, kind, status, n, agree, ci_lo, last_evaluated, promoted_at, last_demoted_at, notes",
    )
    .eq("swarm_type", swarmType)
    .order("status", { ascending: true })
    .order("rule_key", { ascending: true });

  if (error) {
    throw new Error(`listRulesForSwarm(${swarmType}): ${error.message}`);
  }
  return (data ?? []) as ClassifierRule[];
}
