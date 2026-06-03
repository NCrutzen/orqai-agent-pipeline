#!/usr/bin/env tsx
/**
 * Phase 4 smoke: invoke the promotion-recommender cron logic in-process
 * against the live acceptance/test pipeline_events fixtures, write resulting
 * promotion_candidates rows. Bypasses Inngest so we don't need the dev server
 * stack — exercises the exact same pure clustering + signature + savings code
 * paths the cron uses.
 *
 * Usage:  SUPABASE_SERVICE_ROLE_KEY=... npm run -s phase4-smoke
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  clusterOverrideEvents,
  CLUSTER_MIN_EVIDENCE,
  type PipelineEventOverrideRow,
} from "../lib/promotion-recommender/cluster";
import {
  renderBeforeAfterPayload,
  renderDisplaySignature,
  renderDisplaySignatureSub,
} from "../lib/promotion-recommender/signature";
import {
  computeExpectedSavingsCentsPerMonth,
  SAVINGS_CALCULATION_VERSION,
} from "../lib/promotion-recommender/savings";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supa
    .from("pipeline_events")
    .select("*")
    .not("override", "is", null)
    .gte("created_at", cutoff);

  if (error) throw new Error(`fetch override events: ${error.message}`);
  const overrideRows = (rows ?? []) as PipelineEventOverrideRow[];
  console.log(`fetched ${overrideRows.length} override rows (min evidence per cluster: ${CLUSTER_MIN_EVIDENCE})`);

  const { data: intents } = await supa.from("swarm_intents").select("intent_key");
  const knownIntents = new Set((intents ?? []).map((r: { intent_key: string }) => r.intent_key));

  const drafts = clusterOverrideEvents(overrideRows, { known_intent_keys: knownIntents });
  console.log(`clustered into ${drafts.length} draft candidate(s):`);
  for (const d of drafts) {
    console.log(`  - ${d.kind} · stage=${d.stage} · swarm=${d.swarm_type} · matched=${d.matched_event_count_30d} · sig=${d.signature_key}`);
  }

  const nowIso = new Date().toISOString();
  const results: Array<{ kind: string; ok: boolean; id?: string; signature?: string; err?: string }> = [];

  for (const d of drafts) {
    const display_signature = renderDisplaySignature(d.structured_payload);
    const display_signature_sub = renderDisplaySignatureSub(d.structured_payload);
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
    const { data, error: upErr } = await supa
      .from("promotion_candidates")
      .upsert(row, { onConflict: "swarm_type,signature_key" })
      .select("id, signature_key")
      .single();
    if (upErr) results.push({ kind: d.kind, ok: false, err: upErr.message });
    else results.push({ kind: d.kind, ok: true, id: (data as { id: string }).id, signature: display_signature });
  }

  console.log("\nUPSERT results:");
  for (const r of results) {
    if (r.ok) console.log(`  ✓ ${r.kind} · id=${r.id} · "${r.signature}"`);
    else console.log(`  ✗ ${r.kind} · ${r.err}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
