// Phase 132.1 Plan 04 Task 2 (D-02) — the per-mailbox forward AUTO-FLIP cron.
//
// This cron ARMS irreversible live Outlook forwards. It releases a forward bucket
// (`swarms.gating_config.stage_4_forward_buckets[bucket]=true`) for the
// info-routing swarm ONLY when that bucket's source mailbox has cleared the
// ROUTE-08 shadow gate: per-mailbox precision is `graded` AND `pass===true` AND
// `graded_n >= MIN_GRADED_N` (50). `insufficient_sample` / `pass:null` NEVER
// flips — the false-success guard (gradeVerdict, IMPORTED unchanged) is the
// load-bearing safety. Brand-reachable reconciliation (operator-confirmed A4): a
// cleared mailbox releases only the buckets reachable from its brand; smeba and
// fire-control flip independently. Release-only + idempotent: only ever sets
// `true`, never `false`; a bucket already true is left untouched.
//
// PANIC LEVER: the one-flag revert is migration `20260624b_phase1321_forward_
// buckets_revert.sql` (Plan 03, armed-not-applied) — it resets
// stage_4_forward_buckets to {} (all held). Apply it to instantly hold every
// forward if a regression is detected.
//
// MONITORING (D-02): emits a pipeline_events alert row on the three regression
// conditions — (a) a post-release precision regression (a released bucket's
// mailbox drops below 0.85), (b) a forward-worker non-ok Graph response, and
// (c) a post-flip createRun-null worker_failed. The first is detected here; the
// latter two are surfaced by the forward worker and tallied via the shared
// pipeline_events sink (this cron emits the regression alert it can compute).
//
// CLAUDE.md Inngest rules honored: the cron string lives on the trigger arg
// (never in a /** */ JSDoc — a literal "*/N" would close the comment); described
// in // comments only; any DB-key id is generated INSIDE step.run; inngest.send
// is never aliased; all side effects live in step.run.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRoutingDestinations } from "@/lib/swarms/registry";
import {
  computePerMailboxStats,
  planForwardBucketFlips,
  MATCH_RATE_GATE,
  type ShadowRow,
  type RoutingDestinationLike,
} from "@/scripts/eval/info-routing-precision-shadow";

const SWARM = "info-routing";

// Business-hours cron: every 30 minutes, hours 6-19, Mon-Fri, Europe/Amsterdam.
// (Lives on the trigger arg below — never in a block JSDoc. CLAUDE.md rule.)
const CRON_BUSINESS_HOURS = "TZ=Europe/Amsterdam */30 6-19 * * 1-5";

interface CoordinatorRoutingRow {
  email_id: string | null;
  source_mailbox: string | null;
  decision_details: { routing?: { bucket?: string; confidence?: string } } | null;
}

/**
 * Build the (captured Outlook category → bucket) reverse map. Mirrors the
 * harness main() wiring; kept local so the cron does not depend on the script's
 * private builder export surface beyond the pure planners it imports.
 */
function buildShadowRows(
  rawRows: CoordinatorRoutingRow[],
  categoryToBucket: Map<string, string>,
  humanCategoryByEmailId: Map<string, string>,
): ShadowRow[] {
  return rawRows.flatMap((r) => {
    const routing = r.decision_details?.routing;
    const verdict_bucket = routing?.bucket;
    const confidence = routing?.confidence;
    if (!verdict_bucket || !confidence) return [];
    const captured = r.email_id
      ? humanCategoryByEmailId.get(r.email_id)
      : undefined;
    const human_category =
      (captured ? categoryToBucket.get(captured) : undefined) ?? null;
    return [
      {
        verdict_bucket,
        human_category,
        confidence: confidence as "low" | "medium" | "high",
        source_mailbox: r.source_mailbox ?? "unknown",
      },
    ];
  });
}

const AI_ROUTING_LABEL_PREFIXES = ["AI: routed → ", "AI: held → "] as const;

function buildCategoryToBucket(
  destinations: RoutingDestinationLike[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of destinations) {
    if (!d.outlook_category) continue;
    m.set(d.outlook_category, d.destination_key);
    for (const prefix of AI_ROUTING_LABEL_PREFIXES) {
      m.set(`${prefix}${d.destination_key}`, d.destination_key);
    }
  }
  return m;
}

