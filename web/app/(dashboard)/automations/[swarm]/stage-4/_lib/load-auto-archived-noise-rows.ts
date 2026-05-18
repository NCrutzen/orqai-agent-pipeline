// Phase 82.8 Plan 05 — Auto-archived noise loader (Stage 4 "Auto-archived"
// section data source for D-02 "handled overview").
//
// Reads pipeline_events rows where stage=4 AND decision='auto_archived_noise'
// (emitted by Phase 82.8-02 on Stage 1 success; backfilled for 30d by Plan 04).
// JOINs (two-pass) to email_pipeline.emails for sender/subject/body so the
// Auto-archived list can render directly without an extra round-trip per row.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Auto-archived rows originate from Stage 1 noise filtering (Stage 1 closed
//     list = swarm_noise_categories ∪ {unknown}). The Stage 4 telemetry event
//     carries the originating noise category in decision_details for display
//     only — it does NOT make the row a Stage 3 intent. Hard separation
//     preserved: this loader never touches swarm_intents.
//   - Sort order: created_at DESC (newest first) per D-02 acceptance.
//
// Pattern: thin two-pass loader (NOT a JOIN). Mirrors the kanban-loader
// approach (pipeline_events first, then email_pipeline.emails via .in(...)).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailMailboxes } from "../../_shell/_lib/load-email-mailboxes";

export interface AutoArchivedNoiseRow {
  id: string;                       // pipeline_events.id
  email_id: string;
  created_at: string;               // pipeline_events.created_at — chronological sort key
  noise_category: string | null;
  noise_category_unknown: boolean;
  backfilled: boolean;
  archived_at: string | null;       // from decision_details, fallback created_at
  email_metadata: {
    subject: string | null;
    sender_email: string | null;
    sender_name: string | null;
    received_at: string | null;
    mailbox_id: string | null;  // numeric mailbox id stringified for page.tsx's Number.parseInt path
  } | null;
  body_text: string | null;
  body_html: string | null;
}

export async function loadAutoArchivedNoiseRows(
  admin: SupabaseClient,
  swarmType: string,
  opts: { limit?: number } = {},
): Promise<AutoArchivedNoiseRow[]> {
  const limit = opts.limit ?? 100;

  // Pass 1: pipeline_events stage=4 auto_archived_noise.
  const { data: events, error: evtErr } = await admin
    .from("pipeline_events")
    .select("id, email_id, created_at, decision_details")
    .eq("swarm_type", swarmType)
    .eq("stage", 4)
    .eq("decision", "auto_archived_noise")
    .not("email_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (evtErr) throw evtErr;
  if (!events || events.length === 0) return [];

  const emailIds = Array.from(
    new Set(events.map((e) => e.email_id as string)),
  );

  // Pass 2: email_pipeline.emails for sender/subject/body.
  // NOTE: emails has no mailbox_id (canonical numeric mailbox lives on
  // automation_runs — fetched via loadEmailMailboxes below) and no body_html
  // column. Selecting either yields PostgREST 42703.
  const { data: emails, error: emErr } = await admin
    .schema("email_pipeline")
    .from("emails")
    .select("id, subject, sender_email, sender_name, received_at, body_text")
    .in("id", emailIds);

  if (emErr) throw emErr;

  const emailById = new Map(
    (emails ?? []).map((e) => [e.id as string, e]),
  );

  // Pass 3: mailbox_id lookup via automation_runs (same helper kanban-loader
  // uses). Required for the V6 mailbox filter on the Stage 4 page.
  const mailboxByEmailId = await loadEmailMailboxes(admin, emailIds, swarmType);

  return events.map((evt): AutoArchivedNoiseRow => {
    const dd = (evt.decision_details ?? {}) as Record<string, unknown>;
    const em = emailById.get(evt.email_id as string) ?? null;
    return {
      id: evt.id as string,
      email_id: evt.email_id as string,
      created_at: evt.created_at as string,
      noise_category:
        typeof dd.noise_category === "string" ? dd.noise_category : null,
      noise_category_unknown: dd.noise_category_unknown === true,
      backfilled: dd.backfilled === true,
      archived_at:
        typeof dd.archived_at === "string" ? (dd.archived_at as string) : null,
      email_metadata: em
        ? {
            subject: (em.subject as string | null) ?? null,
            sender_email: (em.sender_email as string | null) ?? null,
            sender_name: (em.sender_name as string | null) ?? null,
            received_at: (em.received_at as string | null) ?? null,
            mailbox_id: ((): string | null => {
              const v = mailboxByEmailId.get(evt.email_id as string);
              return v == null ? null : String(v);
            })(),
          }
        : null,
      body_text: (em?.body_text as string | null) ?? null,
      body_html: null,  // email_pipeline.emails has no body_html column; page treats null as "use body_text"
    };
  });
}
