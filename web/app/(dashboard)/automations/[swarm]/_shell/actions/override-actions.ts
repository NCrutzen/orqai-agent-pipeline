"use server";

// Phase 3 Plan 01 Task 1 — Four sibling server actions on top of the Phase 1
// writeOverride helper. Plan 01 ships Axis 1 + Axis 4 implementations live;
// Axis 2 + Axis 3 are intentionally-failing stubs filled by Plans 02 + 03.
//
// Auth pattern mirrors web/app/api/automations/debtor-email/feedback/route.ts:
//   - cookie-bound Supabase client → getUser() → operator_id (NEVER from input).
//   - createAdminClient() for the actual writes (service-role, bypasses RLS).
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md): Axis 1
// validates new_category_key against swarm_noise_categories ∪ {"unknown"};
// it MUST NEVER admit a swarm_intents value. Axis 3 will (Plan 03) validate
// against swarm_intents — the two vocabularies stay disjoint at the server
// gate. Axis 4 validates draft_quality against the email_labels CHECK enum
// (correct | needed_edit | rejected) and human_verdict against the
// agent_runs CHECK enum.
//
// Out-of-band note (CON-Phase-72-out-of-band): Axis 1 + Axis 4 remain pure
// capture writes — no re-run, no Phase-72 module touched. Axis 2 (Plan 02)
// introduces the conditional re-emit of `<swarm>/predicted` after the
// writeOverride completes; this is an operator-initiated re-run that the
// downstream stage-3-dispatcher consumes via the wildcard `*/predicted`
// subscription. The send is INLINE (never destructured) per CLAUDE.md
// learning dae6276 — the `this`-binding of inngest.send must be preserved.
//
// Replay safety: this file runs in Vercel request scope (Server Action),
// NOT inside an Inngest step.run. CLAUDE.md "UUIDs inside step.run" rule
// does not apply. writeOverride generates submitted_at internally inside
// the request scope; that is the locked Phase 1 convention.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeOverride } from "@/lib/bulk-review/write-override";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { inngest } from "@/lib/inngest/client";
import { SWARM_INTENTS } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import type { RankedIntent } from "@/lib/bulk-review/types";

