"use server";

// Phase 4 Plan 03 Task 1 — three server actions on top of public.promotion_candidates.
//
// Auth: cookie-bound Supabase getUser() → operator_id (never from input).
// Writes via createAdminClient() (service-role, bypasses RLS).
// ActionResult shape mirrors Phase 3 override-actions (P3-D-09 — never throw
// across server-action boundary).
//
// Apply path (P4-D-08):
//   - Deterministic kinds (regex_rule, sender_mapping) → migration content
//     emitted via migration-emitter (parameter-bound dollar-quoting per
//     threat T-04-03-09); content + path returned to UI. NEVER writes to
//     disk — engineer pastes into a new file as part of repo PR flow.
//   - Non-deterministic kinds (prompt_tune_stage_3, new_intent,
//     prompt_tune_stage_4) → status flip only + engineer-handoff message.
//
// CLAUDE.md: this module deliberately has NO Inngest import. The test in
// __tests__/patterns-actions.test.ts greps the source and asserts that
// neither the import nor the .send call site exists. Apply/Refine/Dismiss
// are pure DB writes — no pipeline event re-emit.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emitFilterRuleMigration,
  emitKnownSenderMigration,
} from "./migration-emitter";
import type {
  PromotionKind,
  RefinementPayload,
  ProposedChange,
} from "@/lib/promotion-recommender/types";

// ---------- ActionResult discriminated union ----------

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

// ---------- Helpers ----------

function utcTimestamp(): string {
  // YYYYMMDDHHmm in UTC (matches the existing migration-naming convention).
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes())
  );
}

const DETERMINISTIC_KINDS: ReadonlySet<PromotionKind> = new Set([
  "regex_rule",
  "sender_mapping",
]);

function validateRefinement(refinement: RefinementPayload): string | null {
  if (refinement.kind === "regex_rule") {
    if (
      typeof refinement.subject_pattern !== "string" ||
      refinement.subject_pattern.trim().length < 3
    ) {
      return "subject_pattern must be >= 3 chars";
    }
    return null;
  }
  if (refinement.kind === "sender_mapping") {
    if (
      typeof refinement.sender_pattern !== "string" ||
      refinement.sender_pattern.trim().length === 0
    ) {
      return "sender_pattern required";
    }
    if (
      typeof refinement.customer_account_id !== "string" ||
      !/^[0-9]+$/.test(refinement.customer_account_id)
    ) {
      return "customer_account_id must be numeric";
    }
    return null;
  }
  // Non-deterministic kinds: accept the refined payload as-is (engineer
  // hand-off; no schema gate beyond the type-level discriminator).
  return null;
}

interface CandidateRow {
  id: string;
  kind: PromotionKind;
  swarm_type: string;
  status: string;
  proposed_change: ProposedChange;
}

async function loadCandidate(
  candidate_id: string,
): Promise<{ row: CandidateRow | null; err: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promotion_candidates")
    .select("*")
    .eq("id", candidate_id)
    .single();
  if (error || !data) return { row: null, err: error?.message ?? "not found" };
  return { row: data as unknown as CandidateRow, err: null };
}

// ---------- applyCandidate ----------

export interface ApplyArgs {
  candidate_id: string;
  refinement?: RefinementPayload;
  note?: string;
}

export interface ApplyResultData {
  status: "approved";
  migration_path?: string;
  migration_content?: string;
  message: string;
}

export async function applyCandidate(
  args: ApplyArgs,
): Promise<ActionResult<ApplyResultData>> {
  // 1. Auth gate (T-04-03-01).
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };
  return applyCandidateForUser(args, user.id);
}

