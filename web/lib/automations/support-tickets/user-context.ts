// Plan 02-04 Task 2 — loadUserContext (Supabase prior-tickets half + M365 stub).
//
// ENRICH-03 is PARTIALLY delivered in Phase 2 (plan-checker W-5; see Plan
// 02-04 PLAN.md scope_note). The Supabase half — "last 5 tickets by
// submitter_id" — ships here in full. The M365 half — department, device,
// Graph-API lookup — is deferred to Project 2 (M365 SSO milestone).
//
// `loadUserContext` accepts an optional `m365Lookup` injection point so
// Project 2 can drop in the real Graph API implementation behind the same
// `M365UserContext` contract without schema/Phase changes. The default
// `m365StubLookup` returns `project_2_concern: true` + null fields.
//
// Query: ORDER BY submitted_at DESC LIMIT 5. Index on
// (submitter_id, submitted_at DESC) lands in Phase 1 migration; query is
// O(log n) + LIMIT 5 in steady state.

import type { PriorTicketSummary } from "./pipeline-stage-context";
export type { PriorTicketSummary } from "./pipeline-stage-context";

const TRANSCRIPT_EXCERPT_CHARS = 300;
const PRIOR_TICKETS_LIMIT = 5;

/**
 * Stable contract for the M365 user-context surface. Project 2 fills these
 * fields by calling the Microsoft Graph API behind the same shape; Phase 2/3
 * consumers see `project_2_concern: true` and null fields and know to skip
 * any logic that requires real M365 data.
 *
 * `project_2_concern: true` is the literal marker so downstream reviewers
 * (and the Stage 2 aggregate event) can deterministically detect a stubbed
 * vs. real result.
 */
export type M365UserContext = {
  department: string | null;
  device: { os: string | null; browser: string | null } | null;
  email: string | null;
  display_name: string | null;
  project_2_concern: true;
};

export class UserContextError extends Error {
  readonly code: string;
  constructor(code: string, opts?: { cause?: unknown; message?: string }) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "UserContextError";
    this.code = code;
  }
}

/**
 * ENRICH-03 partial delivery (Phase 2 plan-checker W-5). Real M365 Graph API
 * integration is a Project 2 milestone. To wire later, pass an `m365Lookup`
 * impl into `loadUserContext`.
 */
export async function m365StubLookup(
  _submitterId: string,
): Promise<M365UserContext> {
  return {
    department: null,
    device: null,
    email: null,
    display_name: null,
    project_2_concern: true,
  };
}

export interface LoadUserContextArgs {
  submitterId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (t: string) => any };
  /**
   * Optional injection point for the M365 Graph-API lookup. When omitted,
   * `m365StubLookup` is used (project_2_concern=true).
   */
  m365Lookup?: (submitterId: string) => Promise<M365UserContext>;
}

export interface LoadUserContextResult {
  prior_tickets: PriorTicketSummary[];
  m365: M365UserContext;
}

interface SupportTicketRow {
  id: string;
  submission_id: string;
  user_chosen_type: PriorTicketSummary["user_chosen_type"];
  proposed_system: string | null;
  final_intent: string | null;
  clickup_status: string | null;
  submitted_at: string;
  transcript: string | null;
}

/**
 * Loads the submitter's last `PRIOR_TICKETS_LIMIT` support_tickets
 * (descending by submitted_at) and returns them mapped to PriorTicketSummary
 * + an M365 user-context (real or stubbed).
 *
 * On `.error` from supabase, throws UserContextError carrying the error
 * message (Phase 1 lesson b7266f21 — never swallow .error).
 */
export async function loadUserContext(
  args: LoadUserContextArgs,
): Promise<LoadUserContextResult> {
  const { supabase, submitterId } = args;
  const m365Lookup = args.m365Lookup ?? m365StubLookup;

  const res = await supabase
    .from("support_tickets")
    .select(
      "id, submission_id, user_chosen_type, proposed_system, final_intent, clickup_status, submitted_at, transcript",
    )
    .eq("submitter_id", submitterId)
    .order("submitted_at", { ascending: false })
    .limit(PRIOR_TICKETS_LIMIT);

  if (res.error != null) {
    const msg = (res.error as { message?: string }).message ?? "unknown";
    throw new UserContextError("supabase_select_failed", {
      message: `support_tickets query failed: ${msg}`,
    });
  }

  const rows = (res.data as SupportTicketRow[] | null) ?? [];

  const prior_tickets: PriorTicketSummary[] = rows.map((row) => ({
    id: row.id,
    submission_id: row.submission_id,
    user_chosen_type: row.user_chosen_type,
    proposed_system: row.proposed_system,
    final_intent: row.final_intent,
    clickup_status: row.clickup_status,
    submitted_at: row.submitted_at,
    transcript_excerpt:
      row.transcript != null
        ? row.transcript.slice(0, TRANSCRIPT_EXCERPT_CHARS)
        : null,
  }));

  const m365 = await m365Lookup(submitterId);

  return { prior_tickets, m365 };
}
