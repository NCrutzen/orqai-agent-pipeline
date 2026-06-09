// Phase 113 Plan 02 (Q1 seam) — swarm-keyed Stage 3 OUTPUT-schema registry.
//
// This is the swarm-agnostic lookup that replaces a literal
// `if (swarm_type === "sales-email")` branch in the shared coordinator. The
// coordinator reads the per-swarm Orq AGENT KEY from the DB registry
// (`swarms.stage3_coordinator_agent_key`) at runtime; this map holds the one
// thing the DB registry does NOT yet carry — the per-swarm OUTPUT SCHEMA used
// to Zod-gate the agent response.
//
// Onboarding a third swarm = ONE entry here + a swarm_intents/registry row.
// The coordinator never names a swarm. There is NO sales import in the
// coordinator: the sales schema is imported HERE (a registry file under the
// shared debtor coordinator path — Pitfall 3, ONE shared coordinator location),
// keeping the coordinator itself free of any per-swarm literal/import.
//
// Fail-safe: an unknown swarm_type, or a swarm carrying a registry agent key
// but no entry here, falls back to the debtor schema at the lookup site (the
// codegen invariant means sales always has an entry once Plan 03 seeds it).

import type { ZodTypeAny } from "zod";
import { intentAgentOutputSchemaAny } from "./types";
import { salesIntentOutputSchema } from "../../sales-email/coordinator/types";

export type IntentSchemaRegistryEntry = {
  /** The Zod gate the coordinator applies to the per-swarm agent response. */
  schema: ZodTypeAny;
};

export const INTENT_SCHEMA_BY_SWARM: Record<string, IntentSchemaRegistryEntry> = {
  // Debtor V2/V3 tolerant discriminated union (sniffs intent_version). Same
  // gate the debtor invoke applies by default — byte-neutral.
  "debtor-email": { schema: intentAgentOutputSchemaAny },
  // Sales greenfield V1 single-literal gate (Plan 01 contract).
  "sales-email": { schema: salesIntentOutputSchema },
} as const;

/**
 * Resolve the output schema for a swarm_type, falling back to the debtor schema
 * for an unknown/misconfigured swarm (fail-safe — a swarm with a registry agent
 * key but no schema-map entry is a misconfiguration the caller logs).
 */
export function intentSchemaForSwarm(swarmType: string): ZodTypeAny {
  return (
    INTENT_SCHEMA_BY_SWARM[swarmType] ?? INTENT_SCHEMA_BY_SWARM["debtor-email"]
  ).schema;
}
