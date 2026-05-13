// Phase 76 Plan 05 — Server-side loader for the per-swarm Kanban human-lane.
//
// Reads automation_runs rows where status='pending' AND result.kanban_reason
// is set (the three triggers seeded by Plans 76-03 and 76-04: 'no_handler' |
// 'low_confidence' | 'handler_error'). Then surfaces the most-recent prior
// Stage 1 and Stage 3 pipeline_events.id per email_id so the override
// Server Actions (replay axis-3, reclassify axis-1) can reference the
// correct lineage.
//
// W4 determinism: the pipeline_events SELECT is ORDER BY created_at DESC and
// the email_id→event_id Map uses first-write-wins. Without this, on replay
// the surfaced original_event_id would be planner-dependent (not always the
// most recent prior emit). See PLAN.md §interfaces and threat T-76-05-09.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Stage 1 (pipeline_events.stage=1) is the noise filter (swarm_noise_categories).
//   - Stage 3 (pipeline_events.stage=3) is the ranked-intent classifier (swarm_intents).
// Hard separation: this loader ONLY surfaces event_ids per stage; it does NOT
// blur the Stage 1 / Stage 3 distinction. Replay (axis-3) consumes
// stage_3_event_id; Reclassify-as-noise (axis-1) consumes stage_1_event_id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailMailboxes } from "../_shell/_lib/load-email-mailboxes";

export type KanbanReason = "no_handler" | "low_confidence" | "handler_error";

export interface KanbanRow {
  id: string;
  swarm_type: string;
  topic: string | null;
  entity: string | null;
  created_at: string;
  result: {
    kanban_reason: KanbanReason;
    intent?: string;
    confidence?: string;
    email_id?: string;
    automation_run_id?: string | null;
    coordinator_run_id?: string | null;
    error_detail?: string;
    error_name?: string;
    gate_reason?: string;
    ranked?: Array<{ intent: string; confidence: string }>;
  };
  // Filled by the joined lookup; null when no Stage 1 / Stage 3 pipeline_events row exists.
  // W4: when multiple events exist for the same (email_id, stage), the MOST RECENT one wins
  // (deterministic across replay) — see ordering comment below.
  stage_1_event_id: string | null;
  stage_3_event_id: string | null;
  // Phase 82 Plan 04 — email_pipeline.emails JOIN (resolves OQ-1).
  // Null when result.email_id is missing OR when the upstream email row was
  // deleted (defensive coalesce). Unified shell page-boundary mappers read
  // this to populate Row.{subject,from_name,from_email,timestamp,mailbox_id}.
  email_metadata: EmailMetadata | null;
}

export interface EmailMetadata {
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string | null;
  mailbox_id: number | null;
}

type RawRow = Omit<
  KanbanRow,
  "stage_1_event_id" | "stage_3_event_id" | "email_metadata"
>;

export async function loadKanbanRows(
  admin: SupabaseClient,
  swarmType: string,
): Promise<KanbanRow[]> {
  const { data, error } = await admin
    .from("automation_runs")
    .select("id, swarm_type, topic, entity, created_at, result")
    .eq("swarm_type", swarmType)
    .eq("status", "pending")
    .not("result->>kanban_reason", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`loadKanbanRows: ${error.message}`);
  const rows = (data ?? []) as RawRow[];
  if (rows.length === 0) return [];

  // R-3 mitigation: only build the join when we actually have email_ids.
  const emailIds = Array.from(
    new Set(rows.map((r) => r.result?.email_id).filter(Boolean) as string[]),
  );
  if (emailIds.length === 0) {
    return rows.map((r) => ({
      ...r,
      stage_1_event_id: null,
      stage_3_event_id: null,
      email_metadata: null,
    }));
  }

  // W4: order DESC by created_at so newest emits land first; combined with
  // first-write-wins on the Map below this guarantees the surfaced event_id
  // is deterministically the MOST RECENT prior Stage 1 / Stage 3 emit per
  // email — never an arbitrary one. Without this ordering the join would be
  // nondeterministic across Postgres planner choice and across replay.
  const eventsPromise = admin
    .from("pipeline_events")
    .select("id, email_id, stage, created_at")
    .in("email_id", emailIds)
    .in("stage", [1, 3])
    .order("created_at", { ascending: false });

  // Phase 82 Plan 04 — email_pipeline.emails JOIN (resolves OQ-1).
  // Mirrors the Stage 1 page pre-fetch pattern (stage-1/page.tsx:696-700).
  // PostgREST cross-schema query via .schema("email_pipeline"). Run in
  // parallel with pipeline_events lookup.
  const emailMetaPromise = admin
    .schema("email_pipeline")
    .from("emails")
    .select("id, subject, sender_email, sender_name, received_at")
    .in("id", emailIds);

  const mailboxesPromise = loadEmailMailboxes(admin, emailIds, swarmType);

  const [eventsRes, emailMetaRes, mailboxes] = await Promise.all([
    eventsPromise,
    emailMetaPromise,
    mailboxesPromise,
  ]);
  const events = eventsRes.data;

  const stage1Map = new Map<string, string>();
  const stage3Map = new Map<string, string>();
  for (const ev of (events ?? []) as Array<{
    id: string;
    email_id: string;
    stage: number;
    created_at: string;
  }>) {
    // W4: first-write-wins. Because rows arrive newest-first (ORDER BY
    // created_at DESC), the FIRST hit for an email_id is the most recent
    // emit. Skip subsequent (older) rows.
    if (ev.stage === 1 && !stage1Map.has(ev.email_id)) {
      stage1Map.set(ev.email_id, ev.id);
    }
    if (ev.stage === 3 && !stage3Map.has(ev.email_id)) {
      stage3Map.set(ev.email_id, ev.id);
    }
  }

  // Build email_id → EmailMetadata map. Defensive: rows whose email row is
  // missing (deleted upstream) coalesce to null at map-lookup time.
  const emailMetaMap = new Map<string, EmailMetadata>();
  for (const e of ((emailMetaRes.data ?? []) as Array<{
    id: string;
    subject: string | null;
    sender_email: string | null;
    sender_name: string | null;
    received_at: string | null;
  }>)) {
    emailMetaMap.set(e.id, {
      subject: e.subject,
      sender_email: e.sender_email,
      sender_name: e.sender_name,
      received_at: e.received_at,
      mailbox_id: mailboxes.get(e.id) ?? null,
    });
  }

  return rows.map((r) => ({
    ...r,
    stage_1_event_id: r.result?.email_id
      ? stage1Map.get(r.result.email_id) ?? null
      : null,
    stage_3_event_id: r.result?.email_id
      ? stage3Map.get(r.result.email_id) ?? null
      : null,
    email_metadata: r.result?.email_id
      ? emailMetaMap.get(r.result.email_id) ?? null
      : null,
  }));
}
