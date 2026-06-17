// Phase 131 Plan 02 Task 1 (ROUTE-03) — closed-list Zod gate + Orq json_schema
// for the `info-routing-coordinator` Stage-3 destination classifier.
//
// This module validates ONLY the agent's raw output (bucket + brand + confidence
// + reasoning). It does NOT build the full 6-field routing verdict (resolved
// mailbox, dedup status, unrouted flag) — that is Plan 03's verdict.ts. Keeping
// the verdict out of here means the agent-output contract has exactly one job:
// prove the model returned a closed-list destination, or fall back to unrouted.
//
// SINGLE SOURCE OF TRUTH: the bucket enum is the codegen'd
// DESTINATION_KEYS_BY_SWARM["info-routing"] from
// web/lib/swarms/routing-destinations.generated.ts (Plan 01), NOT a hand-written
// list. The SAME array feeds (a) the Zod z.enum below and (b) the Orq agent's
// strict json_schema `bucket.enum` (INFO_ROUTING_AGENT_JSON_SCHEMA), so TS ⇄ DB ⇄
// Orq stay in lockstep. Adding a bucket = INSERT a routing_destinations row +
// `npm run codegen` + re-PATCH the agent — never an edit here.
//
// Orq strict-mode rules (CLAUDE.md / learning 3970bad9): nullable brand uses
// `anyOf` with {"type":"null"}, NEVER the ["string","null"] array-shorthand.

import { z } from "zod";
import { DESTINATION_KEYS_BY_SWARM } from "../../swarms/routing-destinations.generated";

// The closed bucket list for info-routing, sourced from the Plan-01 codegen.
// This includes the `unrouted` sentinel key (the agent MAY explicitly return it;
// invalid/empty output also collapses to the unrouted OUTCOME below).
export const INFO_ROUTING_BUCKET_KEYS = DESTINATION_KEYS_BY_SWARM["info-routing"];

// The brand axis is a fixed three-tenant list (charter §2). Nullable when no
// brand signal applies (e.g. an `algemeen` mail or an unrouted outcome).
export const INFO_ROUTING_BRANDS = ["smeba", "fire-control", "berki"] as const;

export const INFO_ROUTING_CONFIDENCE = ["low", "medium", "high"] as const;

// z.enum needs a non-empty readonly tuple. The codegen file always emits the
// 8-key info-routing array (seeded + unrouted sentinel), so the cast is safe;
// guard defensively so an empty array would degrade to a single-value tuple
// rather than throw at module load.
const BUCKET_ENUM = (
  INFO_ROUTING_BUCKET_KEYS.length > 0
    ? INFO_ROUTING_BUCKET_KEYS
    : ["unrouted"]
) as readonly [string, ...string[]];

export const infoRoutingAgentOutputSchema = z.object({
  bucket: z.enum(BUCKET_ENUM),
  brand: z.enum(INFO_ROUTING_BRANDS).nullable(),
  confidence: z.enum(INFO_ROUTING_CONFIDENCE),
  reasoning: z.string(),
});

export type InfoRoutingAgentOutput = z.infer<typeof infoRoutingAgentOutputSchema>;

// ---------------------------------------------------------------------------
// Parse-or-unrouted: the closed-list gate the coordinator applies to the agent
// response. On ANY validation failure (off-list bucket, missing field, malformed
// type, null/empty input) it returns the UNROUTED_OUTCOME — it NEVER throws
// (ROUTE-03 acceptance: invalid/empty output yields the unrouted outcome).
// ---------------------------------------------------------------------------

export type AgentOutputParseResult =
  | { unrouted: false; value: InfoRoutingAgentOutput }
  // `reason` is an OPTIONAL audit string (e.g. the invoke/parse error message,
  // truncated) so a transport-failure unrouted is debuggable. buildRoutingVerdict
  // only reads `.unrouted`, so the extra field is shape-compatible.
  | { unrouted: true; reason?: string };

// A frozen singleton so callers can identity-compare and so the marker is
// immutable. The actual unrouted VERDICT (bucket='unrouted', mailbox=null, …)
// is built in Plan 03's verdict.ts; this is just the gate's failure signal.
export const UNROUTED_OUTCOME: { unrouted: true } = Object.freeze({
  unrouted: true,
});

export function parseAgentOutputOrUnrouted(raw: unknown): AgentOutputParseResult {
  const result = infoRoutingAgentOutputSchema.safeParse(raw);
  if (!result.success) {
    return UNROUTED_OUTCOME;
  }
  return { unrouted: false, value: result.data };
}

// BUG 2 (CR-01) — build an unrouted marker for a TRANSPORT failure (invoke or
// JSON.parse THROWS inside invokeOrqAgent BEFORE it can return raw, e.g. empty
// output text, non-JSON body, timeout). The coordinator's classify-routing step
// wraps invoke+parse in try/catch and calls this on ANY thrown error so an
// empty/non-JSON/timeout response degrades to unrouted (→ human triage) instead
// of crashing the coordinator. The reason is carried for debuggability.
export function unroutedFromError(reason: string): AgentOutputParseResult {
  return { unrouted: true, reason: reason.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// The strict Orq `response_format` json_schema for the info-routing-coordinator
// agent. Consumed by web/scripts/orq/manage-info-routing-coordinator.ts (Task 2)
// so the agent's bucket enum and the Zod bucket enum read the SAME
// INFO_ROUTING_BUCKET_KEYS source — no drift. Nullable `brand` uses `anyOf`
// (NEVER the ["string","null"] shorthand — 3970bad9). Single-value? use enum,
// not const (Orq strict rejects const).
// ---------------------------------------------------------------------------

export const INFO_ROUTING_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bucket", "brand", "confidence", "reasoning"],
  properties: {
    bucket: { type: "string", enum: [...INFO_ROUTING_BUCKET_KEYS] },
    brand: {
      anyOf: [
        { type: "string", enum: [...INFO_ROUTING_BRANDS] },
        { type: "null" },
      ],
    },
    confidence: { type: "string", enum: [...INFO_ROUTING_CONFIDENCE] },
    reasoning: { type: "string", maxLength: 200 },
  },
} as const;

export const INFO_ROUTING_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "info_routing_destination",
    strict: true,
    schema: INFO_ROUTING_OUTPUT_JSON_SCHEMA,
  },
} as const;
