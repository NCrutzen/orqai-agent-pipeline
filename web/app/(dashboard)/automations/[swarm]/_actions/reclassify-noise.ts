"use server";

// Phase 76 Plan 05 — Reclassify-as-noise Server Action.
//
// D-03 (LOCKED): operator declares the email is actually noise (the regex
// Pass 1 + LLM 2nd-pass both missed). Emits an axis-1 override
// (`debtor-email/override.submitted` with `axis:'stage_1_category'`) which
// the existing override handler routes via classifier-verdict-worker →
// categorize_archive (Outlook label + archive + iController cleanup).
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/stage-1-regex.md):
//   - Stage 1 = noise filter (swarm_noise_categories ONLY).
//   - Stage 3 = intent classifier (swarm_intents ONLY).
//   Hard separation: this Server Action operates on swarm_noise_categories
//   exclusively. It does NOT read or reference swarm_intents. The 'unknown'
//   key is a Stage 1 noise reset; it is NOT a Stage 3 fallback.
//
// W3 (LOCKED): the canonical field on swarm_noise_categories rows is
// `category_key` (web/lib/swarms/types.ts:86). There is NO `noise_key` field.
// Validation reads `c.category_key === args.noiseKey` exclusively. Never use
// `c.noise_key || c.category_key` — the registry has one field name.
//
// CONTEXT.md deferred-ideas: 'unknown' is excluded from the operator
// dropdown. Defensively rejected here too — sending 'unknown' would be a
// "back through pipeline" signal that overlaps with Replay (one path per
// outcome).
//
// Security gates:
//   - T-76-05-02 (T): noiseKey validated against swarm_noise_categories.
//   - T-76-05-03 (S): swarmType validated against swarms registry.
//   - T-76-05-04 (E/IDOR): compound filter on UPDATE.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function reclassifyAsNoise(args: {
  kanbanRowId: string;
  swarmType: string;
  emailId: string;
  noiseKey: string;
  // Typically 'unknown' for emails that escaped Stage 1 to reach Stage 3.
  originalStage1Decision: string;
  // Nullable per R-3 (legacy rows may not have a Stage 1 pipeline_events row).
  originalEventId: string | null;
  operatorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !args.kanbanRowId ||
    !args.swarmType ||
    !args.emailId ||
    !args.noiseKey ||
    !args.operatorId
  ) {
    return { ok: false, error: "missing args" };
  }
  // CONTEXT.md deferred-ideas: 'unknown' is excluded from the dropdown;
  // reject defensively here too.
  if (args.noiseKey === "unknown") {
    return { ok: false, error: "unknown not allowed" };
  }

  const admin = createAdminClient();

  // T-76-05-03: validate swarm against registry.
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };

  // T-76-05-02: validate noise_key against registry. W3 single-field rule —
  // the canonical field is `category_key`; no `noise_key` fallback.
  const categories = await loadSwarmNoiseCategories(admin, args.swarmType);
  const valid = categories.some((c) => c.category_key === args.noiseKey);
  if (!valid) return { ok: false, error: "unknown noise key" };

  // CLAUDE.md Phase 65: never destructure inngest.send (loses `this`-binding).
  // Call inline with the cast applied to the call expression itself.
  await (inngest.send as unknown as SendFn)({
    name: "debtor-email/override.submitted",
    data: {
      axis: "stage_1_category",
      email_id: args.emailId,
      original_event_id: args.originalEventId,
      original_decision: args.originalStage1Decision,
      decision: args.noiseKey,
      eval_type: "regression",
      operator_id: args.operatorId,
    },
  });

  // Close Kanban row with compound filter (IDOR safety).
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "row not found or already closed" };
  }

  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true };
}