async function applyCandidateForUser(
  args: ApplyArgs,
  user_id: string,
): Promise<ActionResult<ApplyResultData>> {
  // 2. Load candidate.
  const { row, err } = await loadCandidate(args.candidate_id);
  if (!row) {
    return { ok: false, error: err ?? "candidate not found", code: "not_found" };
  }

  // 3. Terminal-state short-circuit (T-04-03-04 — idempotency).
  if (["approved", "rejected", "rolled_back"].includes(row.status)) {
    return {
      ok: false,
      error: "This suggestion is already in a terminal state",
      code: "already_terminal",
    };
  }

  // 4. Compute effective payload.
  const effectivePayload: RefinementPayload =
    args.refinement ?? row.proposed_change.structured_payload;

  // 5. Emit migration for deterministic kinds.
  let migration_path: string | undefined;
  let migration_content: string | undefined;
  const ts = utcTimestamp();

  try {
    if (row.kind === "regex_rule" && effectivePayload.kind === "regex_rule") {
      const emit = emitFilterRuleMigration({
        candidate_id: row.id,
        swarm_type: row.swarm_type,
        subject_pattern: effectivePayload.subject_pattern,
        sender_filter: effectivePayload.sender_filter ?? null,
        timestamp_utc: ts,
      });
      migration_path = emit.file_path;
      migration_content = emit.file_content;
    } else if (
      row.kind === "sender_mapping" &&
      effectivePayload.kind === "sender_mapping"
    ) {
      const emit = emitKnownSenderMigration({
        candidate_id: row.id,
        swarm_type: row.swarm_type,
        sender_pattern: effectivePayload.sender_pattern,
        customer_account_id: effectivePayload.customer_account_id,
        operator_id: user_id,
        timestamp_utc: ts,
      });
      migration_path = emit.file_path;
      migration_content = emit.file_content;
    }
  } catch (e) {
    return {
      ok: false,
      error: `migration emission failed: ${(e as Error).message}`,
      code: "emit_failed",
    };
  }

  // 6. UPDATE candidate (operator approvals never overwritten by cron — Plan 01
  //    UPSERT explicitly omits status / approved_by / approved_at columns).
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "approved",
    approved_by: user_id,
    approved_at: nowIso,
    updated_at: nowIso,
  };
  if (args.refinement) {
    patch.proposed_change = {
      ...row.proposed_change,
      structured_payload: args.refinement,
    };
  }
  const updRes = await admin
    .from("promotion_candidates")
    .update(patch)
    .eq("id", args.candidate_id);
  // PostgREST UPDATE returns { data, error }; we tolerate either thenable or
  // {error}-bearing shape (the test mock returns a thenable resolving with
  // {error}).
  const updErr =
    (updRes as unknown as { error: { message: string } | null }).error ?? null;
  if (updErr) return { ok: false, error: updErr.message };

  const message = migration_path
    ? `Suggestion applied — migration ready for engineer review at ${migration_path}`
    : "Suggestion applied — engineer will wire the change manually";

  return {
    ok: true,
    data: {
      status: "approved",
      migration_path,
      migration_content,
      message,
    },
  };
}

// ---------- refineCandidate ----------

export interface RefineArgs {
  candidate_id: string;
  refinement: RefinementPayload;
  note?: string;
}

export async function refineCandidate(
  args: RefineArgs,
): Promise<ActionResult<ApplyResultData>> {
  // Auth gate.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };

  // Validate refinement schema (T-04-03-03).
  const validationErr = validateRefinement(args.refinement);
  if (validationErr) {
    return { ok: false, error: validationErr, code: "invalid_refinement" };
  }

  // Delegate to the auth-skipping internal path — auth is already gated above.
  return applyCandidateForUser(
    {
      candidate_id: args.candidate_id,
      refinement: args.refinement,
      note: args.note,
    },
    user.id,
  );
}

// ---------- dismissCandidate ----------

export interface DismissArgs {
  candidate_id: string;
  reason: string;
}

export async function dismissCandidate(
  args: DismissArgs,
): Promise<ActionResult<{ status: "rejected" }>> {
  // Auth gate.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized", code: "401" };

  // Audit gate (UI-SPEC §13 anti-drift #9; matches Stage 3 escalate convention).
  if (args.reason.trim().length < 8) {
    return {
      ok: false,
      error: "audit-note required for dismissal (>= 8 chars)",
      code: "audit_required",
    };
  }

  const { row, err } = await loadCandidate(args.candidate_id);
  if (!row) {
    return { ok: false, error: err ?? "candidate not found", code: "not_found" };
  }
  if (["approved", "rejected", "rolled_back"].includes(row.status)) {
    return {
      ok: false,
      error: "This suggestion is already in a terminal state",
      code: "already_terminal",
    };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const patch = {
    status: "rejected" as const,
    dismissed_by: user.id,
    dismissed_at: nowIso,
    updated_at: nowIso,
    proposed_change: {
      ...row.proposed_change,
      dismissal_reason: args.reason,
    },
  };
  const updRes = await admin
    .from("promotion_candidates")
    .update(patch)
    .eq("id", args.candidate_id);
  const updErr =
    (updRes as unknown as { error: { message: string } | null }).error ?? null;
  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true, data: { status: "rejected" } };
}
