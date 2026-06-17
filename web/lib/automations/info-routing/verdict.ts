// Phase 131 Plan 03 Task 1 (ROUTE-04 / ROUTE-06) — the 6-field routing verdict
// builder for the info-routing Stage-3 router.
//
// This is a PURE, IO-free function. It takes:
//   1. the parsed agent output (or the {unrouted:true} marker from
//      parseAgentOutputOrUnrouted in coordinator-schema.ts — Plan 02),
//   2. the active routing_destinations rows (loadRoutingDestinations — Plan 01),
//   3. the configured unrouted threshold (swarms.resolution_config
//      .routing_unrouted_threshold, default 0.6 = require >= medium),
//   4. an OPTIONAL dedup result (Plan 04 supplies the real two-layer dedup; this
//      plan defaults it to {status:'routable', matched_layer:null}).
//
// It returns the RESEARCH §Discretion 2 verdict shape:
//   { bucket, brand, target_mailbox, confidence, dedup:{status,matched_layer},
//     unrouted, routing_version }
//
// Unrouted gate (ROUTE-06): the verdict is unrouted when ANY of
//   - the input is the {unrouted:true} marker (invalid/empty agent output), OR
//   - the categorical confidence maps BELOW the threshold, OR
//   - no active (destination_key===bucket AND brand===brand) row exists
//     (no-match — never a forced bucket).
// In all three cases the verdict is the explicit unrouted shape (bucket=
// 'unrouted', brand=null, target_mailbox=null, unrouted=true) — queryable via
// coordinator_runs.decision_details->routing->>'bucket' = 'unrouted'.
//
// Never throws: the {unrouted:true} marker is handled as a normal input.

import type { AgentOutputParseResult } from "./coordinator-schema";
import type { RoutingDestinationRow } from "../../swarms/types";
import { resolveRoutingDestination, UNROUTED_BUCKET } from "../../swarms/registry";

// Audit / future schema-evolution stamp. Bump on any verdict-shape change.
export const ROUTING_VERSION = "2026-06-17.v1";

// Categorical confidence → numeric, mirroring the debtor/sales pattern.
// low/medium/high → 0.33/0.66/1.0; the verdict is routable when the mapped
// value is >= the configured threshold (default 0.6 → requires >= medium).
const CONFIDENCE_NUMERIC: Record<"low" | "medium" | "high", number> = {
  low: 0.33,
  medium: 0.66,
  high: 1.0,
};

export type RoutingDedupStatus = "routable" | "already_addressed";
export type RoutingDedupLayer = null | "to_cc" | "message_id" | "conversation";

export interface RoutingDedup {
  status: RoutingDedupStatus;
  matched_layer: RoutingDedupLayer;
}

export interface RoutingVerdict {
  bucket: string; // destination_key, or 'unrouted'
  brand: string | null; // smeba | fire-control | berki | null when unrouted
  target_mailbox: string | null; // resolved; null when unrouted
  confidence: "low" | "medium" | "high";
  dedup: RoutingDedup;
  unrouted: boolean; // true when below threshold OR no match OR invalid output
  routing_version: string;
}

// The default dedup result for THIS plan. Plan 04 supplies the real two-layer
// dedup result via the optional `dedup` parameter without a signature break.
const DEFAULT_DEDUP: RoutingDedup = { status: "routable", matched_layer: null };

/**
 * Build the explicit unrouted verdict (ROUTE-06). bucket='unrouted', brand and
 * target_mailbox null. The confidence is carried through for audit (so an
 * unrouted-because-low-confidence verdict still records the agent's confidence),
 * defaulting to 'low' for the invalid-output case.
 */
function unroutedVerdict(
  confidence: "low" | "medium" | "high",
  dedup: RoutingDedup,
): RoutingVerdict {
  return {
    bucket: UNROUTED_BUCKET,
    brand: null,
    target_mailbox: null,
    confidence,
    dedup,
    unrouted: true,
    routing_version: ROUTING_VERSION,
  };
}

/**
 * Build the 6-field routing verdict from the parsed agent output.
 *
 * @param parsed       the result of parseAgentOutputOrUnrouted (Plan 02)
 * @param destinations the active routing_destinations rows (Plan 01)
 * @param threshold    the unrouted floor (swarms.resolution_config
 *                     .routing_unrouted_threshold; default 0.6 = require >= medium)
 * @param dedup        OPTIONAL — Plan 04 supplies the real dedup result; defaults
 *                     to {status:'routable', matched_layer:null}
 */
export function buildRoutingVerdict(
  parsed: AgentOutputParseResult,
  destinations: RoutingDestinationRow[],
  threshold: number,
  dedup: RoutingDedup = DEFAULT_DEDUP,
): RoutingVerdict {
  // (1) invalid/empty agent output → unrouted, never throws.
  if (parsed.unrouted) {
    return unroutedVerdict("low", dedup);
  }

  const { bucket, brand, confidence } = parsed.value;

  // (2) the agent EXPLICITLY chose the framework triage sentinel → unrouted.
  // Short-circuit BEFORE resolving so the `unrouted` registry row (a matched
  // null-target row) is never consulted — explicit triage is "don't know", not
  // a "classified, no forward" outcome.
  if (bucket === UNROUTED_BUCKET) {
    return unroutedVerdict(confidence, dedup);
  }

  // (3) below the confidence floor → unrouted (not a forced bucket).
  if (CONFIDENCE_NUMERIC[confidence] < threshold) {
    return unroutedVerdict(confidence, dedup);
  }

  // (4) resolve (bucket×brand) against the registry. Three outcomes:
  //   - NOT matched → unrouted (no active row; the agent's guess is unroutable).
  //   - matched + target_mailbox === null → CLASSIFIED, NO FORWARD ("stays"):
  //     keep the agent's bucket + brand, target null, unrouted=false. This is a
  //     valid classification that simply does not forward (e.g. info-routing
  //     `algemeen` — mail stays in info@). The Phase-132 forwarder skips a null
  //     target. SWARM-AGNOSTIC: no bucket-name literal here — the behaviour is
  //     driven purely by registry data (a matched row with a null target).
  //   - matched + target_mailbox non-null → routable forward (unchanged).
  const { matched, target_mailbox } = resolveRoutingDestination(
    destinations,
    bucket,
    brand,
  );
  if (!matched) {
    return unroutedVerdict(confidence, dedup);
  }

  // Matched (target may be null for a no-forward "stays" bucket).
  return {
    bucket,
    brand,
    target_mailbox,
    confidence,
    dedup,
    unrouted: false,
    routing_version: ROUTING_VERSION,
  };
}
