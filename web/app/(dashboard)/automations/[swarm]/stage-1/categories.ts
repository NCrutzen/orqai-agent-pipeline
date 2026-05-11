// Phase 56.7-03 (D-15). Type-only helpers for the generic queue route.
// The OVERRIDE_CATEGORIES const that used to live here is gone — categories
// are loaded from public.swarm_noise_categories at request time via
// `loadSwarmNoiseCategories(admin, swarmType)`. See ./actions.ts.
//
// Why this file still exists: Next 15 / Turbopack's "use server" codegen
// emits a runtime `module.exports.X = X` for every export from a "use
// server" file, including type-only exports. Keeping these types in a
// non-"use server" sibling avoids the ReferenceError noted in 60-06.

export interface VerdictInput {
  swarm_type: string;
  automation_run_id: string;
  /** Phase 999.8 Plan 05 / Pitfall 9 (RESEARCH §7). REAL email_id, not
   *  aliased from automation_run_id. recordVerdict uses this to look up the
   *  Stage 1 pipeline_events row that drives predictor attribution. */
  email_id: string;
  rule_key: string;
  decision: "approve" | "reject";
  message_id: string;
  source_mailbox: string;
  entity: string;
  predicted_category: string;
  /** Free-form string (e.g. swarm_noise_categories.category_key). Validated
   *  server-side against `loadSwarmNoiseCategories(admin, swarm_type)`. */
  override_category?: string | null;
  notes?: string;
}

export type ReviewEmailBodyResult =
  | { ok: true; bodyText: string; bodyHtml: string | null }
  | { ok: false; error: string };
