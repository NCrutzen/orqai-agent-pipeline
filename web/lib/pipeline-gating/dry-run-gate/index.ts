// Phase 110 Plan 04 (D-10 / D-11) — per-stage dry-run gate resolver.
//
// Single source of truth for reading the per-stage governance flags from a
// swarm's swarms.dry_run_config jsonb (seeded by 20260603b_swarms_dry_run_config.sql).
// The four side-effect workers route every "is this stage live?" decision
// through these helpers instead of reading debtor.labeling_settings.dry_run, so
// the gate is uniform across swarms and a new swarm is governed by registry
// data alone.
//
// Convention (must match the migration):
//   flag value TRUE  = BLOCKED (dry-run / no live side effect)
//   flag value FALSE = LIVE
//   flag MISSING     = treated as TRUE (blocked / fail-closed) — a swarm with no
//                      config is safe by default.
//
// D-11 effective-behavior contract pinned by
// __tests__/dry-run-gate-preservation.test.ts:
//   debtor stage_1_cleanup  → LIVE   (false) — re-encodes the hardcoded
//                             "production" cleanup path (the 867-delete footgun);
//                             the seed migration gives debtor false.
//   debtor stage_3_labeling → GATED  (true)  — matches uniform
//                             labeling_settings.dry_run=true.
//   debtor invoice-copy     → GATED  (true).
//   sales  every stage      → BLOCKED (true).
//
// OQ-1 (verified 2026-06-03): all 6 debtor mailboxes are dry_run=true
// uniformly, so a single per-swarm flag reproduces the effective value exactly
// — no per-mailbox override layer is needed here.

/** Shape of swarms.dry_run_config. All flags optional; missing = blocked. */
export interface DryRunConfig {
  stage_1_archive?: boolean;
  stage_1_cleanup?: boolean;
  stage_3_labeling?: boolean;
  stage_4_handlers?: Record<string, boolean>;
}

/** Minimal shape this module needs off a loaded swarm row. */
export interface SwarmLikeForGate {
  dry_run_config?: DryRunConfig | null;
}

/**
 * True when the named per-stage side effect is BLOCKED (dry-run) for this swarm.
 * Fail-closed: a missing swarm / missing config / missing flag → blocked (true).
 */
export function isStageBlocked(
  swarm: SwarmLikeForGate | null | undefined,
  stage: "stage_1_archive" | "stage_1_cleanup" | "stage_3_labeling",
): boolean {
  return swarm?.dry_run_config?.[stage] ?? true;
}

/**
 * True when a specific Stage 4 handler is BLOCKED (dry-run) for this swarm.
 * Fail-closed: missing handler entry → blocked (true).
 */
export function isHandlerBlocked(
  swarm: SwarmLikeForGate | null | undefined,
  handlerName: string,
): boolean {
  return swarm?.dry_run_config?.stage_4_handlers?.[handlerName] ?? true;
}

/**
 * Convenience inverse for the resolver/label-applier/invoice-copy workers that
 * previously read `settingsRow?.dry_run ?? true`: returns the dryRun boolean
 * (true = dry-run / blocked) for the given stage, fail-closed.
 */
export function resolveStageDryRun(
  swarm: SwarmLikeForGate | null | undefined,
  stage: "stage_1_archive" | "stage_1_cleanup" | "stage_3_labeling",
): boolean {
  return isStageBlocked(swarm, stage);
}
