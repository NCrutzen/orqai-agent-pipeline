// Phase 60-08 (D-04, D-22). Pure agreement-mapping module.
//
// Encodes the predicted-category → LLM-category/intent agreement table approved
// 2026-04-29 in 60-08-PLAN.md <agreement_table>. The corpus-backfill function
// uses isAgreement() to compute n/agree per matchedRule against the existing
// 6,114-email LLM corpus (debtor.email_analysis × email_pipeline.emails).
//
// Per D-22, web/lib/debtor-email/classify.ts is read-only — this module is the
// auditable bridge between classify()'s output category and the LLM-judge
// labels stored in debtor.email_analysis.
//
// Pure function: no side effects, deterministic, fully unit-tested.

import type { Category } from "@/lib/debtor-email/classify";

export const AGREEMENT_MAP: Record<Category, { categories: string[]; intents: string[] }> = {
  // LLM doesn't split OOO from generic auto_reply — coarse mapping.
  // Spot-check (Phase 60-08 Task 3) is the safety net before promotion.
  auto_reply: { categories: ["auto_reply"], intents: ["auto_reply"] },
  ooo_temporary: { categories: ["auto_reply"], intents: ["auto_reply"] },
  ooo_permanent: { categories: ["auto_reply"], intents: ["auto_reply"] },
  payment_admittance: { categories: ["payment"], intents: ["payment_confirmation"] },
  // Catch-all + hard-blocks. Never promotable; isAgreement always returns false.
  unknown: { categories: [], intents: [] },
};

/**
 * Returns true iff the predicted category agrees with the LLM-judge labels
 * per the AGREEMENT_MAP. Null/undefined LLM fields are treated as "no signal"
 * (no agreement). The "unknown" predicted category never agrees — it's the
 * catch-all and explicit hard-block bucket.
 */
export function isAgreement(
  predicted: Category,
  llmCategory: string | null | undefined,
  llmIntent: string | null | undefined,
): boolean {
  if (predicted === "unknown") return false;
  const map = AGREEMENT_MAP[predicted];
  if (!map) return false;
  if (llmCategory && map.categories.includes(llmCategory)) return true;
  if (llmIntent && map.intents.includes(llmIntent)) return true;
  return false;
}
