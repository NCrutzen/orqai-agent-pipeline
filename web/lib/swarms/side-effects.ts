// Phase 68 (R-01, D-06). Side-effects descriptor evaluation. The descriptors
// live in swarms.side_effects (jsonb array). Each descriptor declares a
// trigger (which lifecycle moment fires it), a gate (equality match against a
// runtime ctx object), and a kind (which dispatcher consumes it).
//
// Discriminator-based union (R-01) lets dispatchers in worker code switch on
// `kind` without per-swarm if-trees:
//   - "inngest_event"          → fan out via inngest.send
//   - "automation_run_insert"  → INSERT a deferred automation_runs row
//
// New side-effect kinds get added by extending the union below + adding the
// matching dispatcher branch. No DB migration needed for new descriptors —
// only for new columns/tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "./registry";

export type SideEffectKind = "inngest_event" | "automation_run_insert";

export type SideEffectTrigger =
  | "stage1_categorize_archive"
  | "stage2_match_live"
  | "stage3_handler_complete"
  | "stage4_synthesis_complete";

export interface InngestEventDescriptor {
  kind: "inngest_event";
  event: string;
  trigger: SideEffectTrigger;
  gate: Record<string, unknown>;
  phase_origin: string;
}

export interface AutomationRunInsertDescriptor {
  kind: "automation_run_insert";
  automation: string;
  trigger: SideEffectTrigger;
  gate: Record<string, unknown>;
  result_template: Record<string, unknown>;
  phase_origin: string;
}

export type SideEffectDescriptor =
  | InngestEventDescriptor
  | AutomationRunInsertDescriptor;

// Evaluate side-effect descriptors for a swarm at a given trigger point.
// A descriptor matches when:
//   1. descriptor.trigger === trigger
//   2. every (k, v) in descriptor.gate satisfies ctx[k] === v
// Equality is `===` only — no deep compare, no truthy-coercion.
export async function evaluateSideEffects(
  admin: SupabaseClient,
  swarmType: string,
  trigger: SideEffectTrigger,
  ctx: Record<string, unknown>,
): Promise<SideEffectDescriptor[]> {
  const swarm = await loadSwarm(admin, swarmType);
  const all = (swarm?.side_effects as SideEffectDescriptor[] | null) ?? [];
  return all
    .filter((d) => d.trigger === trigger)
    .filter((d) =>
      Object.entries(d.gate).every(([k, v]) => ctx[k] === v),
    );
}
