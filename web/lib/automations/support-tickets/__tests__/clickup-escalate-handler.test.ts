// Plan 04-05 Task 3 — clickup-escalate-handler.ts tests (RED → GREEN).
//
// Tests the pure runner `runClickupEscalateHandler(event, deps)`.
//
// NINE behaviors covered:
//   E1 - happy path no vendor signal: creates ClickUp task, writes stage=4 row, no vendor-draft fired
//   E2 - happy path WITH vendor signal: ClickUp task created, vendor-draft.requested fired
//   E3 - Zap not configured (fail-closed): ClickupZapNotConfiguredError → no task, decision=stage_4_clickup_escalate_zap_not_configured
//   E4 - idempotency: outbound_clickup_task_id already set → skip create/Orq, reuse existing, vendor signal still fires
//   E5 - Orq fails for AI summary: no ClickUp task, decision=stage_4_clickup_escalate_failed
//   E6 - cost ceiling exceeded post-Orq: STILL creates ClickUp task, decision=stage_4_clickup_escalate_cost_ceiling_exceeded
//   E7 - quarantine defense-in-depth: pii_quarantine=true → blocked, no Orq, no Zap
//   E8 - HANDLE-07 bounded single-shot: exactly 1 fetch() in production file
//   E9 - allowlist enforcement: callClickupCreateTask passes intent='clickup-escalate'

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { runClickupEscalateHandler } from "../clickup-escalate-handler";
import type { ClickupEscalateHandlerDeps } from "../clickup-escalate-handler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "clickup-escalate" as const,
  completeness_verdict: "complete" as const,
};

const TICKET_ROW_BASE = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "en",
  transcript: "PDF export crashes on iController when selecting large date ranges",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: null,
  outbound_clickup_task_id: null,
  video_storage_url: "https://storage.example.com/video-123.mp4",
  frame_urls: ["https://storage.example.com/frame-1.png", "https://storage.example.com/frame-2.png"],
};

const STAGE2_ROW_BASE = {
  decision_details: {
    proposed_system: "iController",
    similar_tickets: [
      {
        ticket_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        source_key: "CU-11111",
        summary_text: "PDF export issue in iController",
        resolution_text: "Fixed by updating the report generation module",
        final_intent: "clickup-escalate",
        final_system: "iController",
        cosine_distance: 0.07,
      },
    ],
  },
};

const SOFTWARE_SYSTEM_NO_VENDOR = {
  id: "sys-1",
  system_key: "iController",
  display_name: "iController",
  clickup_list_id: "list-123",
  default_assignee_user_id: "user-eng-1",
  vendor_locale: "en",
  vendor_email: null,
  vendor_signal_keywords: [],
  enabled: true,
};

