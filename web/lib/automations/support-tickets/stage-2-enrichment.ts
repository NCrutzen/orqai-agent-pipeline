// Plan 02-02 Task 2 — Stage 2 baseline enrichment.
// Plan 02-03 Task 4 — full enrichment wiring: transcribe + PII + cost ceiling.
//
// Listens on `support-tickets/stage-2.requested` (emitted by the ingest route
// after Stage 0/1 telemetry is persisted). The full pipeline is now:
//
//   (1) load support_tickets row (includes video_storage_url + current cost rollup)
//   (2) SSRF gate on video_storage_url (validateVideoUrlHost)
//   (3) transcribe via ElevenLabs Scribe + locale detect →
//         - UPDATE support_tickets.transcript / submitter_locale / stage2_cost_cents
//         - ONE pipeline_events row, decision='transcribe_ok'
//   (4) PII / prompt-injection detector on transcript →
//         - if flagged: UPDATE support_tickets.pii_quarantine=true,
//           quarantine_state=<reason>; decision='pii_check_quarantined'
//         - else: decision='pii_check_safe'
//         - CONTINUE either way (quarantine is operator-review flag, not stop)
//   (5) cost-ceiling check (post-transcribe) — if stage2_cost_cents exceeds
//         SUPPORT_STAGE2_COST_CEILING_CENTS (default 50¢):
//         - decision='cost_ceiling_exceeded'
//         - UPDATE proposed_system_status='cost_ceiling_exceeded'
//         - ABORT — do NOT fire Stage 3 trigger, do NOT write baseline emit
//   (6) baseline emit — empty PipelineStageContext + Stage 3 trigger send.
//       Plans 02-04/02-05 will UPDATE individual context fields here.
//
// Replay safety (docs/inngest-patterns.md):
//   - All side-effects inside step.run().
//   - Non-deterministic timestamps memoized via `compute-now` step.
//
// .error guards (Phase 1 lesson b7266f21): supabase-js v2 returns { data,
// error } and does NOT throw. We surface .error as a thrown Error so Inngest
// retries (retries: 3) instead of silently no-op'ing.
//
// SAFETY-04: SSRF gate (url-allowlist.ts) blocks attacks via attacker-controlled
// video_storage_url. SAFETY-05: cost ceiling caps per-submission Stage-2 spend.
// T-02-12 mitigation: submission_id, external_task_id and attempt come from the
// loaded DB row, not from event.data — a crafted event can't forge audit fields.
//
// Inngest binding-safety: `inngest.createFunction` is used directly. Future
// event sends in this file MUST follow the CLAUDE.md "never destructure
// inngest.send" rule — pass the inngest client as a dep and call
// `inngest.send.bind(inngest)` at the wrapper boundary, or call inline.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emptyPipelineStageContext,
  type PipelineStageContext,
} from "./pipeline-stage-context";
import { validateVideoUrlHost } from "./url-allowlist";
import {
  transcribeViaScribe,
  normalizeSubmitterLocale,
  type TranscribeResult,
} from "./transcribe";
import { detectPiiOrInjection, type PiiDetectResult } from "./pii-detect";
import {
  extractFrames as defaultExtractFrames,
  type ExtractFramesArgs,
  type ExtractFramesResult,
} from "./extract-frames";
import {
  loadUserContext as defaultLoadUserContext,
  type LoadUserContextArgs,
  type LoadUserContextResult,
} from "./user-context";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type Stage2RequestedEvent = {
  support_ticket_id: string;
  submission_id: string;
  external_task_id: string;
  attempt: number;
};

export type Stage2BaselineResult =
  | {
      ok: true;
      context: PipelineStageContext;
      pipeline_event_decision: "stage_2_baseline";
    }
  | {
      ok: false;
      reason: string;
    };

