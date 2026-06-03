// Phase 5 Plan 04 — support-tickets submissions loader (ADMIN-01).
//
// Fetches support_tickets rows for the admin audit surface. Applies
// server-side filters (system / intent / status) via parameterised .eq()
// calls — safe against T-05-04-04 searchParams injection.
//
// computeOverrideDelta: per-axis comparison of proposed vs final values.
// An axis is "changed" when proposed_X !== final_X AND final_X is non-null
// (i.e., a human actually set a different value — not just an AI proposal
// that was never reviewed).

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubmissionRow {
  id: string;
  submission_id: string;
  submitter_id: string;
  submitted_at: string;
  user_chosen_type: string;
  proposed_intent: string | null;
  proposed_system: string | null;
  proposed_assignee: string | null;
  final_intent: string | null;
  final_system: string | null;
  final_assignee: string | null;
  clickup_status: string | null;
  clickup_task_id: string | null;
  time_to_resolve_minutes: number | null;
}

export interface OverrideDeltaAxis {
  changed: boolean;
  proposed: string | null;
  final: string | null;
}

export interface OverrideDelta {
  intent: OverrideDeltaAxis;
  system: OverrideDeltaAxis;
  assignee: OverrideDeltaAxis;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function axisChanged(proposed: string | null, final: string | null): boolean {
  return final !== null && proposed !== final;
}

/**
 * computeOverrideDelta — per-axis diff of AI-proposed vs human-final.
 * "changed" is true when the human set a non-null value that differs from the
 * AI proposal (or when the AI proposed nothing and the human set something).
 */
export function computeOverrideDelta(row: SubmissionRow): OverrideDelta {
  return {
    intent: {
      changed: axisChanged(row.proposed_intent, row.final_intent),
      proposed: row.proposed_intent,
      final: row.final_intent,
    },
    system: {
      changed: axisChanged(row.proposed_system, row.final_system),
      proposed: row.proposed_system,
      final: row.final_system,
    },
    assignee: {
      changed: axisChanged(row.proposed_assignee, row.final_assignee),
      proposed: row.proposed_assignee,
      final: row.final_assignee,
    },
  };
}

// ── Filter types ───────────────────────────────────────────────────────────

export interface SubmissionFilters {
  system?: string;
  intent?: string;
  status?: string;
}

// ── Loader ────────────────────────────────────────────────────────────────

/**
 * loadSubmissions — server-side query. Selects only audit columns (no
 * transcript / PII — T-05-04-03 mitigated). Filters via .eq() (parameterised).
 * Max 100 rows ordered by submitted_at DESC.
 */
export async function loadSubmissions(
  admin: SupabaseClient,
  filters: SubmissionFilters = {},
): Promise<SubmissionRow[]> {
  let q = admin
    .from("support_tickets")
    .select(
      [
        "id",
        "submission_id",
        "submitter_id",
        "submitted_at",
        "user_chosen_type",
        "proposed_intent",
        "proposed_system",
        "proposed_assignee",
        "final_intent",
        "final_system",
        "final_assignee",
        "clickup_status",
        "clickup_task_id",
        "time_to_resolve_minutes",
      ].join(", "),
    )
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (filters.system) q = q.eq("final_system", filters.system);
  if (filters.intent) q = q.eq("final_intent", filters.intent);
  if (filters.status) q = q.eq("clickup_status", filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SubmissionRow[];
}
