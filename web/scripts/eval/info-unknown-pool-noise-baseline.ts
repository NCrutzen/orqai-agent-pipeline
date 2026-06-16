/**
 * Phase 130 Plan 05 Task 3 — per-mailbox NOISE-03 baseline, RE-SCOPED to a
 * fully AUTOMATED view-distribution metric (ZERO manual labelling).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The measurement is now computed PURELY from the existing view
 * `public.info_unknown_pool_composition` (per-mailbox Stage-1 decision split:
 * mailbox_entity, decision, n, pct). There is NO sampling, NO manual labelling,
 * NO Wilson CI. Per mailbox it reports the unknown-SHARE (the pct for
 * decision='unknown') plus the aggregate noise-class share.
 *
 * WHY the manual-labelling step was dropped (Plan 05 justification): the prior
 * version (Plan 03) labelled a sample by hand because distribution counts alone
 * were necessary-but-not-sufficient — a shrinking unknown pool could hide a
 * routable mis-archive (RESEARCH Pitfall 5, the false-success failure mode).
 * Plan 05 Task 2 WIRES the shared `hasActionableToken` block-rule into the live
 * Stage-1 worker (registry-gated on swarms.stage1_shared_block_rules): routable
 * mail carrying an actionable token is STRUCTURALLY forced back to 'unknown'
 * and can never be archived as noise. With that hard upstream guard in place, a
 * shrinking unknown-share can no longer mask a routable mis-archive, so the
 * cheap distribution metric becomes SUFFICIENT — not merely necessary. The
 * expensive sample→label→compute→Wilson loop is therefore removed.
 *
 * The Wilson CI imports were tied to the labelled-fraction sampling metric,
 * which is gone. A view `pct` is a CENSUS of the window (not a sample), so a
 * binomial CI is not meaningful for it — the Wilson imports are removed here.
 * (web/lib/classifier/wilson.ts itself is UNTOUCHED — other callers use it.)
 *
 * The pure function `computeUnknownShare` takes view rows and returns the
 * per-mailbox shares IO-free so the unit test drives it without Supabase;
 * main() wires it to the service-role client and prints JSON.
 *
 * Usage:
 *   npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts report
 *     read info_unknown_pool_composition and print per-mailbox unknown-share +
 *     noise-class share as JSON. No args, no labelling, no DB writes.
 */

const SWARM = "info-routing";

// The six info-routing noise classes (20260616b seed) — their combined share
// is the "noise-class" share reported alongside the unknown-share.
const NOISE_CLASS_DECISIONS = new Set<string>([
  "automated_security_report",
  "cold_sales_outreach",
  "marketing_newsletter",
  "auto_dealer_spam",
  "unsolicited_job_application",
  "survey_feedback_invite",
]);

// ─── PURE: per-mailbox unknown-share from the view distribution ─────────────

/** One row of public.info_unknown_pool_composition. */
export interface CompositionRow {
  mailbox_entity: string | null;
  decision: string;
  n: number;
  pct: number;
}

export interface UnknownShare {
  mailbox_entity: string;
  /** within-mailbox pct of Stage-1 decisions landing in 'unknown'. */
  unknown_pct: number;
  /** raw count of 'unknown' decisions for this mailbox. */
  unknown_n: number;
  /** total Stage-1 decisions for this mailbox (sum of all decisions' n). */
  total_n: number;
  /** combined within-mailbox pct of the six info-routing noise classes. */
  noise_class_pct: number;
}

/**
 * Compute the per-mailbox unknown-share + noise-class share directly from the
 * view's distribution rows. No sampling, no labelling, no CI — the view `pct`
 * is a census of the window. Pure.
 */
export function computeUnknownShare(rows: CompositionRow[]): UnknownShare[] {
  const byMailbox = new Map<string, CompositionRow[]>();
  for (const r of rows) {
    const key = r.mailbox_entity ?? "(null)";
    if (!byMailbox.has(key)) byMailbox.set(key, []);
    byMailbox.get(key)!.push(r);
  }

  const out: UnknownShare[] = [];
  for (const [mailbox, group] of byMailbox) {
    const total_n = group.reduce((s, r) => s + r.n, 0);
    const unknownRow = group.find((r) => r.decision === "unknown");
    const unknown_n = unknownRow?.n ?? 0;
    const unknown_pct = unknownRow?.pct ?? 0;
    const noise_class_pct = group
      .filter((r) => NOISE_CLASS_DECISIONS.has(r.decision))
      .reduce((s, r) => s + r.pct, 0);
    out.push({
      mailbox_entity: mailbox,
      unknown_pct,
      unknown_n,
      total_n,
      noise_class_pct: Math.round(noise_class_pct * 10) / 10,
    });
  }
  out.sort((a, b) => a.mailbox_entity.localeCompare(b.mailbox_entity));
  return out;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const USAGE = `info-unknown-pool-noise-baseline — automated per-mailbox NOISE-03 metric

Computed PURELY from public.info_unknown_pool_composition. ZERO manual labelling.
The wired hasActionableToken shared block-rule (Plan 05) structurally prevents
routable mis-archive, so the distribution share is sufficient.

Usage:
  report    read the view and print per-mailbox unknown-share + noise-class share.
`;

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[0] ?? "report";

  if (mode !== "report") {
    fail(`unknown mode "${mode}" — expected: report`);
  }

  // Lazy import so arg-validation never needs env/secrets/network.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const compRes = await admin
    .from("info_unknown_pool_composition")
    .select("mailbox_entity, decision, n, pct");
  if (compRes.error) {
    throw new Error(
      `info_unknown_pool_composition read failed: ${compRes.error.message}`,
    );
  }

  const rows = (compRes.data ?? []) as CompositionRow[];
  const shares = computeUnknownShare(rows);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mode: "report",
        swarm: SWARM,
        metric: "automated view-distribution unknown-share (NOISE-03, zero manual labelling)",
        shares,
      },
      null,
      2,
    ),
  );
}

// Only run main() when invoked directly (tsx), never on import (the test
// imports the pure function only).
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /info-unknown-pool-noise-baseline\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