export type Stage2FullResult =
  | {
      ok: true;
      context: PipelineStageContext;
      pipeline_event_decision: "stage_2_complete" | "stage_2_complete_pii_quarantined";
      transcript: string;
      submitter_locale: "nl" | "en" | "fr";
      stage2_cost_cents: number;
      pii_flagged: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

const TRIGGERED_BY = "support-tickets:stage-2-enrichment";
const DEFAULT_COST_CEILING_CENTS = 50;

/**
 * Pure handler — testable in isolation without an Inngest runtime. The
 * Inngest wrapper below is a thin orchestrator that calls into this function
 * through step.run boundaries for replay safety.
 *
 * NOTE: Kept exported for Wave 2 callers/tests. The Stage 2 Inngest function
 * now drives `runStage2FullEnrichment` which delegates to this for the
 * baseline emit step.
 */
export async function runStage2BaselineEnrichment(
  event: Stage2RequestedEvent,
  deps: { supabase: SupabaseAdmin; now: () => Date },
): Promise<Stage2BaselineResult> {
  const { supabase, now } = deps;
  const startedAt = now();

  // (1) Load the support_tickets row by id. submission_id, external_task_id,
  //     and attempt come from the DB row — NOT from event.data — so a crafted
  //     event payload can't forge what we write (T-02-12 mitigation).
  const ticketRes = await supabase
    .from("support_tickets")
    .select("id, submission_id, external_task_id, attempt")
    .eq("id", event.support_ticket_id)
    .maybeSingle();

  if (ticketRes.error) {
    throw new Error(
      `support_tickets lookup failed: ${(ticketRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }
  const ticket = ticketRes.data as
    | {
        id: string;
        submission_id: string;
        external_task_id: string;
        attempt: number;
      }
    | null;
  if (!ticket) {
    return { ok: false, reason: "ticket_not_found" };
  }

  // (2) Build the v1 empty PipelineStageContext baseline.
  const context = emptyPipelineStageContext();

  // (3) Insert the canonical stage=2 telemetry row. decision_details carries
  //     the full PipelineStageContext (4 empty arrays + context_version) plus
  //     external_task_id + attempt audit fields. duration_ms is Math.round-ed
  //     (Phase 1 lesson 69c75ebf — pipeline_events.duration_ms is integer).
  const completedAt = now();
  const duration_ms = Math.round(
    completedAt.getTime() - startedAt.getTime(),
  );

  const piRes = await supabase.from("pipeline_events").insert({
    swarm_type: "support-tickets",
    stage: 2,
    decision: "stage_2_baseline",
    decision_details: {
      ...context,
      external_task_id: ticket.external_task_id,
      attempt: ticket.attempt,
    },
    duration_ms,
    triggered_by: TRIGGERED_BY,
    automation_run_id: ticket.id,
    // email_id is UUID-typed; the support-tickets handle is submission_id
    // (NOT the PK id, NOT the external_task_id text).
    email_id: ticket.submission_id,
  });
  if (piRes.error) {
    throw new Error(
      `pipeline_events insert failed: ${(piRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }

  // (4) Mark stage2 complete on the support_tickets row. Plans 02-04..02-05
  //     will UPDATE additional context fields here.
  const updRes = await supabase
    .from("support_tickets")
    .update({ stage2_completed_at: completedAt.toISOString() })
    .eq("id", ticket.id);
  if ((updRes as { error?: unknown } | null)?.error) {
    const err = (updRes as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets update stage2_completed_at failed: ${err?.message ?? "unknown"}`,
    );
  }

  return {
    ok: true,
    context,
    pipeline_event_decision: "stage_2_baseline",
  };
}

// ---------------------------------------------------------------------------
// Plan 02-03 Task 4 — full enrichment wiring.
// ---------------------------------------------------------------------------

export interface Stage2FullDeps {
  supabase: SupabaseAdmin;
  now: () => Date;
  /** Injected to enable fast mocked tests + Live-Scribe smoke. */
  transcribe: typeof transcribeViaScribe;
  /** Injected for testability. */
  piiDetect: (text: string | null | undefined) => PiiDetectResult;
  /** Stage-3 trigger emitter. In production: `inngest.send.bind(inngest)`. */
  sendEvent: (payload: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
  costCeilingCents: number;
  elevenLabsApiKey: string | undefined;
  /** Plan 02-04 Task 3 — frame extraction injection point. */
  extractFrames?: (args: ExtractFramesArgs) => Promise<ExtractFramesResult>;
  /** Plan 02-04 Task 3 — user-context injection point. */
  loadUserContext?: (args: LoadUserContextArgs) => Promise<LoadUserContextResult>;
}

type StageTicketFull = {
  id: string;
  submission_id: string;
  external_task_id: string;
  attempt: number;
  submitter_id: string;
  video_storage_url: string | null;
  stage2_cost_cents: number | null;
};

/**
 * Insert a stage=2 pipeline_events row. Throws on .error per the Phase 1
 * b7266f21 lesson (never swallow supabase .error).
 */
async function writeStage2Event(
  supabase: SupabaseAdmin,
  args: {
    decision: string;
    decision_details: Record<string, unknown>;
    duration_ms: number;
    cost_cents?: number | null;
    automation_run_id: string;
    email_id: string;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    swarm_type: "support-tickets",
    stage: 2,
    decision: args.decision,
    decision_details: args.decision_details,
    duration_ms: args.duration_ms,
    triggered_by: TRIGGERED_BY,
    automation_run_id: args.automation_run_id,
    email_id: args.email_id,
  };
  if (args.cost_cents != null) row.cost_cents = args.cost_cents;
  const res = await supabase.from("pipeline_events").insert(row);
  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `pipeline_events insert (decision=${args.decision}) failed: ${err?.message ?? "unknown"}`,
    );
  }
}

/**
 * Pure full-enrichment handler. Aggregates all Stage 2 sub-steps (SSRF gate,
 * transcribe, PII detect, cost ceiling, baseline context) into ONE
 * pipeline_events row at the end. The canonical pipeline_events table has a
 * UNIQUE (email_id, swarm_type, stage) constraint (migration 20260513a) so we
 * cannot emit per-step rows — sub-step outcomes live in decision_details.jsonb.
 */
export async function runStage2FullEnrichment(
  event: Stage2RequestedEvent,
  deps: Stage2FullDeps,
): Promise<Stage2FullResult> {
  const { supabase, now, transcribe, piiDetect, sendEvent, costCeilingCents } = deps;
  const startedAt = now();

  // ---- (1) Load ticket ----
  const ticketRes = await supabase
    .from("support_tickets")
    .select(
      "id, submission_id, external_task_id, attempt, submitter_id, video_storage_url, stage2_cost_cents",
    )
    .eq("id", event.support_ticket_id)
    .maybeSingle();
  if (ticketRes.error) {
    throw new Error(
      `support_tickets lookup failed: ${(ticketRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }
  const ticket = ticketRes.data as StageTicketFull | null;
  if (!ticket) {
    return { ok: false, reason: "ticket_not_found" };
  }

  // Aggregator for the single Stage 2 event we'll write at the end.
  const stepResults: Record<string, unknown> = {
    external_task_id: ticket.external_task_id,
    attempt: ticket.attempt,
  };
  let runningCostCents = ticket.stage2_cost_cents ?? 0;

  // ---- (2) SSRF gate ----
  if (ticket.video_storage_url != null && !validateVideoUrlHost(ticket.video_storage_url)) {
    const updRes = await supabase
      .from("support_tickets")
      .update({ quarantine_state: "rejected_safety_ssrf" })
      .eq("id", ticket.id);
    if ((updRes as { error?: unknown } | null)?.error) {
      const err = (updRes as { error?: { message?: string } }).error;
      throw new Error(
        `support_tickets update quarantine_state failed: ${err?.message ?? "unknown"}`,
      );
    }
    await writeStage2Event(supabase, {
      decision: "rejected_safety_ssrf",
      decision_details: {
        ...stepResults,
        reason: "video_storage_url failed allow-list",
      },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { ok: false, reason: "rejected_safety_ssrf" };
  }

  // ---- (3) Transcribe ----
  let transcribeResult: TranscribeResult | null = null;
  let submitterLocale: "nl" | "en" | "fr" = "en";

  if (ticket.video_storage_url != null) {
    transcribeResult = await transcribe({
      videoUrl: ticket.video_storage_url,
      env: { ELEVENLABS_API_KEY: deps.elevenLabsApiKey },
    });
    const locale = normalizeSubmitterLocale(transcribeResult.language);
    submitterLocale = locale.locale;
    runningCostCents = runningCostCents + transcribeResult.cost_cents;

    const updRes = await supabase
      .from("support_tickets")
      .update({
        transcript: transcribeResult.text,
        submitter_locale: submitterLocale,
        stage2_cost_cents: runningCostCents,
      })
      .eq("id", ticket.id);
    if ((updRes as { error?: unknown } | null)?.error) {
      const err = (updRes as { error?: { message?: string } }).error;
      throw new Error(
        `support_tickets update (transcribe) failed: ${err?.message ?? "unknown"}`,
      );
    }

    stepResults.transcribe = {
      ok: true,
      submitter_locale: submitterLocale,
      submitter_locale_original: locale.original,
      submitter_locale_fallback_used: locale.fallback_used,
      language_probability: transcribeResult.language_probability,
      cost_cents: transcribeResult.cost_cents,
    };
  } else {
    stepResults.transcribe = { ok: false, reason: "no_video_storage_url" };
  }

  // ---- (4) PII / prompt-injection ----
  let piiFlagged = false;
  if (transcribeResult != null) {
    const pii = piiDetect(transcribeResult.text);
    piiFlagged = pii.flagged;
    if (pii.flagged) {
      const updRes = await supabase
        .from("support_tickets")
        .update({
          pii_quarantine: true,
          quarantine_state: pii.reason ?? "pii_flagged",
        })
        .eq("id", ticket.id);
      if ((updRes as { error?: unknown } | null)?.error) {
        const err = (updRes as { error?: { message?: string } }).error;
        throw new Error(
          `support_tickets update (pii_quarantine) failed: ${err?.message ?? "unknown"}`,
        );
      }
    }
    stepResults.pii_check = { flagged: pii.flagged, reason: pii.reason ?? null };
  } else {
    stepResults.pii_check = { skipped: "no_transcript" };
  }

  // ---- (4b) Plan 02-04 — frames + user-context ----
  // Sub-step outcomes fold into the SAME aggregate pipeline_events row
  // (UNIQUE constraint pipeline_events_one_per_stage_email forbids per-step
  // rows). frames + user-context are independent sub-steps; we keep them
  // sequential here for testability of skip/branch semantics.
  const extractFramesFn = deps.extractFrames ?? defaultExtractFrames;
  const loadUserContextFn = deps.loadUserContext ?? defaultLoadUserContext;

  // (4b.i) Frames — skipped on pii_quarantine (privacy) OR no video URL.
  // SSRF reject from extractFrames is captured into the aggregate, not
  // promoted to a separate row (Plan 02-03 locked-contract decision).
  let frameStorageKeys: string[] = [];
  if (piiFlagged) {
    stepResults.frames = { ok: false, reason: "pii_quarantined_skip" };
  } else if (ticket.video_storage_url == null) {
    stepResults.frames = { ok: false, reason: "no_video_storage_url" };
  } else {
    try {
      const fr = await extractFramesFn({
        videoUrl: ticket.video_storage_url,
        supabase: supabase as unknown as ExtractFramesArgs["supabase"],
        ticketId: ticket.id,
      });
      frameStorageKeys = fr.storage_keys;
      stepResults.frames = {
        ok: true,
        frame_count: fr.storage_keys.length,
        cost_cents: fr.cost_cents,
      };
      runningCostCents = runningCostCents + (fr.cost_cents ?? 0);
      if (frameStorageKeys.length > 0) {
        const updFrames = await supabase
          .from("support_tickets")
          .update({ frame_urls: frameStorageKeys })
          .eq("id", ticket.id);
        if ((updFrames as { error?: unknown } | null)?.error) {
          const err = (updFrames as { error?: { message?: string } }).error;
          throw new Error(
            `support_tickets update (frame_urls) failed: ${err?.message ?? "unknown"}`,
          );
        }
      }
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? "frames_failed";
      const message = cause instanceof Error ? cause.message : String(cause);
      stepResults.frames = { ok: false, code, message };
    }
  }

  // (4b.ii) User context — DB-only; runs even on pii_quarantine OR frame
  // failure (the prior-ticket history is not sensitive to the current
  // submission's content).
  try {
    const uc = await loadUserContextFn({
      submitterId: ticket.submitter_id,
      supabase: supabase as unknown as LoadUserContextArgs["supabase"],
    });
    stepResults.prior_tickets_same_user = uc.prior_tickets;
    stepResults.m365_project_2_concern = uc.m365.project_2_concern === true;
    stepResults.m365 = uc.m365;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    stepResults.prior_tickets_same_user = [];
    stepResults.m365_project_2_concern = true;
    stepResults.user_context_error = { message };
  }

  // ---- (5) Cost-ceiling check (post-transcribe) ----
  if (runningCostCents > costCeilingCents) {
    const updRes = await supabase
      .from("support_tickets")
      .update({ proposed_system_status: "cost_ceiling_exceeded" })
      .eq("id", ticket.id);
    if ((updRes as { error?: unknown } | null)?.error) {
      const err = (updRes as { error?: { message?: string } }).error;
      throw new Error(
        `support_tickets update (cost_ceiling_exceeded) failed: ${err?.message ?? "unknown"}`,
      );
    }
    await writeStage2Event(supabase, {
      decision: "cost_ceiling_exceeded",
      decision_details: {
        ...stepResults,
        stage2_cost_cents: runningCostCents,
        ceiling_cents: costCeilingCents,
        when: "post_transcribe",
      },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      cost_cents: runningCostCents,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { ok: false, reason: "cost_ceiling_exceeded_post_transcribe" };
  }

  // ---- (6) Baseline PipelineStageContext (v1 empty) ----
  const context = emptyPipelineStageContext();

  // ---- (7) Mark stage2_completed_at ----
  const completedAt = now();
  const updRes = await supabase
    .from("support_tickets")
    .update({ stage2_completed_at: completedAt.toISOString() })
    .eq("id", ticket.id);
  if ((updRes as { error?: unknown } | null)?.error) {
    const err = (updRes as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets update stage2_completed_at failed: ${err?.message ?? "unknown"}`,
    );
  }

  // ---- (8) Single Stage 2 pipeline_events row ----
  const finalDecision = piiFlagged ? "stage_2_complete_pii_quarantined" : "stage_2_complete";
  await writeStage2Event(supabase, {
    decision: finalDecision,
    decision_details: {
      ...context,
      ...stepResults,
      stage2_cost_cents: runningCostCents,
    },
    duration_ms: Math.round(completedAt.getTime() - startedAt.getTime()),
    cost_cents: runningCostCents,
    automation_run_id: ticket.id,
    email_id: ticket.submission_id,
  });

  // ---- (9) Stage 3 trigger ----
  await sendEvent({
    name: "support-tickets/stage-3.requested",
    data: {
      support_ticket_id: ticket.id,
      submission_id: ticket.submission_id,
      external_task_id: ticket.external_task_id,
      attempt: ticket.attempt,
    },
  });

  return {
    ok: true,
    context,
    pipeline_event_decision: finalDecision,
    transcript: transcribeResult?.text ?? "",
    submitter_locale: submitterLocale,
    stage2_cost_cents: runningCostCents,
    pii_flagged: piiFlagged,
  };
}

/**
 * Inngest wrapper. Function-id is LOCKED — see Plan 02-02 W-3 follow-up:
 * never rename across runs (in-flight runs would orphan). If a v2 schema
 * becomes necessary, bump to `stage-2-support-tickets-enrichment-v2` AND
 * keep this v1 listener registered for a deprecation window.
 */
export const stage2SupportTicketsEnrichment = inngest.createFunction(
  { id: "stage-2-support-tickets-enrichment", retries: 3 },
  { event: "support-tickets/stage-2.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();

    // Memoize the timestamp across replays (docs/inngest-patterns.md §
    // "Non-Deterministic Values Used as DB Keys").
    const baselineNowIso = await step.run("compute-now", async () =>
      new Date().toISOString(),
    );
    const fixedNow = new Date(baselineNowIso);

    return await step.run("run-stage-2-full", async () =>
      runStage2FullEnrichment(event.data as Stage2RequestedEvent, {
        supabase: admin,
        now: () => fixedNow,
        transcribe: transcribeViaScribe,
        piiDetect: detectPiiOrInjection,
        // CLAUDE.md: NEVER destructure inngest.send — bind it.
        sendEvent: inngest.send.bind(inngest) as Stage2FullDeps["sendEvent"],
        costCeilingCents: Number(
          process.env.SUPPORT_STAGE2_COST_CEILING_CENTS ?? DEFAULT_COST_CEILING_CENTS,
        ),
        elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
      }),
    );
  },
);
