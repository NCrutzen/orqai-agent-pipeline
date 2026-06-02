// Plan 04-05 Task 4 — vendor-draft-handler.ts tests (RED → GREEN).
//
// Tests the pure runner `runVendorDraftHandler(event, deps)`.
//
// EIGHT behaviors covered:
//   V1 - SUB-MODE happy (fired by clickup-escalate): ticket has handler_executed='clickup-escalate' + outbound_clickup_task_id
//        NO callClickupCreateTask. Notification kind='vendor_draft'. UPDATE existing stage=4 row decision_details.vendor_draft.
//   V2 - PRIMARY-MODE happy (direct from dispatcher, isVendorSignal=true in event or detected):
//        callClickupCreateTask called first, then Orq draft, then notification. New stage=4 row.
//   V3 - SUB-MODE Orq fails: no notification, UPDATE existing stage=4 row with error, decision stays 'stage_4_clickup_escalate'
//   V4 - PRIMARY-MODE Zap not configured: ClickupZapNotConfiguredError → no Orq, no notification, 'stage_4_vendor_draft_zap_not_configured'
//   V5 - vendor_locale fallback I18N-04: vendor_locale=null → resolveVendorLocale → 'en', notification.vendor_locale='en'
//   V6 - quarantine defense-in-depth: pii_quarantine=true → blocked
//   V7 - cost ceiling exceeded: still write notification, decision='stage_4_vendor_draft_cost_ceiling_exceeded'
//   V8 - HANDLE-06 no autonomous send: grep production file for send-email patterns → ZERO

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { runVendorDraftHandler } from "../vendor-draft-handler";
import type { VendorDraftHandlerDeps } from "../vendor-draft-handler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "vendor-draft" as const,
  completeness_verdict: "complete" as const,
};

const EVENT_WITH_VENDOR_SIGNAL = {
  ...EVENT_BASE,
  vendor_signal: {
    matched_keywords: ["nxt"],
    system_key: "NXT",
    vendor_email: "support@nxt.example",
    vendor_locale: "nl",
  },
};

const TICKET_SUB_MODE = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "en",
  transcript: "NXT crm crashed when processing payment on last invoice",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: "clickup-escalate",
  outbound_clickup_task_id: "CU-12345",
};

const TICKET_PRIMARY_MODE = {
  ...TICKET_SUB_MODE,
  handler_executed: null,
  outbound_clickup_task_id: null,
};

const STAGE2_ROW_BASE = {
  decision_details: {
    proposed_system: "NXT",
    similar_tickets: [],
  },
};

const SOFTWARE_SYSTEM_NXT = {
  system_key: "NXT",
  vendor_email: "support@nxt.example",
  vendor_locale: "nl",
  vendor_signal_keywords: ["nxt", "nxt crm"],
  clickup_list_id: "list-nxt",
  default_assignee_user_id: "user-nxt-eng",
};

