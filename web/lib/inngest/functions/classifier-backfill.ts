// Phase 60-02 (D-04). One-shot Inngest function: seeds the 6 historical
// debtor-email rules into public.classifier_rules with computed Wilson CI-lo
// and status='promoted'. Idempotent via ON CONFLICT(swarm_type,rule_key).
//
// Trigger: send the `classifier/backfill.run` event manually via the Inngest
// dashboard or CLI. The function is event-only (no cron) so it never re-fires
// on its own.
//
// The 3 small-N rules (N=9, N=8, N=2) get a notes value documenting that they
// are promoted via the payment_admittance category-rollup (N=415, CI-lo=0.991)
// per CONTEXT D-04 / RESEARCH §Backfill seed Option B.

import { inngest } from "@/lib/inngest/client";
import { wilsonCiLower } from "@/lib/classifier/wilson";
import { createAdminClient } from "@/lib/supabase/admin";

interface SeedRow {
  rule_key: string;
  n: number;
  agree: number;
  notes?: string;
}

const SEEDS: SeedRow[] = [
  { rule_key: "subject_paid_marker", n: 169, agree: 169 },
  { rule_key: "payment_subject", n: 151, agree: 151 },
  { rule_key: "payment_sender+subject", n: 79, agree: 79 },
  {
    rule_key: "payment_system_sender+body",
    n: 9,
    agree: 9,
    notes: "promoted via payment_admittance category-rollup N=415",
  },
  {
    rule_key: "payment_sender+hint+body",
    n: 8,
    agree: 8,
    notes: "promoted via payment_admittance category-rollup N=415",
  },
  {
    rule_key: "payment_sender+body",
    n: 2,
    agree: 2,
    notes: "promoted via payment_admittance category-rollup N=415",
  },
];

export const classifierBackfill = inngest.createFunction(
  { id: "classifier/backfill", retries: 1 },
  { event: "classifier/backfill.run" },
  async ({ step }) => {
    return step.run("seed-classifier-rules", async () => {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      for (const s of SEEDS) {
        const ci_lo = wilsonCiLower(s.n, s.agree);
        const { error } = await admin.from("classifier_rules").upsert(
          {
            swarm_type: "debtor-email",
            rule_key: s.rule_key,
            kind: "regex",
            status: "promoted",
            n: s.n,
            agree: s.agree,
            ci_lo,
            last_evaluated: now,
            promoted_at: now,
            notes: s.notes ?? null,
          },
          { onConflict: "swarm_type,rule_key" },
        );
        if (error) {
          throw new Error(
            `[classifier/backfill] upsert failed for ${s.rule_key}: ${error.message}`,
          );
        }
      }
      return { seeded: SEEDS.length };
    });
  },
);
