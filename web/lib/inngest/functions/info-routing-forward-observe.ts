// Forward-observe cron — the operator's forward-match Wilson ground-truth
// (memory `forward-match-as-wilson-ground-truth`). A SECOND, passive ground
// truth alongside the label-correction autoflip (info-routing-forward-autoflip):
// staff already forward most info@ mail to the right department, so the actual
// forward destination grades the AI's held verdict for free, with no operator
// action. Per-bucket agree/disagree → Wilson lower bound → release
// stage_4_forward_buckets[bucket]=true when the bucket clears the gate.
//
// Composition with info-routing-forward-autoflip: BOTH are release-only +
// idempotent (only ever set a bucket TRUE, never FALSE), so their releases
// UNION safely. They run on offset cron minutes to avoid contending on the
// dry_run_config read-modify-write; a rare lost update self-heals on the next
// tick (re-read-inside-step merge, release-only).
// ponytail: two release-only idempotent crons; merge into one authority only if
// write contention ever shows up in practice.
//
// CLAUDE.md Inngest rules: cron string on the trigger arg (never in a /** */
// JSDoc — "*/N" would close the comment); side effects in step.run; never alias
// inngest.send; DB-key ids generated inside step.run.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRoutingDestinations } from "@/lib/swarms/registry";
import {
  fetchForwardsByConversation,
  buildForwardObservations,
  type HeldVerdict,
} from "@/lib/automations/info-routing/forward-observer";
import {
  gradeBucketsByWilson,
  FORWARD_WILSON_GATE,
  MIN_OBSERVED_N,
  type ForwardObservation,
} from "@/lib/automations/info-routing/forward-wilson";

const SWARM = "info-routing";

// Offset 15 min from info-routing-forward-autoflip (*/30 → :00/:30) so the two
// release-only crons never write dry_run_config in the same instant.
const CRON_BUSINESS_HOURS = "TZ=Europe/Amsterdam 15,45 6-19 * * 1-5";

// How far back to scan Sent Items for forwards. Forwards can lag receipt by
// days; 14d covers the dry-run window while keeping the Graph scan bounded.
const FORWARD_LOOKBACK_DAYS = 14;

interface CoordRoutingRow {
  email_id: string | null;
  source_mailbox: string | null;
  decision_details: {
    routing?: {
      bucket?: string;
      brand?: string | null;
      target_mailbox?: string | null;
      unrouted?: boolean;
    };
  } | null;
}

