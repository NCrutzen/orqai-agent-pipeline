// Phase 89 (D-03). One-shot Inngest function: eager-seeds candidate
// llm:{category_key}:high rows into public.classifier_rules for every
// (active swarm × enabled noise category != 'unknown'). Idempotent via
// ON CONFLICT(swarm_type, rule_key) DO NOTHING.
//
// Trigger: send the `classifier/llm-rules-seed.run` event from the Inngest
// dashboard or via inngest.send(). Event-only (no cron). RE-FIRE any time a
// new swarm is added to public.swarms or a new noise category is added to
// public.swarm_noise_categories — otherwise that combination's LLM verdicts
// will accumulate telemetry under a rule_key that has no candidate row, and
// the promotion cron's UPDATE will be a no-op (RESEARCH Pitfall 4 / OQ3).
//
// CRITICAL: filter category_key !== 'unknown'. The 'unknown' bucket has
// action='swarm_dispatch' (hands off to Stage 2/3), never 'categorize_archive'
// — promoting llm:unknown:high would silently auto-archive every uncertain
// email (RESEARCH Anti-Patterns / A6).
//
// Hard-separation discipline (RFC docs/agentic-pipeline/stage-1-regex.md):
// keys minted here come exclusively from swarm_noise_categories. Never
// merge swarm_intents (Stage 3) into the llm:*:* namespace.
//
// If Stage1OutputSchema.confidence ever gains a new level beyond 'high',
// extend CONFIDENCE_LEVELS and re-fire (RESEARCH Pitfall 5).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";

const CONFIDENCE_LEVELS = ["high"] as const;

export const classifierLLMRulesSeed = inngest.createFunction(
  { id: "classifier/llm-rules-seed", retries: 1 },
  { event: "classifier/llm-rules-seed.run" },
  async ({ step }) => {
    return step.run("seed-llm-rules", async () => {
      const admin = createAdminClient();
      const now = new Date().toISOString();

      const { data: swarmRows, error: swarmErr } = await admin
        .from("swarms")
        .select("swarm_type")
        .eq("enabled", true);
      if (swarmErr) {
        throw new Error(`swarms load failed: ${swarmErr.message}`);
      }

      let seeded = 0;
      for (const sw of swarmRows ?? []) {
        const cats = await loadSwarmNoiseCategories(admin, sw.swarm_type);
        for (const cat of cats.filter(
          (c) => c.category_key !== "unknown" && c.enabled !== false,
        )) {
          for (const conf of CONFIDENCE_LEVELS) {
            const rule_key = `llm:${cat.category_key}:${conf}`;
            const { error } = await admin.from("classifier_rules").upsert(
              {
                swarm_type: sw.swarm_type,
                rule_key,
                kind: "agent_intent",
                status: "candidate",
                n: 0,
                agree: 0,
                ci_lo: null,
                last_evaluated: null,
                promoted_at: null,
                notes: "Phase 89 — LLM 2nd-pass noise classifier",
              },
              { onConflict: "swarm_type,rule_key" },
            );
            if (error) {
              throw new Error(
                `[classifier/llm-rules-seed] upsert failed for ${sw.swarm_type}/${rule_key}: ${error.message}`,
              );
            }
            seeded++;
          }
        }
      }
      return { seeded, at: now };
    });
  },
);