export const infoRoutingForwardAutoflip = inngest.createFunction(
  // Serial (limit 1) so two ticks never race the read-modify-write of
  // gating_config. retries:1 — a transient DB error retries once, then surfaces.
  { id: "info-routing/forward-autoflip", retries: 1, concurrency: [{ limit: 1 }] },
  [{ cron: CRON_BUSINESS_HOURS }, { event: "info-routing/forward-autoflip.requested" }],
  async ({ step }) => {
    // (1) Load the routing registry (brand → bucket axis) + the swarm's current
    // gating_config + per-mailbox brand map. Read gating_config FRESH (not via
    // the cached loadSwarm) so idempotency is computed against live state.
    const ctx = await step.run("load-registry-and-config", async () => {
      const admin = createAdminClient();
      const destinations = await loadRoutingDestinations(admin, SWARM);
      const { data: swarmRow, error } = await admin
        .from("swarms")
        .select("gating_config, resolution_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (error) throw new Error(`load swarm failed: ${error.message}`);
      const dryRun = (swarmRow?.gating_config ?? {}) as {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      const scope = (
        swarmRow?.resolution_config as
          | { scope?: { entity_by_mailbox?: Record<string, string> } }
          | null
      )?.scope;
      return {
        destinations,
        currentForwardBuckets: dryRun.stage_4_forward_buckets ?? {},
        entityByMailbox: scope?.entity_by_mailbox ?? {},
      };
    });

    // (2) Read the 112.5 delta-synced operator corrections (ground-truth) +
    // the persisted high-confidence routing verdicts. Same sources as the shadow
    // harness report mode.
    const shadow = await step.run("read-shadow-inputs", async () => {
      const admin = createAdminClient();

      const sig = await admin
        .from("swarm_review_signals")
        .select("email_id, category_key, observed_at")
        .eq("swarm_type", SWARM)
        .eq("transition_kind", "category_edited")
        .not("category_key", "is", null)
        .order("observed_at", { ascending: true });
      if (sig.error)
        throw new Error(`swarm_review_signals read failed: ${sig.error.message}`);

      const verdicts = await admin
        .from("coordinator_runs")
        .select("email_id, source_mailbox, decision_details")
        .eq("swarm_type", SWARM)
        .not("decision_details->routing", "is", null);
      if (verdicts.error)
        throw new Error(`coordinator_runs read failed: ${verdicts.error.message}`);

      return {
        signals: (sig.data ?? []) as {
          email_id: string | null;
          category_key: string | null;
        }[],
        verdicts: (verdicts.data ?? []) as unknown as CoordinatorRoutingRow[],
      };
    });

    // (3) Grade per mailbox (PURE harness fns — gradeVerdict imported unchanged).
    const humanCategoryByEmailId = new Map<string, string>();
    for (const s of shadow.signals) {
      if (s.email_id && s.category_key) {
        humanCategoryByEmailId.set(s.email_id, s.category_key); // ascending → latest wins
      }
    }
    const categoryToBucket = buildCategoryToBucket(ctx.destinations);
    const rows = buildShadowRows(
      shadow.verdicts,
      categoryToBucket,
      humanCategoryByEmailId,
    );
    const perMailbox = computePerMailboxStats(rows);

    // (4) Plan the brand-reachable releases (operator-confirmed A4), gated on
    // graded+pass+graded_n≥MIN, idempotent + release-only.
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: ctx.destinations,
      brandForMailbox: (mailbox) => ctx.entityByMailbox[mailbox] ?? null,
      currentForwardBuckets: ctx.currentForwardBuckets,
    });

    // (5) Monitoring — a post-release precision regression: a bucket already
    // released whose source mailbox now grades pass===false (dropped below the
    // gate). Emit ONE alert row enumerating the regressed mailboxes (release-only
    // cron never auto-reverts; the operator applies migration 20260624b).
    const regressions: { mailbox: string; overall_match_pct: number }[] = [];
    for (const [mailbox, grade] of perMailbox) {
      const brand = ctx.entityByMailbox[mailbox];
      if (!brand) continue;
      if (grade.verdict.status !== "graded") continue;
      if (grade.verdict.pass === true) continue; // healthy
      // pass===false: any of this brand's buckets already released? → regression.
      const released = ctx.destinations.some(
        (d) =>
          d.outlook_category &&
          d.brand === brand &&
          ctx.currentForwardBuckets[d.destination_key] === true,
      );
      if (released) {
        regressions.push({
          mailbox,
          overall_match_pct: grade.stats.overall_match_pct,
        });
      }
    }

    if (regressions.length > 0) {
      await step.run("emit-regression-alert", async () => {
        const admin = createAdminClient();
        // email_id LEFT NULL to dodge the partial unique index
        // pipeline_events_one_per_stage_email (email_id, swarm_type, stage).
        const { error } = await admin.from("pipeline_events").insert({
          swarm_type: SWARM,
          stage: 4,
          email_id: null,
          decision: "forward_autoflip_precision_regression",
          decision_details: {
            gate: MATCH_RATE_GATE,
            regressions,
            panic_lever:
              "apply migration 20260624b_phase1321_forward_buckets_revert.sql to hold all forwards",
          },
          triggered_by: "info-routing/forward-autoflip",
        });
        if (error)
          console.error(
            `[forward-autoflip] regression alert insert failed: ${error.message}`,
          );
        return { regressed: regressions.length };
      });
    }

    // (6) Apply the planned releases. A jsonb `||` merge sets ONLY the target
    // bucket keys to true, preserving every gating_config sibling (stage_3_
    // routing, stage_2_resolution, …). No flips → no write (idempotent no-op).
    if (flips.length === 0) {
      return {
        flipped: 0,
        regressions: regressions.length,
        per_mailbox: [...perMailbox.keys()],
      };
    }

    const applied = await step.run("release-forward-buckets", async () => {
      const admin = createAdminClient();
      // Re-read gating_config inside the write step (replay-safe) so the merge
      // is computed against the freshest state; merge only the bucket keys.
      const { data: row, error: readErr } = await admin
        .from("swarms")
        .select("gating_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (readErr) throw new Error(`re-read gating_config failed: ${readErr.message}`);

      const dryRun = (row?.gating_config ?? {}) as Record<string, unknown> & {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      const nextBuckets: Record<string, boolean> = {
        ...(dryRun.stage_4_forward_buckets ?? {}),
      };
      for (const f of flips) {
        // Release-only: only ever set true; never write false.
        if (nextBuckets[f.bucket] !== true) nextBuckets[f.bucket] = true;
      }
      const nextDryRun = { ...dryRun, stage_4_forward_buckets: nextBuckets };

      const { error: updErr } = await admin
        .from("swarms")
        .update({ gating_config: nextDryRun })
        .eq("swarm_type", SWARM);
      if (updErr) throw new Error(`forward-bucket release failed: ${updErr.message}`);

      return { buckets: [...new Set(flips.map((f) => f.bucket))].sort() };
    });

    return {
      flipped: applied.buckets.length,
      buckets: applied.buckets,
      regressions: regressions.length,
      flips,
    };
  },
);