export const infoRoutingForwardObserve = inngest.createFunction(
  { id: "info-routing/forward-observe", retries: 1, concurrency: [{ limit: 1 }] },
  [
    { cron: CRON_BUSINESS_HOURS },
    { event: "info-routing/forward-observe.requested" },
  ],
  async ({ step }) => {
    // (1) Registry + current forward-bucket release map.
    const ctx = await step.run("load-registry-and-config", async () => {
      const admin = createAdminClient();
      const destinations = await loadRoutingDestinations(admin, SWARM);
      const { data: swarmRow, error } = await admin
        .from("swarms")
        .select("dry_run_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (error) throw new Error(`load swarm failed: ${error.message}`);
      const dryRun = (swarmRow?.dry_run_config ?? {}) as {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      return {
        destinations,
        currentForwardBuckets: dryRun.stage_4_forward_buckets ?? {},
      };
    });

    // (2) Routable held verdicts (target_mailbox non-null) joined to their
    // email's conversation_id (email_pipeline schema — bare from("emails") hits
    // the non-existent public.emails: memory
    // admin-client-defaults-public-emails-in-email-pipeline).
    const verdicts = await step.run("load-held-verdicts", async () => {
      const admin = createAdminClient();
      const cr = await admin
        .from("coordinator_runs")
        .select("email_id, source_mailbox, decision_details")
        .eq("swarm_type", SWARM)
        .not("decision_details->routing", "is", null);
      if (cr.error)
        throw new Error(`coordinator_runs read failed: ${cr.error.message}`);

      const rows = (cr.data ?? []) as unknown as CoordRoutingRow[];
      const routable = rows.filter((r) => {
        const rt = r.decision_details?.routing;
        return (
          !!r.email_id &&
          !!rt?.bucket &&
          rt.unrouted !== true &&
          !!rt.target_mailbox
        );
      });
      const emailIds = [...new Set(routable.map((r) => r.email_id as string))];
      const convByEmail = new Map<string, string | null>();
      // Chunk the IN list to keep the URL bounded.
      for (let i = 0; i < emailIds.length; i += 200) {
        const chunk = emailIds.slice(i, i + 200);
        const em = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id, conversation_id")
          .in("id", chunk);
        if (em.error)
          throw new Error(`emails read failed: ${em.error.message}`);
        for (const e of (em.data ?? []) as {
          id: string;
          conversation_id: string | null;
        }[]) {
          convByEmail.set(e.id, e.conversation_id);
        }
      }

      const held: HeldVerdict[] = routable.map((r) => {
        const rt = r.decision_details!.routing!;
        return {
          email_id: r.email_id as string,
          conversation_id: convByEmail.get(r.email_id as string) ?? null,
          source_mailbox: r.source_mailbox ?? "unknown",
          predicted_bucket: rt.bucket as string,
          predicted_target: rt.target_mailbox ?? null,
          brand: rt.brand ?? null,
        };
      });
      return { held, mailboxes: [...new Set(held.map((h) => h.source_mailbox))] };
    });

    // (3) Read forwards out of each source mailbox's Sent Items (Graph) and
    // build the observation rows. sinceIso is computed inside step.run (no
    // Date.now() at module scope — replay-safe).
    const observed = await step.run("read-forwards-and-build", async () => {
      const sinceIso = new Date(
        Date.now() - FORWARD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const forwardsByConversation = new Map<
        string,
        { toAddress: string; sentAt: string | null }
      >();
      for (const mailbox of verdicts.mailboxes) {
        if (mailbox === "unknown") continue;
        const map = await fetchForwardsByConversation(mailbox, sinceIso);
        for (const [k, v] of map) forwardsByConversation.set(k, v);
      }
      const rows = buildForwardObservations(
        verdicts.held,
        forwardsByConversation,
        ctx.destinations,
      );
      return { rows };
    });

    // (4) Upsert the observations (email_id PK = conflict target). Idempotent —
    // a later forward of the same thread supersedes the earlier observation.
    if (observed.rows.length > 0) {
      await step.run("upsert-observations", async () => {
        const admin = createAdminClient();
        const { error } = await admin
          .from("info_routing_forward_observations")
          .upsert(
            observed.rows.map((r) => ({
              email_id: r.email_id,
              swarm_type: SWARM,
              source_mailbox: r.source_mailbox,
              brand: r.brand,
              predicted_bucket: r.predicted_bucket,
              predicted_target: r.predicted_target,
              observed_target: r.observed_target,
              observed_bucket: r.observed_bucket,
              agree: r.agree,
              observed_at: r.observed_at,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "email_id" },
          );
        if (error)
          throw new Error(`forward-observation upsert failed: ${error.message}`);
        return { upserted: observed.rows.length };
      });
    }

    // (5) Grade EVERY accumulated observation (not just this tick's) per bucket
    // by Wilson lower bound, then release passing buckets. Re-read the full
    // table so the gate sees the complete sample, not one tick's slice.
    const grade = await step.run("grade-and-release", async () => {
      const admin = createAdminClient();
      const all = await admin
        .from("info_routing_forward_observations")
        .select("predicted_bucket, observed_bucket, source_mailbox")
        .eq("swarm_type", SWARM);
      if (all.error)
        throw new Error(`observations read failed: ${all.error.message}`);

      const obs = (all.data ?? []) as ForwardObservation[];
      const grades = gradeBucketsByWilson(obs);
      const passing = [...grades.values()]
        .filter((g) => g.pass)
        .map((g) => g.bucket);

      // Release-only + idempotent: only set buckets not already true.
      const toRelease = passing.filter(
        (b) => ctx.currentForwardBuckets[b] !== true,
      );
      const gradeReport = [...grades.values()].sort((a, b) =>
        a.bucket.localeCompare(b.bucket),
      );

      if (toRelease.length === 0) {
        return { released: [] as string[], grades: gradeReport };
      }

      // Re-read dry_run_config inside the write step (replay-safe) and merge
      // only the bucket keys to true — preserves every sibling flag.
      const { data: row, error: readErr } = await admin
        .from("swarms")
        .select("dry_run_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (readErr)
        throw new Error(`re-read dry_run_config failed: ${readErr.message}`);
      const dryRun = (row?.dry_run_config ?? {}) as Record<string, unknown> & {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      const nextBuckets: Record<string, boolean> = {
        ...(dryRun.stage_4_forward_buckets ?? {}),
      };
      for (const b of toRelease) nextBuckets[b] = true;
      const { error: updErr } = await admin
        .from("swarms")
        .update({
          dry_run_config: { ...dryRun, stage_4_forward_buckets: nextBuckets },
        })
        .eq("swarm_type", SWARM);
      if (updErr)
        throw new Error(`forward-bucket release failed: ${updErr.message}`);

      return { released: toRelease.sort(), grades: gradeReport };
    });

    return {
      observations_upserted: observed.rows.length,
      released: grade.released,
      gate: FORWARD_WILSON_GATE,
      min_observed_n: MIN_OBSERVED_N,
      grades: grade.grades,
    };
  },
);
