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

export interface AiThinking {
  reasoning: string | null;
  completeness_verdict_raw: string | null;
  effective_verdict: string | null;
  chosen_intent_raw: string | null;
  effective_intent: string | null;
  confidence_raw: string | null;
  effective_confidence: string | null;
  missing_information: string[] | null;
  override_reason: string | null;
  model_used: string | null;
}

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
  ai_thinking: AiThinking | null;
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
  const rows = (data ?? []) as unknown as Omit<SubmissionRow, "ai_thinking">[];

  // Batch-fetch Stage 3 pipeline_events for all submission IDs.
  const submissionIds = rows.map((r) => r.submission_id).filter(Boolean);
  const thinkingMap = new Map<string, AiThinking>();

  if (submissionIds.length > 0) {
    const { data: evtData, error: evtError } = await admin
      .from("pipeline_events")
      .select("email_id, decision_details")
      .eq("swarm_type", "support-tickets")
      .eq("stage", 3)
      .in("email_id", submissionIds);

    if (!evtError && evtData) {
      for (const evt of evtData as unknown as { email_id: string; decision_details: Record<string, unknown> }[]) {
        const d = evt.decision_details ?? {};
        thinkingMap.set(evt.email_id, {
          reasoning: (d.reasoning as string | null) ?? null,
          completeness_verdict_raw: (d.completeness_verdict_raw as string | null) ?? null,
          effective_verdict: (d.effective_verdict as string | null) ?? null,
          chosen_intent_raw: (d.chosen_intent_raw as string | null) ?? null,
          effective_intent: (d.effective_intent as string | null) ?? null,
          confidence_raw: (d.confidence_raw as string | null) ?? null,
          effective_confidence: (d.effective_confidence as string | null) ?? null,
          missing_information: Array.isArray(d.missing_information)
            ? (d.missing_information as string[])
            : null,
          override_reason: (d.override_reason as string | null) ?? null,
          model_used: (d.model_used as string | null) ?? null,
        });
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    ai_thinking: thinkingMap.get(r.submission_id) ?? null,
  })) as SubmissionRow[];
}
