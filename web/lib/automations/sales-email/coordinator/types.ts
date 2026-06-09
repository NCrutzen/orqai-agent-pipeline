import { z } from "zod";
import { SWARM_INTENTS_BY_SWARM } from "../../debtor-email/coordinator/intent.generated";
import { entityRelationshipField } from "../../debtor-email/coordinator/intent-output-shared";

// ---------------------------------------------------------------------------
// Sales Stage 3 output contract (Phase 113, greenfield V1).
//
// Mirrors the debtor V3 ranked-intent shape (web/lib/automations/debtor-email/
// coordinator/types.ts → intentAgentOutputSchemaV3) so the shared coordinator +
// Bulk Review read path consume it unchanged, with TWO deliberate differences:
//   1. The ranked entry drops the debtor-specific document-reference and
//      doc-subtype fields. Sales ranked entry = { intent, confidence, reasoning }.
//   2. ONE additive, nullable, swarm-agnostic axis: entity_relationship (D-05),
//      imported from the shared intent-output-shared.ts.
//
// The intent enum is sourced from the ONE shared codegen file
// (intent.generated.ts → SWARM_INTENTS_BY_SWARM), keyed by swarm. We do NOT
// create a sales-pathed intent.generated.ts (Pitfall 3 — there is exactly one).
// ---------------------------------------------------------------------------

const SALES_INTENT = SWARM_INTENTS_BY_SWARM[
  "sales-email" as keyof typeof SWARM_INTENTS_BY_SWARM
] as readonly string[] | undefined;

// The "sales-email" key is ABSENT in the registry/codegen until Plan 03 seeds
// swarm_intents + reruns `npm run codegen`. `z.enum` throws at MODULE LOAD on an
// empty tuple, so guard with a single-value placeholder until the real enum
// flows in automatically post-Plan-03 + codegen (no code change needed here).
const SALES_INTENT_ENUM = (
  SALES_INTENT && SALES_INTENT.length > 0 ? SALES_INTENT : ["other"]
) as readonly [string, ...string[]];

export const SALES_CONFIDENCE = ["low", "medium", "high"] as const;
export const SALES_LANGUAGE = ["nl", "en", "de", "fr"] as const;
export const SALES_URGENCY = ["low", "normal", "high"] as const;

export const SALES_INTENT_VERSION = "2026-06-05.v1" as const;

// Ranked entry — debtor V3 shape minus the two debtor-specific doc fields.
export const rankedSalesIntentEntry = z.object({
  intent: z.enum(SALES_INTENT_ENUM),
  confidence: z.enum(SALES_CONFIDENCE),
  reasoning: z.string().max(300),
});

export const salesIntentOutputSchema = z.object({
  ranked: z.array(rankedSalesIntentEntry).min(1).max(5),
  language: z.enum(SALES_LANGUAGE),
  urgency: z.enum(SALES_URGENCY),
  intent_version: z.literal(SALES_INTENT_VERSION),
  intent_proposal: z
    .string()
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/)
    .nullable(),
  proposal_reason: z.string().max(280).nullable(),
  // D-05 — additive, nullable, swarm-agnostic axis (shared file).
  entity_relationship: entityRelationshipField,
});

export type RankedSalesIntentEntry = z.infer<typeof rankedSalesIntentEntry>;
export type SalesIntentOutput = z.infer<typeof salesIntentOutputSchema>;
