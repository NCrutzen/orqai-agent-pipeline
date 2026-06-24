"use server";

// Phase 132 Plan 03 Task 3 (FWD-09, D-08) — STUB. Filled incrementally per
// failing test (TDD). See the test file for the contract being driven.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import {
  loadRoutingDestinations,
  resolveRoutingDestination,
} from "@/lib/swarms/registry";
import { recordForwardState } from "@/lib/automations/info-routing/forward-state";

// Phase 65 learning dae6276 — never alias inngest.send. Inline-call via this
// cast each time. The cast accepts the dynamic-name `pipeline/forward.requested`
// shape with operator metadata (operator_forced) the typed Events map omits.
type DynamicSend = (p: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

type Confidence = "low" | "medium" | "high";

// The persisted verdict shape read off coordinator_runs.decision_details.routing
// (mirrors RoutingVerdict — re-declared, not imported, to keep this server-action
// file decoupled from the automations module's full surface).
interface PersistedVerdict {
  bucket: string;
  brand: string | null;
  target_mailbox: string | null;
  confidence: Confidence;
  dedup: {
    status: "routable" | "already_addressed";
    matched_layer: string | null;
  };
  unrouted: boolean;
  routing_version: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read the persisted routing verdict for a coordinator run. Returns null when the
 * run has no routing verdict (never throws).
 */
async function readPersistedVerdict(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
): Promise<PersistedVerdict | null> {
  const { data, error } = await admin
    .from("coordinator_runs")
    .select("decision_details")
    .eq("run_id", runId)
    .maybeSingle();
  if (error || !isRecord(data)) return null;
  const dd = isRecord(data.decision_details) ? data.decision_details : null;
  if (!dd || !isRecord(dd.routing)) return null;
  return dd.routing as unknown as PersistedVerdict;
}

export interface RoutingActionOk {
  ok: true;
}
export interface RoutingActionErr {
  ok: false;
  error: string;
  code?: string;
}
export type RoutingActionResult = RoutingActionOk | RoutingActionErr;

export interface RerouteBucketInput {
  email_id: string;
  swarm_type: string;
  run_id: string;
  new_bucket: string;
  brand: string | null;
  audit_note: string;
}
export interface ForwardNowInput {
  email_id: string;
  swarm_type: string;
  run_id: string;
}
export interface DontForwardInput {
  email_id: string;
  swarm_type: string;
  audit_note: string;
}

export async function rerouteBucket(
  input: RerouteBucketInput,
): Promise<RoutingActionResult> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };

  if (!input.new_bucket || input.new_bucket.trim().length === 0) {
    return { ok: false, error: "new_bucket required", code: "invalid_bucket" };
  }
  if (!input.audit_note || input.audit_note.trim().length === 0) {
    return {
      ok: false,
      error: "audit-note required for re-route",
      code: "audit_required",
    };
  }

  const admin = createAdminClient();

  // Re-resolve the target via the registry — an unmatched bucket → null target
  // (not forwardable), preserving cross-tenant safety (T-132-11).
  const destinations = await loadRoutingDestinations(admin, input.swarm_type);
  const { matched, target_mailbox } = resolveRoutingDestination(
    destinations,
    input.new_bucket,
    input.brand,
  );

  // Preserve routing_version + confidence/dedup from the prior verdict for audit
  // continuity.
  const prior = await readPersistedVerdict(admin, input.run_id);

  // A new operator-sourced verdict (RESEARCH OQ-3) — NOT a patch. unrouted is
  // true only when the new bucket did not resolve to any active row.
  const newVerdict: PersistedVerdict & {
    operator_sourced: true;
    operator_id: string;
  } = {
    bucket: matched ? input.new_bucket : "unrouted",
    brand: matched ? input.brand : null,
    target_mailbox: matched ? target_mailbox : null,
    confidence: prior?.confidence ?? "high",
    dedup: prior?.dedup ?? { status: "routable", matched_layer: null },
    unrouted: !matched,
    routing_version: prior?.routing_version ?? "operator-reroute",
    operator_sourced: true,
    operator_id: user.id,
  };

  const { error } = await admin
    .from("coordinator_runs")
    .update({ decision_details: { routing: newVerdict } })
    .eq("run_id", input.run_id);
  if (error) {
    return { ok: false, error: `reroute persist failed: ${error.message}` };
  }

  return { ok: true };
}

export async function forwardNow(
  input: ForwardNowInput,
): Promise<RoutingActionResult> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };

  const admin = createAdminClient();
  const verdict = await readPersistedVerdict(admin, input.run_id);
  if (!verdict) {
    return {
      ok: false,
      error: "no routing verdict for this run",
      code: "no_verdict",
    };
  }

  // HARD-REFUSE before any send (OQ-3 / T-132-10 + T-132-12): forward-now still
  // honors dedup and never forwards algemeen (null target) or unrouted.
  if (verdict.unrouted) {
    return {
      ok: false,
      error: "cannot forward an unrouted message",
      code: "refused_unrouted",
    };
  }
  if (verdict.target_mailbox === null) {
    return {
      ok: false,
      error: "cannot forward — message stays in info@ (no target)",
      code: "refused_stays",
    };
  }
  if (verdict.dedup.status === "already_addressed") {
    return {
      ok: false,
      error: "cannot forward — already addressed (dedup)",
      code: "refused_dedup",
    };
  }

  // Inline-emit (CLAUDE.md learning dae6276 — preserve this-binding; never alias).
  // Bypasses the per-bucket release gate (operator_forced), but the worker's
  // dedup + forward_state idempotency still apply. swarm_type is DATA only.
  try {
    await (inngest.send as unknown as DynamicSend)({
      name: "pipeline/forward.requested",
      data: {
        swarm_type: input.swarm_type,
        run_id: input.run_id,
        email_id: input.email_id,
        operator_forced: true,
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: `forward kickoff failed: ${(e as Error).message}`,
      code: "send_failed",
    };
  }

  return { ok: true };
}

export async function dontForward(
  input: DontForwardInput,
): Promise<RoutingActionResult> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };

  if (!input.audit_note || input.audit_note.trim().length === 0) {
    return {
      ok: false,
      error: "audit-note required to suppress",
      code: "audit_required",
    };
  }

  const admin = createAdminClient();
  try {
    await recordForwardState(admin, {
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      status: "skipped",
    });
  } catch (e) {
    return { ok: false, error: `suppress failed: ${(e as Error).message}` };
  }

  return { ok: true };
}