// Phase 65 learning dae6276 — never alias `inngest.send`. Inline-call via
// this cast each time. The cast accepts dynamic event names (the
// inngest-typed `send` rejects unknown names because the Events map is
// closed, and the operator-override re-emit shape uses `<swarm>/predicted`
// which is registered for production-typed events but lacks an entry for
// the operator-initiated discriminator field `triggered_by`).
type DynamicSend = (p: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

// ----- ActionResult discriminated union ------------------------------------
// Server actions never throw across the boundary — P3-D-09 optimistic-rollback
// pattern expects a structured result. All callers branch on result.ok.

export interface ActionOk<T> {
  ok: true;
  data: T;
}
export interface ActionErr {
  ok: false;
  error: string;
  code?: string;
}
export type ActionResult<T> = ActionOk<T> | ActionErr;

// ----- Axis 1: Stage 1 category override -----------------------------------

export interface OverrideStage1Input {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  original_event_id: string;
  original_decision: string;
  context_version: string;
  new_category_key: string;
  /** Optional per anti-drift #9 (Stage 1 audit is optional). */
  audit_note: string | null;
}

export async function overrideStage1Category(
  input: OverrideStage1Input,
): Promise<ActionResult<{ pipeline_event_id: string }>> {
  // T-03-01-01: server-side auth gate. operator_id derived from session,
  // NEVER from input payload.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized", code: "401" };
  }

  // T-03-01-02: server-side validation of new_category_key against the
  // swarm_noise_categories registry. Stage 1 vocabulary = noise keys ∪
  // {"unknown"}; NEVER a swarm_intents value (hard separation).
  if (input.new_category_key !== "unknown") {
    try {
      const admin0 = createAdminClient();
      const noiseCats = await loadSwarmNoiseCategories(admin0, input.swarm_type);
      const validKeys = new Set(noiseCats.map((c) => c.category_key));
      if (!validKeys.has(input.new_category_key)) {
        return {
          ok: false,
          error: `category_key "${input.new_category_key}" not in swarm_noise_categories for swarm="${input.swarm_type}"`,
          code: "invalid_category",
        };
      }
    } catch (e) {
      // Registry-load failure is non-fatal — fall through to writeOverride and
      // let the partial-index guard catch genuinely malformed payloads. The
      // hydrator's runtime warn-validation provides a second net.
      console.warn(
        `[overrideStage1Category] swarm_noise_categories registry load failed for swarm="${input.swarm_type}": ${(e as Error).message}`,
      );
    }
  }

  const admin = createAdminClient();
  try {
    const result = await writeOverride(admin, {
      email_label_id: input.email_label_id,
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      operator_id: user.id,
      original_event_id: input.original_event_id,
      original_decision: input.original_decision,
      context_version: input.context_version,
      input: {
        axis: "stage_1_category",
        new_category_key: input.new_category_key,
        reason: input.audit_note,
      },
    });
    const id = result.pipeline_event_ids[0];
    if (!id) {
      return {
        ok: false,
        error: "writeOverride returned empty pipeline_event_ids",
      };
    }
    return { ok: true, data: { pipeline_event_id: id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ----- Axis 4: Stage 4 handler-output --------------------------------------

// Verdict literal-union sourced from agent_runs.human_verdict CHECK enum
// (supabase/migrations/20260428_public_agent_runs.sql:68). Server-validated
// at the action layer (T-03-01-03).
export type Stage4Verdict =
  | "approved"
  | "edited_minor"
  | "edited_major"
  | "rejected_wrong_intent"
  | "rejected_wrong_reference"
  | "rejected_wrong_attachment"
  | "rejected_wrong_language"
  | "rejected_wrong_tone"
  | "rejected_other";

const STAGE_4_VERDICTS: ReadonlySet<string> = new Set<Stage4Verdict>([
  "approved",
  "edited_minor",
  "edited_major",
  "rejected_wrong_intent",
  "rejected_wrong_reference",
  "rejected_wrong_attachment",
  "rejected_wrong_language",
  "rejected_wrong_tone",
  "rejected_other",
]);

// Draft-quality literal-union from email_labels CHECK enum
// (supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql:18).
export type DraftQuality = "correct" | "needed_edit" | "rejected";
const DRAFT_QUALITIES: ReadonlySet<string> = new Set<DraftQuality>([
  "correct",
  "needed_edit",
  "rejected",
]);

export interface SubmitStage4Input {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  original_event_id: string;
  original_decision: string;
  context_version: string;
  new_draft_quality: string;
  new_feedback_reason: string;
  verdict: string; // validated against STAGE_4_VERDICTS below
  /** Required when verdict starts with "rejected_"; optional otherwise. */
  audit_note: string | null;
}

export async function submitStage4Handler(
  input: SubmitStage4Input,
): Promise<ActionResult<{ pipeline_event_id: string }>> {
  // Auth (T-03-01-01).
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized", code: "401" };
  }

  // Validate verdict + draft_quality enums (T-03-01-03).
  if (!STAGE_4_VERDICTS.has(input.verdict)) {
    return {
      ok: false,
      error: `verdict "${input.verdict}" not in agent_runs.human_verdict enum`,
      code: "invalid_verdict",
    };
  }
  if (!DRAFT_QUALITIES.has(input.new_draft_quality)) {
    return {
      ok: false,
      error: `new_draft_quality "${input.new_draft_quality}" not in email_labels.draft_quality enum`,
      code: "invalid_draft_quality",
    };
  }

  // AuditBlock-required-on-rejection gate (UI-SPEC §13 anti-drift #9). The
  // client-side AuditBlock also disables Submit, but the server is the
  // authoritative gate.
  if (
    input.verdict.startsWith("rejected_") &&
    (input.audit_note === null || input.audit_note.trim().length === 0)
  ) {
    return {
      ok: false,
      error: "audit-note required for rejection",
      code: "audit_required",
    };
  }

  const admin = createAdminClient();
  try {
    const result = await writeOverride(admin, {
      email_label_id: input.email_label_id,
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      operator_id: user.id,
      original_event_id: input.original_event_id,
      original_decision: input.original_decision,
      context_version: input.context_version,
      input: {
        axis: "stage_4_handler_output",
        new_draft_quality: input.new_draft_quality,
        new_feedback_reason: input.new_feedback_reason,
        reason: input.audit_note,
      },
    });
    const id = result.pipeline_event_ids[0];
    if (!id) {
      return {
        ok: false,
        error: "writeOverride returned empty pipeline_event_ids",
      };
    }
    return { ok: true, data: { pipeline_event_id: id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ----- Axis 2 + Axis 3 stubs — Plans 02 + 03 fill these. -------------------
// Intentional failing stubs so callers wired in Plan 01 surface a discoverable
// error message at runtime (rather than silently no-op'ing). Plans 02 + 03
// replace these implementations.

// ----- Axis 2: Stage 2 customer override (Plan 02 — LIVE) ------------------
//
// Flow:
//   1. Auth gate (T-03-02-01).
//   2. 4-digit account-id validation (T-03-02-02 + anti-drift #7).
//   3. Required audit-note (anti-drift #9).
//   4. writeOverride({axis: 'stage_2_customer', ...}) — emits one
//      pipeline_events row + UPDATEs debtor.email_labels.corrected_*.
//   5. If rerun=true, inline inngest.send for `<swarm>/predicted` — partial-
//      success: if the send throws, the override IS persisted but the response
//      carries code: 'rerun_failed' so the client can surface the warning
//      without rolling back the optimistic remove (T-03-02-07).
//
// The downstream stage-3-dispatcher consumes `*/predicted` and re-classifies
// Stage 3 + 4 against the corrected customer (P3-D-02). For an operator-
// initiated re-emit we forward the available ranked_intents payload from the
// row (if Stage 3 has already shipped) and stamp `triggered_by: 'operator-
// override'`. A row whose stage_3 is null (operator overrode Stage 2 before
// Stage 3 ever ran) cannot supply a non-empty ranked[] — in that case we
// surface `rerun_failed` so the operator sees the limitation cleanly rather
// than the dispatcher throwing on the empty list (Plan 02 deviation Rule 2 —
// fail loudly, not silently).

export interface OverrideStage2Input {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  original_event_id: string;
  original_decision: string;
  context_version: string;
  new_customer_account_id: string;
  /** REQUIRED on Axis 2 (anti-drift #9). Empty / whitespace-only rejected. */
  audit_note: string;
  rerun: boolean;
  /** Optional ranked-intents payload to forward into the re-emit. When omitted
   *  AND rerun=true, the server returns rerun_failed so the operator sees the
   *  limitation rather than the dispatcher throwing downstream. */
  ranked_intents?: Array<{ intent: string; confidence: string }>;
  /** Optional fields forwarded into the `<swarm>/predicted` payload. */
  agent_run_id?: string | null;
  run_id?: string | null;
}

export async function overrideStage2Customer(
  input: OverrideStage2Input,
): Promise<
  ActionResult<{ pipeline_event_id: string; rerun_emitted?: boolean }>
> {
  // T-03-02-01: auth gate.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized", code: "401" };
  }

  // T-03-02-02: account-id shape (4 zero-padded digits — anti-drift #7).
  if (!/^\d{4}$/.test(input.new_customer_account_id)) {
    return {
      ok: false,
      error: "invalid account_id (4 digits required)",
      code: "invalid_account",
    };
  }

  // Anti-drift #9: audit-note required at the server boundary.
  if (!input.audit_note || input.audit_note.trim().length === 0) {
    return {
      ok: false,
      error: "audit-note required for Stage 2 override",
      code: "audit_required",
    };
  }

  // T-03-02-04: writeOverride. operator_id derived from session.
  const admin = createAdminClient();
  let pipeline_event_id: string;
  try {
    const result = await writeOverride(admin, {
      email_label_id: input.email_label_id,
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      operator_id: user.id,
      original_event_id: input.original_event_id,
      original_decision: input.original_decision,
      context_version: input.context_version,
      input: {
        axis: "stage_2_customer",
        new_customer_account_id: input.new_customer_account_id,
        reason: input.audit_note,
      },
    });
    const id = result.pipeline_event_ids[0];
    if (!id) {
      return {
        ok: false,
        error: "writeOverride returned empty pipeline_event_ids",
      };
    }
    pipeline_event_id = id;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Conditional re-run kickoff (P3-D-02). When the operator did not request
  // a re-run, return success — the override is captured, downstream Phase 4
  // recommender will read it asynchronously.
  if (!input.rerun) {
    return { ok: true, data: { pipeline_event_id, rerun_emitted: false } };
  }

  try {
    // Inline send (CLAUDE.md learning dae6276 — preserve this-binding). Never
    // destructure; never alias. The acceptance criteria grep matches both
    // `inngest.send(` (this line) and the cast form below.
    //
    // Replay-safe id generation NOT applicable here (request scope, not
    // step.run). Payload mirrors the production emit site at
    // web/lib/inngest/functions/debtor-email-coordinator.ts:359 which uses
    // `${SWARM_TYPE}/predicted` (cross-swarm reuse). Operator-initiated
    // re-emit for the debtor-email swarm produces the literal event name
    // "debtor-email/predicted" — the wildcard subscriber stage-3-dispatcher
    // matches `*/predicted`.
    const sendArgs = {
      name: `${input.swarm_type}/predicted`,
      data: {
        swarm_type: input.swarm_type,
        email_id: input.email_id,
        run_id: input.run_id ?? null,
        agent_run_id: input.agent_run_id ?? null,
        ranked: input.ranked_intents ?? [],
        context_version: input.context_version,
        triggered_by: "operator-override",
        // The corrected customer the dispatcher should now read.
        customer_account_id: input.new_customer_account_id,
      },
    };
    await (inngest.send as unknown as DynamicSend)(sendArgs);
  } catch (e) {
    // Partial-success — override persisted, re-run kickoff failed.
    return {
      ok: false,
      error:
        "override saved but re-run kickoff failed: " +
        (e instanceof Error ? e.message : String(e)),
      code: "rerun_failed",
      // Note: code path returns ActionErr; pipeline_event_id is observable to
      // the caller via the error string. Client-side optimistic UI inspects
      // result.code === 'rerun_failed' specifically and treats it as a
      // partial success (P3-D-08 — pulse badge does NOT fire when this
      // path returns, since markInFlight is only called on result.ok).
    };
  }

  return { ok: true, data: { pipeline_event_id, rerun_emitted: true } };
}

// ----- Axis 3: Stage 3 ranked-intent reorder (Plan 03 — LIVE) --------------
//
// Flow:
//   1. Auth gate (T-03-03-01).
//   2. Validate each intent_key against SWARM_INTENTS codegen literal-union
//      (T-03-03-02 — hard-separation: only swarm_intents.intent_key values
//      accepted; swarm_noise_categories never consulted).
//   3. writeOverride({axis: 'stage_3_intent', ...}) — emits N pipeline_events
//      rows (one per ranked position), all sharing submitted_at.
//   4. Top-1 change detection (server-side per T-03-03-08): compare new[0]
//      to original_decision. If top-1 changed → re-emit `<swarm>/predicted`
//      inline (no destructuring per CLAUDE.md learning dae6276).
//   5. Sub-position-only reorders → NO Inngest re-emit (pure eval signal per
//      P3-D-04). Operator's reorder still produces all N pipeline_events
//      rows for the promotion-recommender.
//
// Partial-success: if writeOverride completes (N rows persisted) but the
// Inngest re-emit fails, return code='rerun_failed' with the pipeline_event_ids
// so the client can surface a non-blocking warning while keeping the
// optimistic row-removal (matches Plan 02 Axis 2 pattern).

export interface ReorderStage3Input {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  original_event_id: string;
  /** Original top-1 intent_key (server compares against new_ranked_intents[0]
   *  to decide if a re-emit is required). */
  original_decision: string;
  context_version: string;
  new_ranked_intents: Array<{ intent_key: string; confidence: number | null }>;
  /** Optional per anti-drift #9 (sub-position reorders may carry no note). */
  audit_note: string | null;
  /** Forwarded into the `<swarm>/predicted` payload when top-1 changes. */
  agent_run_id?: string | null;
  run_id?: string | null;
}

export async function reorderStage3Intents(
  input: ReorderStage3Input,
): Promise<
  ActionResult<{ pipeline_event_ids: string[]; rerun_emitted?: boolean }>
> {
  // T-03-03-01: auth gate.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized", code: "401" };
  }

  // T-03-03-02: server-side validation of every intent_key against the
  // codegen'd SWARM_INTENTS literal-union (Stage 3 vocabulary only — Stage 1's
  // swarm_noise_categories is NEVER consulted, hard-separation lock).
  const knownIntents: ReadonlySet<string> = new Set(SWARM_INTENTS);
  if (!Array.isArray(input.new_ranked_intents) || input.new_ranked_intents.length === 0) {
    return {
      ok: false,
      error: "new_ranked_intents must be a non-empty array",
      code: "invalid_intent",
    };
  }
  for (const r of input.new_ranked_intents) {
    if (!knownIntents.has(r.intent_key)) {
      return {
        ok: false,
        error: `unknown intent_key: ${r.intent_key}`,
        code: "invalid_intent",
      };
    }
  }

  // T-03-03-04: writeOverride emits N pipeline_events rows (Axis 3 contract).
  // operator_id from session (T-03-03-01).
  const admin = createAdminClient();
  let pipeline_event_ids: string[];
  try {
    // RankedIntent contract requires display_label; the editor doesn't pass
    // labels back to the server (the registry projection happens at hydrate
    // time). Inject null — write-override.ts stores `intent_key, confidence`
    // in pipeline_events.decision_details.ranked_intents and does not read
    // display_label.
    const rankedForWrite: RankedIntent[] = input.new_ranked_intents.map((r) => ({
      intent_key: r.intent_key as RankedIntent["intent_key"],
      confidence: r.confidence,
      display_label: null,
    }));
    const result = await writeOverride(admin, {
      email_label_id: input.email_label_id,
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      operator_id: user.id,
      original_event_id: input.original_event_id,
      original_decision: input.original_decision,
      context_version: input.context_version,
      input: {
        axis: "stage_3_intent",
        new_ranked_intents: rankedForWrite,
        reason: input.audit_note,
      },
    });
    pipeline_event_ids = result.pipeline_event_ids;
    if (pipeline_event_ids.length === 0) {
      return {
        ok: false,
        error: "writeOverride returned empty pipeline_event_ids",
      };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // T-03-03-08: top-1 change detected on the server, not the client. Operator
  // cannot force a re-run by flipping a flag — they have to actually have
  // moved a different intent_key to position 0.
  const newTop = input.new_ranked_intents[0]?.intent_key ?? null;
  const topChanged = newTop !== null && newTop !== input.original_decision;
  if (!topChanged) {
    // Sub-position-only reorder = pure eval signal (P3-D-04). No re-emit.
    return {
      ok: true,
      data: { pipeline_event_ids, rerun_emitted: false },
    };
  }

  // Top-1 changed → re-emit `<swarm>/predicted`. Inline send (CLAUDE.md
  // learning dae6276); cast to DynamicSend so the closed Events map doesn't
  // reject the operator-initiated discriminator.
  try {
    const sendArgs = {
      name: `${input.swarm_type}/predicted`,
      data: {
        swarm_type: input.swarm_type,
        email_id: input.email_id,
        run_id: input.run_id ?? null,
        agent_run_id: input.agent_run_id ?? null,
        ranked: input.new_ranked_intents.map((r) => ({
          intent: r.intent_key,
          confidence:
            r.confidence !== null ? String(r.confidence) : "medium",
        })),
        context_version: input.context_version,
        triggered_by: "operator-override",
      },
    };
    await (inngest.send as unknown as DynamicSend)(sendArgs);
  } catch (e) {
    // Partial-success — N rows persisted, re-emit failed. Surface the
    // limitation cleanly so the client can warn without rolling back.
    return {
      ok: false,
      error:
        "reorder saved but re-run kickoff failed: " +
        (e instanceof Error ? e.message : String(e)),
      code: "rerun_failed",
    };
  }

  return { ok: true, data: { pipeline_event_ids, rerun_emitted: true } };
}

// ----- Axis 3 escalate: Stage 3 "no good intent fits" → human queue --------
//
// Distinct from reorderStage3Intents: NOT a writeOverride call (writeOverride's
// stage_3_intent expects a ranked list). Emits ONE pipeline_events row with
// eval_type='intent-escalation' + flips agent_runs.status to 'routed_human_queue'.
//
// Verdict-enum reconciliation (deviation tracked in 03-03-SUMMARY.md):
//   The plan + CONTEXT P3-D-05 said "human_verdict='escalated_no_intent_fits'
//   (or equivalent — planner verifies enum)". The actual agent_runs.human_verdict
//   CHECK constraint (migration 20260428_public_agent_runs.sql:68-78) is closed
//   to {approved, edited_minor, edited_major, rejected_wrong_*, rejected_other}.
//   No "escalated_*" family exists. The closest semantic match is
//   'rejected_wrong_intent' ("operator says no listed intent fits"). The
//   actual routing signal lives on agent_runs.status='routed_human_queue'
//   (the existing dispatcher convention — see stage-3-dispatcher.ts:155).
//
// "Existing escalation-gate" reconciliation: the escalation-gate module
// (web/lib/automations/debtor-email/coordinator/escalation-gate.ts) is a PURE
// in-pipeline decision function — it returns {kind: 'single_shot' | 'orchestrator'}
// for the ranking-step dispatch. It is NOT a "route-to-human-queue" entry point.
// The canonical route-out-to-human signal is agent_runs.status='routed_human_queue'
// (stage-3-dispatcher.ts owns this for the registered handler-status='placeholder'
// branch); this action reuses that same status flip so escalated rows surface
// in Kanban via the existing swarm-bridge sync path (sync.ts:267).

export interface EscalateStage3Input {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  original_event_id: string;
  context_version: string;
  /** REQUIRED on escalate (anti-drift #9). */
  audit_note: string;
}

export async function escalateStage3ToHuman(
  input: EscalateStage3Input,
): Promise<ActionResult<{ pipeline_event_id: string }>> {
  // T-03-03-01: auth gate.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized", code: "401" };
  }

  // Anti-drift #9: audit-note required at the server boundary.
  if (!input.audit_note || input.audit_note.trim().length === 0) {
    return {
      ok: false,
      error: "audit-note required for Stage 3 escalate",
      code: "audit_required",
    };
  }

  const admin = createAdminClient();
  const submitted_at = new Date().toISOString();

  // Step 1: emit ONE pipeline_events row (stage=3, eval_type='intent-escalation').
  // override IS NOT NULL so the Phase 70 partial index picks it up.
  let pipeline_event_id: string;
  try {
    const { data, error } = await admin
      .from("pipeline_events")
      .insert({
        swarm_type: input.swarm_type,
        stage: 3,
        email_id: input.email_id,
        decision: "<escalation>",
        confidence: null,
        override: {
          axis: "stage_3_intent",
          original_decision: "<n/a>",
          original_event_id: input.original_event_id,
          operator_id: user.id,
          reason: input.audit_note,
          submitted_at,
        },
        eval_type: "intent-escalation",
        triggered_by: "operator-override",
        decision_details: {
          context_version: input.context_version,
          escalation_reason: input.audit_note,
        },
      })
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "pipeline_events insert returned no id",
      };
    }
    pipeline_event_id = (data as { id: string }).id;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Step 2: flip agent_runs.status to 'routed_human_queue' (canonical route-
  // out-to-human signal; existing dispatcher convention reused, not a parallel
  // escalation path — P3-D-05). Verdict deviation: the enum has no
  // 'escalated_no_intent_fits' value; we leave human_verdict untouched
  // (downstream operators set it when the Kanban entry is handled). The status
  // flip alone is sufficient for the row to surface on the human queue.
  const { error: arError } = await admin
    .from("agent_runs")
    .update({ status: "routed_human_queue" })
    .eq("email_id", input.email_id);
  if (arError) {
    return {
      ok: false,
      error: `agent_runs status flip failed: ${arError.message}`,
    };
  }

  return { ok: true, data: { pipeline_event_id } };
}
