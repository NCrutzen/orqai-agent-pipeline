// Phase 4 Plan 01 — patterns recommender cron.
//
// Dual trigger per P4-D-09 + CLAUDE.md "cron + event" pattern:
//   cron: TZ=Europe/Amsterdam 0 2 * * *  -- daily 02:00 Amsterdam
//   event: patterns.cron.run             -- manual reruns (dev/debug/operator)
// TZ prefix REQUIRED. Single-line comment only — never put cron strings
// inside JSDoc per CLAUDE.md learning eb434cfd (the */N would close it).
//
// Replay safety (CLAUDE.md Inngest Phase 65 learning):
//   - All side effects (fetch, upserts) live inside step.run().
//   - candidate UUIDs come from the Postgres DEFAULT gen_random_uuid() — no
//     client-side UUID generation, so Inngest replays converge on the same
//     (swarm_type, signature_key) UPSERT key regardless.
//   - inngest.send is NOT destructured (in fact this cron emits no events).
//
// Idempotency: the UPSERT explicit column list EXCLUDES status / approved_by /
// approved_at / dismissed_by / dismissed_at / created_at so re-runs never
// clobber operator decisions (LERN-04 honored).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clusterOverrideEvents,
  type PipelineEventOverrideRow,
} from "@/lib/promotion-recommender/cluster";
import {
  renderBeforeAfterPayload,
  renderDisplaySignature,
  renderDisplaySignatureSub,
} from "@/lib/promotion-recommender/signature";
import {
  computeExpectedSavingsCentsPerMonth,
  SAVINGS_CALCULATION_VERSION,
} from "@/lib/promotion-recommender/savings";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const patternsRecommenderCron = inngest.createFunction(
  {
    id: "patterns-recommender-cron",
    name: "Patterns recommender — daily cron",
    retries: 2,
  },
  // cron: TZ=Europe/Amsterdam 0 2 * * *  -- daily 02:00 Amsterdam (P4-D-09)
  [
    { cron: "TZ=Europe/Amsterdam 0 2 * * *" },
    { event: "patterns.cron.run" },
  ],
  async ({ step, event }) => {
    // event.data is the union of the cron trigger payload ({cron: string})
    // and the `patterns.cron.run` event payload ({swarm_type?, dry_run?}).
    // Narrow via a runtime field check.
    const eventData = (event?.data ?? {}) as Record<string, unknown>;
    const swarmFilter: string | null =
      typeof eventData.swarm_type === "string" ? eventData.swarm_type : null;

    // 1. Fetch override rows (partial index hit on
    //    pipeline_events_override_partial_idx WHERE override IS NOT NULL).
    const rows = await step.run("fetch-override-events", async () => {
      const supa = createAdminClient();
      const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
      let q = supa
        .from("pipeline_events")
        .select("*")
        .not("override", "is", null)
        .gte("created_at", cutoff);
      if (swarmFilter) q = q.eq("swarm_type", swarmFilter);
      const { data, error } = await q;
      if (error) throw new Error(`fetch-override-events: ${error.message}`);
      return (data ?? []) as PipelineEventOverrideRow[];
    });

    // 2. Hydrate known intent_keys so cluster discriminates prompt_tune from new_intent.
    const knownIntentKeys = await step.run(
      "fetch-known-intent-keys",
      async () => {
        const supa = createAdminClient();
        const { data, error } = await supa
          .from("swarm_intents")
          .select("intent_key");
        if (error) {
          // Tolerate absent table / read errors — fall back to "all known"
          // so we never spuriously emit new_intent candidates.
          return null;
        }
        return (data ?? []).map((r: { intent_key: string }) => r.intent_key);
      },
    );

    // 3. Cluster (pure — fine outside step.run).
    const drafts = clusterOverrideEvents(rows, {
      known_intent_keys: knownIntentKeys
        ? new Set(knownIntentKeys)
        : undefined,
    });

    // 4. UPSERT each draft enriched with display_signature + expected_savings.
    const writes = await step.run("upsert-candidates", async () => {
      const supa = createAdminClient();
      const results: Array<{
        signature_key: string;
        ok: boolean;
        id?: string;
        error?: string;
      }> = [];
      const nowIso = new Date().toISOString();
      for (const d of drafts) {
        const display_signature = renderDisplaySignature(d.structured_payload);
        const display_signature_sub = renderDisplaySignatureSub(
          d.structured_payload,
        );
        const before_after_payload = renderBeforeAfterPayload({
          payload: d.structured_payload,
          avg_replaced_cost_cents: d.avg_replaced_cost_cents,
          avg_promoted_cost_cents: d.avg_promoted_cost_cents,
        });
        const expected_savings = computeExpectedSavingsCentsPerMonth({
          kind: d.kind,
          matched_event_count_30d: d.matched_event_count_30d,
          avg_replaced_cost_cents: d.avg_replaced_cost_cents,
          avg_promoted_cost_cents: d.avg_promoted_cost_cents,
          confirm_rate: d.confirm_rate,
        });
        const row = {
          kind: d.kind,
          swarm_type: d.swarm_type,
          stage: d.stage,
          signature_key: d.signature_key,
          proposed_change: {
            display_signature,
            display_signature_sub,
            before_after_payload,
            structured_payload: d.structured_payload,
          },
          evidence_event_ids: d.evidence_event_ids,
          evidence_email_ids: d.evidence_email_ids,
          matched_event_count_30d: d.matched_event_count_30d,
          confirm_rate: d.confirm_rate,
          expected_savings_cents_per_month: expected_savings,
          savings_calculation_version: SAVINGS_CALCULATION_VERSION,
          updated_at: nowIso,
        };
        const { data, error } = await supa
          .from("promotion_candidates")
          .upsert(row, { onConflict: "swarm_type,signature_key" })
          .select("id, signature_key")
          .single();
        if (error) {
          results.push({
            signature_key: d.signature_key,
            ok: false,
            error: error.message,
          });
        } else {
          results.push({
            signature_key: d.signature_key,
            ok: true,
            id: (data as { id: string }).id,
          });
        }
      }
      return results;
    });

    return {
      fetched: rows.length,
      clusters_above_threshold: drafts.length,
      writes,
    };
  },
);
