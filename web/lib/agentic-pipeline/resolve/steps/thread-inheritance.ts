// Phase 90 (P0 resolver substrate) — Step module: thread_inheritance.
//
// 1:1 VERBATIM port of resolve-debtor.ts Layer 1 (:116-157). D-01/D-02.
//
// Most-recent prior label on the same conversation_id wins
// (customer_account_id ?? debtor_id). method:"thread_inheritance",
// confidence:"high". The §0.10 A5 inversion (inheritance is Layer-1/high)
// is PRESERVED ON PURPOSE — do NOT demote it (that is P1 / RESL-14).
//
// Replay-safety: this runs inside the worker's step.run("resolve-debtor", …);
// NEVER add a nested step.run here (CLAUDE.md Inngest rules).

import { createAdminClient } from "@/lib/supabase/admin";
import type { ResolveArgs, ResolveResult } from "../engine";

/**
 * Layer 1 — thread inheritance (D-00). Returns a ResolveResult when a prior
 * label on the same conversation carries an account id, else `null` to fall
 * through to the next precedence step.
 */
export async function runThreadInheritance(
  args: ResolveArgs,
): Promise<ResolveResult | null> {
  const admin = createAdminClient();

  if (args.conversation_id) {
    const { data: prior } = await admin
      .schema("debtor")
      .from("email_labels")
      // Phase 82.9 — include id so we can persist prior_email_label_id in inputs.
      .select("id, customer_account_id, debtor_id, debtor_name")
      .eq("conversation_id", args.conversation_id)
      .or("customer_account_id.not.is.null,debtor_id.not.is.null")
      .in("status", ["labeled", "dry_run"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priorRow = prior as
      | {
          id?: string | null;
          customer_account_id?: string | null;
          debtor_id?: string | null;
          debtor_name?: string | null;
        }
      | null;
    const accountId =
      priorRow?.customer_account_id ?? priorRow?.debtor_id ?? null;
    if (accountId) {
      // Phase 82.9 — populate discriminated inputs for thread_inheritance.
      return {
        method: "thread_inheritance",
        customer_account_id: accountId,
        customer_name: priorRow?.debtor_name ?? null,
        confidence: "high",
        inputs: {
          kind: "thread_inheritance",
          prior_email_label_id: priorRow?.id ?? "",
          conversation_id: args.conversation_id,
        },
      };
    }
  }

  return null;
}