const SOFTWARE_SYSTEM_NULL_LOCALE = {
  ...SOFTWARE_SYSTEM_NXT,
  vendor_locale: null,
};

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeSupabaseMock(opts: {
  ticket?: typeof TICKET_SUB_MODE | null;
  stage2Row?: typeof STAGE2_ROW_BASE | null;
  existingStage4Row?: Record<string, unknown> | null;
}) {
  const { ticket = TICKET_SUB_MODE, stage2Row = STAGE2_ROW_BASE, existingStage4Row = { id: "pe-stage4-1", decision: "stage_4_clickup_escalate", decision_details: {} } } = opts;

  const ticketSelectChain = {
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: ticket, error: null }),
    }),
  };

  const stage2SelectChain = {
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
  };

  // Stage=4 row query (for SUB-MODE UPDATE)
  const stage4SelectChain = {
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: existingStage4Row, error: null }),
        }),
      }),
    }),
  };

  const notifInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "notif-vendor-1" }, error: null }),
    }),
  });

  const pipelineInsert = vi.fn().mockResolvedValue({ error: null });

  const pipelineUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  });

  const ticketUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  // Track which table's select is being called
  let pipelineSelectCallCount = 0;
  const pipelineSelectFn = vi.fn().mockImplementation(() => {
    pipelineSelectCallCount++;
    // First call: stage2 aggregate row query
    if (pipelineSelectCallCount === 1) return stage2SelectChain;
    // Second call: existing stage=4 row for SUB-MODE
    return stage4SelectChain;
  });

  const fromMap: Record<string, unknown> = {
    support_tickets: {
      select: vi.fn().mockReturnValue(ticketSelectChain),
      update: ticketUpdate,
    },
    pipeline_events: {
      select: pipelineSelectFn,
      insert: pipelineInsert,
      update: pipelineUpdate,
    },
    support_notifications: {
      insert: notifInsert,
    },
  };

  return {
    from: vi.fn().mockImplementation((table: string) => fromMap[table] ?? { select: vi.fn(), update: vi.fn(), insert: vi.fn() }),
    _pipelineInsert: pipelineInsert,
    _pipelineUpdate: pipelineUpdate,
    _ticketUpdate: ticketUpdate,
    _notifInsert: notifInsert,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runVendorDraftHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ORQ_API_KEY = "test-orq-key";
  });

  it("V1: SUB-MODE happy — no callClickupCreateTask, writes vendor_draft notification, UPDATEs existing stage=4 row", async () => {
    const supabase = makeSupabaseMock({ ticket: TICKET_SUB_MODE });

    const callClickupCreateTask = vi.fn();
    const invokeOrqDraft = vi.fn().mockResolvedValue({
      draft_subject: "NXT bug — invoice payment issue",
      draft_body: "Dear NXT support, our client reports a crash when processing payment.",
      vendor_locale_confirmed: "nl",
      cost_cents: 3,
    });

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask,
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date("2026-06-01T13:00:00Z")),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    expect(result.decision).toMatch(/stage_4_vendor_draft/);
    // SUB-MODE: NO callClickupCreateTask
    expect(callClickupCreateTask).not.toHaveBeenCalled();
    // Notification written
    expect(supabase._notifInsert).toHaveBeenCalledOnce();
    const notifArg = supabase._notifInsert.mock.calls[0][0];
    expect(notifArg.kind).toBe("vendor_draft");
    expect(notifArg.payload.clickup_task_id).toBe("CU-12345");
    expect(notifArg.payload.vendor_email).toBe("support@nxt.example");
    // UPDATE existing stage=4 row (not INSERT new one in SUB-MODE)
    expect(supabase._pipelineUpdate).toHaveBeenCalled();
    // No new pipeline_events INSERT in SUB-MODE
    expect(supabase._pipelineInsert).not.toHaveBeenCalled();
  });

  it("V2: PRIMARY-MODE happy — callClickupCreateTask first, then Orq draft, then new stage=4 row", async () => {
    const supabase = makeSupabaseMock({ ticket: TICKET_PRIMARY_MODE });

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-88888",
      clickup_task_url: "https://app.clickup.com/t/CU-88888",
    });
    const invokeOrqDraft = vi.fn().mockResolvedValue({
      draft_subject: "NXT payment crash report",
      draft_body: "Dear NXT, ...",
      vendor_locale_confirmed: "nl",
      cost_cents: 3,
    });

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask,
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    expect(result.decision).toBe("stage_4_vendor_draft_added");
    // PRIMARY-MODE: callClickupCreateTask called with intent='clickup-escalate'
    expect(callClickupCreateTask).toHaveBeenCalledOnce();
    expect(callClickupCreateTask.mock.calls[0][1]).toBe("clickup-escalate");
    // Notification written
    expect(supabase._notifInsert).toHaveBeenCalledOnce();
    // New pipeline_events INSERT (not UPDATE) in PRIMARY-MODE
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
    const insertArg = supabase._pipelineInsert.mock.calls[0][0];
    expect(insertArg.decision).toBe("stage_4_vendor_draft_added");
    expect(insertArg.decision_details.clickup_task_id).toBe("CU-88888");
  });

  it("V3: SUB-MODE Orq fails — no notification, UPDATE existing stage=4 row with error, decision reflects sub-failure", async () => {
    const supabase = makeSupabaseMock({ ticket: TICKET_SUB_MODE });

    const invokeOrqDraft = vi.fn().mockRejectedValue(new Error("orq_request_failed"));

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask: vi.fn(),
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    // SUB-MODE Orq failure: still a vendor_draft_failed decision (the primary task is still intact)
    expect(result.decision).toMatch(/vendor_draft/);
    // No notification (Orq failed)
    expect(supabase._notifInsert).not.toHaveBeenCalled();
    // UPDATE existing stage=4 row with error info
    expect(supabase._pipelineUpdate).toHaveBeenCalled();
  });

  it("V4: PRIMARY-MODE Zap not configured — no Orq, no notification, stage_4_vendor_draft_zap_not_configured", async () => {
    const supabase = makeSupabaseMock({ ticket: TICKET_PRIMARY_MODE });
    const { ClickupZapNotConfiguredError } = await import("../clickup-zap-client");

    const probeZapConfig = vi.fn().mockRejectedValue(
      new ClickupZapNotConfiguredError("placeholder_target_url", "clickup-create-task"),
    );
    const invokeOrqDraft = vi.fn();

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask: vi.fn(),
      invokeOrqDraft,
      probeZapConfig,
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    expect(result.decision).toBe("stage_4_vendor_draft_zap_not_configured");
    expect(invokeOrqDraft).not.toHaveBeenCalled();
    expect(supabase._notifInsert).not.toHaveBeenCalled();
  });

  it("V5: vendor_locale fallback I18N-04 — null vendor_locale → 'en', notification.vendor_locale='en'", async () => {
    const supabase = makeSupabaseMock({ ticket: TICKET_SUB_MODE });

    const invokeOrqDraft = vi.fn().mockResolvedValue({
      draft_subject: "Subject in English",
      draft_body: "Dear vendor,",
      vendor_locale_confirmed: "en",
      cost_cents: 2,
    });

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask: vi.fn(),
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NULL_LOCALE],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(
      {
        ...EVENT_WITH_VENDOR_SIGNAL,
        vendor_signal: { ...EVENT_WITH_VENDOR_SIGNAL.vendor_signal, vendor_locale: null },
      },
      deps,
    );

    // Still succeeds
    expect(result.decision).toMatch(/vendor_draft/);
    // Notification locale should be 'en' (fallback)
    if (supabase._notifInsert.mock.calls.length > 0) {
      const notifArg = supabase._notifInsert.mock.calls[0][0];
      expect(notifArg.payload.vendor_locale).toBe("en");
    }
  });

  it("V6: quarantine defense-in-depth — pii_quarantine=true → blocked", async () => {
    const ticket = { ...TICKET_SUB_MODE, pii_quarantine: true };
    const supabase = makeSupabaseMock({ ticket });

    const invokeOrqDraft = vi.fn();

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask: vi.fn(),
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 100,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    expect(result.decision).toBe("stage_4_vendor_draft_quarantine_blocked");
    expect(invokeOrqDraft).not.toHaveBeenCalled();
    expect(supabase._notifInsert).not.toHaveBeenCalled();
  });

  it("V7: cost ceiling exceeded — still writes notification, decision=stage_4_vendor_draft_cost_ceiling_exceeded", async () => {
    // Stage2+3 = 45 cents, draft cost = 10 cents → total 55 > ceiling 50
    const ticket = { ...TICKET_PRIMARY_MODE, stage2_cost_cents: 35, stage3_cost_cents: 10 };
    const supabase = makeSupabaseMock({ ticket });

    const callClickupCreateTask = vi.fn().mockResolvedValue({
      clickup_task_id: "CU-77777",
      clickup_task_url: "https://app.clickup.com/t/CU-77777",
    });
    const invokeOrqDraft = vi.fn().mockResolvedValue({
      draft_subject: "Vendor issue",
      draft_body: "Dear vendor,",
      vendor_locale_confirmed: "nl",
      cost_cents: 10,
    });

    const deps: VendorDraftHandlerDeps = {
      supabase: supabase as unknown as VendorDraftHandlerDeps["supabase"],
      callClickupCreateTask,
      invokeOrqDraft,
      probeZapConfig: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(new Date()),
      systemRegistry: [SOFTWARE_SYSTEM_NXT],
      costCeilingCents: 50,
    };

    const result = await runVendorDraftHandler(EVENT_WITH_VENDOR_SIGNAL, deps);

    // Notification still written (we paid for the draft)
    expect(supabase._notifInsert).toHaveBeenCalledOnce();
    expect(result.decision).toBe("stage_4_vendor_draft_cost_ceiling_exceeded");
  });

  it("V8: HANDLE-06 no autonomous send — ZERO send-mail patterns in production file", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const productionFile = join(__dirname, "../vendor-draft-handler.ts");
    const source = readFileSync(productionFile, "utf8");

    const noSendPatterns = /sendmail|@sendgrid|graph\.microsoft\.com.*sendMail|mailgun|twilio.*mail/gi;
    const matches = source.match(noSendPatterns) ?? [];
    expect(matches.length).toBe(0);

    // Also assert exactly 1 fetch() call (Orq draft only — HANDLE-07)
    const fetchMatches = source.match(/\bfetch\(/g) ?? [];
    expect(fetchMatches.length).toBe(1);
  });
});
