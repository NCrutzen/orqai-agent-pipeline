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
  stage_2_resolution?: boolean;
  stage_3_labeling?: boolean;
  // Phase 113 Plan 05 (D-08 / D-09) — the Stage-3 ROUTING gate, distinct from
  // stage_3_labeling. This flag governs whether the coordinator emits
  // `<swarm>/predicted` (→ the Stage 3.5 dispatcher → Kanban routing) AFTER the
  // verdict is persisted (so the verdict is ALWAYS visible in Bulk Review even
  // when routing is held). It is NOT stage_3_labeling: labeling is a
  // downstream Stage-2/3 iController side-effect (debtor: gated), whereas
  // routing is the predicted-emit (debtor: LIVE today). Reusing
  // stage_3_labeling here would silently START holding debtor's predicted emit
  // — a regression. So this is a dedicated key, seeded debtor=false (OPEN,
  // preserves today's emit) / sales=true (GATED, dry-run observation first).
  // Convention is identical: TRUE = gated/held, FALSE = open/live, MISSING =
  // fail-closed (gated).
  stage_3_routing?: boolean;
  // Phase 117 Plan 01 (D-3) — the Outlook AI:-category WRITE gate, distinct from
  // stage_3_labeling AND stage_3_routing. This flag governs whether the
  // swarm-agnostic intent-label worker (Plan 02) writes the Stage-3 top-1 intent
  // back onto the source message as a native `AI:` Outlook category via Graph. It
  // is NOT stage_3_labeling (iController labeling side-effect) and NOT
  // stage_3_routing (the predicted-emit) — reusing either would regress those
  // independent side effects. Seeded GATED (true) for BOTH debtor-email and
  // sales-email; the write is a no-op until an operator green-lights and flips it.
  // Convention identical: TRUE = gated/dry-run, FALSE = live, MISSING =
  // fail-closed (gated).
  stage_3_intent_label?: boolean;
  stage_4_handlers?: Record<string, boolean>;
  // Phase 132 Plan 01 (D-03 / D-04) — the per-BUCKET forward RELEASE map for the
  // info-routing Stage-4 forward worker. Keyed by destination bucket
  // (e.g. "storingen", "verkoop").
  //
  // ⚠️ INVERSE POLARITY to every other flag in this interface. For
  // stage_4_handlers / stage_3_routing / stage_3_labeling the value TRUE means
  // BLOCKED/held. For stage_4_forward_buckets the value TRUE means RELEASED
  // (live forward fires) and FALSE/MISSING means HELD. The inversion is
  // deliberate (a graduated per-bucket OPT-IN to live forwarding, D-03) and is
  // pinned by forward-bucket-release.test.ts so the second-mental-model trap
  // (RESEARCH Pattern 2) cannot ship a premature forward. Read it ONLY through
  // isForwardBucketReleased, never via isHandlerBlocked.
  stage_4_forward_buckets?: Record<string, boolean>;
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
  stage:
    | "stage_1_archive"
    | "stage_1_cleanup"
    | "stage_2_resolution"
    | "stage_3_labeling"
    | "stage_3_intent_label",
): boolean {
  return swarm?.dry_run_config?.[stage] ?? true;
}

/**
 * Phase 113 Plan 05 (D-08 / D-09). True when Stage-3 ROUTING is HELD (dry-run
 * observation) for this swarm — i.e. the coordinator must persist the verdict
 * but WITHHOLD the `<swarm>/predicted` emit so the Stage 3.5 dispatcher never
 * fires and Kanban routing is held.
 *
 * Swarm-agnostic + fail-closed: a missing swarm / config / flag → held (true).
 * Reads the DEDICATED `stage_3_routing` key, NOT `stage_3_labeling` — see the
 * DryRunConfig comment for why conflating them would regress debtor's live
 * predicted-emit. Seeded debtor=false (OPEN) / sales=true (GATED).
 */
export function isStage3RoutingGated(
  swarm: SwarmLikeForGate | null | undefined,
): boolean {
  return swarm?.dry_run_config?.stage_3_routing ?? true;
}

/**
 * Phase 132 Plan 01 (D-03 / D-04). True when the named forward BUCKET is
 * RELEASED (live forward may fire) for this swarm.
 *
 * ⚠️ INVERSE POLARITY to isHandlerBlocked / isStageBlocked / isStage3RoutingGated.
 * Those return TRUE = held/blocked. THIS returns TRUE = released:
 *   stage_4_forward_buckets[bucket] === true  → released (live forward)
 *   value FALSE                                → held
 *   entry/map/config MISSING                   → held (fail-closed, D-04
 *                                                default held/observe)
 *
 * So the live-forward decision is a strict `=== true` check, not a `?? false`
 * — the read is fail-closed: anything other than an explicit TRUE keeps the
 * bucket held. This per-bucket OPT-IN is the graduated-release gate (D-03):
 * an operator green-lights one bucket at a time by flipping its entry to true.
 */
export function isForwardBucketReleased(
  swarm: SwarmLikeForGate | null | undefined,
  bucket: string,
): boolean {
  return swarm?.dry_run_config?.stage_4_forward_buckets?.[bucket] === true;
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
  stage:
    | "stage_1_archive"
    | "stage_1_cleanup"
    | "stage_2_resolution"
    | "stage_3_labeling"
    | "stage_3_intent_label",
): boolean {
  return isStageBlocked(swarm, stage);
}