const SOFTWARE_SYSTEM_WITH_VENDOR = {
  ...SOFTWARE_SYSTEM_NO_VENDOR,
  vendor_signal_keywords: ["nxt", "nxt crm"],
  vendor_locale: "nl",
  vendor_email: "support@nxt.example",
};

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeSupabaseMock(opts: {
  ticket?: typeof TICKET_ROW_BASE | null;
  stage2Row?: typeof STAGE2_ROW_BASE | null;
  updateError?: string | null;
}) {
  const { ticket = TICKET_ROW_BASE, stage2Row = STAGE2_ROW_BASE, updateError = null } = opts;

  const ticketSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: ticket, error: null }),
    }),
  });

  const stage2Select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: stage2Row, error: null }),
            }),
          }),
        }),
      }),
    }),
  });

  const notifInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "notif-1" }, error: null }),
    }),
  });

  const pipelineInsert = vi.fn().mockResolvedValue({ error: null });

  const ticketUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError ? { message: updateError } : null }),
  });

  const fromMap: Record<string, unknown> = {
    support_tickets: {
      select: ticketSelect,
      update: ticketUpdate,
    },
    pipeline_events: {
      select: stage2Select,
      insert: pipelineInsert,
    },
    support_notifications: {
      insert: notifInsert,
    },
  };

  return {
    from: vi.fn().mockImplementation((table: string) => fromMap[table] ?? { select: vi.fn(), update: vi.fn(), insert: vi.fn() }),
    _pipelineInsert: pipelineInsert,
    _ticketUpdate: ticketUpdate,
    _notifInsert: notifInsert,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runClickupEscalateHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ORQ_API_KEY = "test-orq-key";
  });

  it("E1: happy path no vendor signal — creates ClickUp task, writes stage=4, no vendor-draft event", async () => {
    const supabase = makeSupabaseMock({});

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
    });

    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn().mockReturnValue(new Date("2026-06-01T12:00:00Z"));

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary: vi.fn().mockResolvedValue({ ai_summary: "User reports PDF export crash when selecting large date ranges", cost_cents: 5 }),
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate");
    expect(callClickupCreateTask).toHaveBeenCalledOnce();
    // Should pass intent='clickup-escalate' (E9)
    expect(callClickupCreateTask.mock.calls[0][1]).toBe("clickup-escalate");
    // No vendor-draft event fired (no vendor signal)
    expect(sendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "support-tickets/vendor-draft.requested" }),
    );
    // Stage 4 row written
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision).toBe("stage_4_clickup_escalate");
    expect(insertArg.decision_details.clickup_task_id).toBe("CU-12345");
    expect(insertArg.decision_details.vendor_signal_detected).toBe(false);
  });

  it("E2: happy path WITH vendor signal — fires vendor-draft.requested after ClickUp task", async () => {
    const ticket = { ...TICKET_ROW_BASE, transcript: "NXT crm crashed on save" };
    const supabase = makeSupabaseMock({ ticket });

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-67890",
      clickup_task_url: "https://app.clickup.com/t/CU-67890",
    });

    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn().mockReturnValue(new Date("2026-06-01T12:00:00Z"));

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_WITH_VENDOR],
      invokeOrqSummary: vi.fn().mockResolvedValue({ ai_summary: "NXT CRM crash on save operation", cost_cents: 5 }),
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate");
    expect(callClickupCreateTask).toHaveBeenCalledOnce();

    // vendor-draft.requested fired
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "support-tickets/vendor-draft.requested",
        data: expect.objectContaining({
          vendor_signal: expect.objectContaining({
            matched_keywords: expect.arrayContaining(["nxt"]),
            system_key: "iController",
          }),
        }),
      }),
    );

    // Stage=4 row has vendor_signal_detected=true
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision_details.vendor_signal_detected).toBe(true);
  });

  it("E3: Zap not configured fail-closed — no ClickUp task, decision=zap_not_configured", async () => {
    const supabase = makeSupabaseMock({});
    const { ClickupZapNotConfiguredError } = await import("../clickup-zap-client");

    const callClickupCreateTask = vi.fn();
    const probeZapConfig = vi.fn().mockRejectedValue(
      new ClickupZapNotConfiguredError("placeholder_target_url", "clickup-create-task"),
    );

    const invokeOrqSummary = vi.fn();
    const sendEvent = vi.fn();
    const now = vi.fn().mockReturnValue(new Date());

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig,
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary,
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate_zap_not_configured");
    // Orq was NOT called (pre-check happens before Orq)
    expect(invokeOrqSummary).not.toHaveBeenCalled();
    // callClickupCreateTask was NOT called (only the probe was)
    expect(callClickupCreateTask).not.toHaveBeenCalled();
    // No vendor-draft event
    expect(sendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "support-tickets/vendor-draft.requested" }),
    );
    // Stage=4 row written with zap_not_configured decision
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision).toBe("stage_4_clickup_escalate_zap_not_configured");
    expect(insertArg.decision_details.reason).toBe("placeholder_target_url");
  });

  it("E4: idempotency — outbound_clickup_task_id already set → skip create/Orq, vendor signal still fires", async () => {
    const ticket = {
      ...TICKET_ROW_BASE,
      outbound_clickup_task_id: "CU-99999",
      transcript: "NXT crm crashed on save",
    };
    const supabase = makeSupabaseMock({ ticket });

    const callClickupCreateTask = vi.fn();
    const invokeOrqSummary = vi.fn();
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn().mockReturnValue(new Date());

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_WITH_VENDOR],
      invokeOrqSummary,
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate");
    // NO callClickupCreateTask — idempotent reuse
    expect(callClickupCreateTask).not.toHaveBeenCalled();
    // NO Orq call
    expect(invokeOrqSummary).not.toHaveBeenCalled();
    // idempotent_reuse=true in decision_details
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision_details.idempotent_reuse).toBe(true);
    expect(insertArg.decision_details.clickup_task_id).toBe("CU-99999");
    // Vendor signal still fires on retry (best-effort enhancement)
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "support-tickets/vendor-draft.requested" }),
    );
  });

  it("E5: Orq fails for AI summary → no ClickUp task, decision=stage_4_clickup_escalate_failed", async () => {
    const supabase = makeSupabaseMock({});

    const callClickupCreateTask = vi.fn();
    const invokeOrqSummary = vi.fn().mockRejectedValue(new Error("orq_request_failed"));
    const sendEvent = vi.fn();
    const now = vi.fn().mockReturnValue(new Date());

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary,
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate_failed");
    // NO ClickUp task created (we don't create without summary)
    expect(callClickupCreateTask).not.toHaveBeenCalled();
    // decision written
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision).toBe("stage_4_clickup_escalate_failed");
    expect(insertArg.decision_details.reason).toBe("ai_summary_failed");
  });

  it("E6: cost ceiling exceeded post-Orq — STILL creates ClickUp task, decision=cost_ceiling_exceeded", async () => {
    // Stage2+3 already have 45 cents, Orq summary adds 10 → total 55 > ceiling 50
    const ticket = { ...TICKET_ROW_BASE, stage2_cost_cents: 35, stage3_cost_cents: 10 };
    const supabase = makeSupabaseMock({ ticket });

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-11111",
      clickup_task_url: "https://app.clickup.com/t/CU-11111",
    });

    const invokeOrqSummary = vi.fn().mockResolvedValue({ ai_summary: "Summary text", cost_cents: 10 });
    const sendEvent = vi.fn();
    const now = vi.fn().mockReturnValue(new Date());

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary,
      costCeilingCents: 50, // ceiling is 50 cents
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    // STILL creates ClickUp task (we paid for summary)
    expect(callClickupCreateTask).toHaveBeenCalledOnce();
    expect(result.decision).toBe("stage_4_clickup_escalate_cost_ceiling_exceeded");
  });

  it("E7: quarantine defense-in-depth — pii_quarantine=true → blocked, no Orq, no Zap", async () => {
    const ticket = { ...TICKET_ROW_BASE, pii_quarantine: true };
    const supabase = makeSupabaseMock({ ticket });

    const callClickupCreateTask = vi.fn();
    const invokeOrqSummary = vi.fn();
    const sendEvent = vi.fn();
    const now = vi.fn().mockReturnValue(new Date());

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent,
      now,
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary,
      costCeilingCents: 100,
    };

    const result = await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(result.decision).toBe("stage_4_clickup_escalate_quarantine_blocked");
    expect(invokeOrqSummary).not.toHaveBeenCalled();
    expect(callClickupCreateTask).not.toHaveBeenCalled();
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision).toBe("stage_4_clickup_escalate_quarantine_blocked");
  });

  it("E8: HANDLE-07 bounded single-shot — exactly 1 fetch() call in production file", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const productionFile = join(__dirname, "../clickup-escalate-handler.ts");
    const source = readFileSync(productionFile, "utf8");

    // Count literal fetch( occurrences (Orq AI summary call)
    const fetchMatches = source.match(/\bfetch\(/g) ?? [];
    expect(fetchMatches.length).toBe(1);

    // Exactly 1 callClickupCreateTask( call (T-04-05-08)
    const zapMatches = source.match(/callClickupCreateTask\(/g) ?? [];
    expect(zapMatches.length).toBe(1);
  });

  it("E9: allowlist enforcement — callClickupCreateTask is passed intent='clickup-escalate'", async () => {
    const supabase = makeSupabaseMock({});

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
    });

    const deps: ClickupEscalateHandlerDeps = {
      supabase: supabase as unknown as ClickupEscalateHandlerDeps["supabase"],
      callClickupCreateTask,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      sendEvent: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NO_VENDOR],
      invokeOrqSummary: vi.fn().mockResolvedValue({ ai_summary: "AI summary text", cost_cents: 5 }),
      costCeilingCents: 100,
    };

    await runClickupEscalateHandler(EVENT_BASE, deps);

    expect(callClickupCreateTask).toHaveBeenCalledWith(
      expect.any(Object),
      "clickup-escalate",
    );
  });
});
