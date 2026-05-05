// Phase 70 Plan 05 — Stage 1 pipeline_events emit integration tests for the
// debtor-email ingest API route.
//
// These replace the Plan 01 Wave-0 scaffold: each previously skipped test is
// now a real assertion against a mocked Supabase admin client that records every
// `.from(table).insert(payload)` into a shared `supabaseInserts` array
// (mock pattern modeled on
// `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`).
//
// Coverage:
//  1. Regex-matched email (auto-reply subject) emits ONE pipeline_events row
//     at stage=1 with decision = matched category and numeric confidence
//     pass-through.
//  2. Regex no-match email emits ONE pipeline_events row at stage=1 with
//     decision = 'unknown'.
//  3. The Stage 1 emit's decision_details carries the Outlook string
//     messageId in `decision_details.outlook_message_id` per RESEARCH
//     §Pitfall 3 fallback (email_id stays null because the canonical
//     email_pipeline.emails.id uuid is not in scope at the classify() site).
//  4. TELE-02 regression: legacy `automation_runs` INSERTs still happen
//     alongside the new `pipeline_events` row.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────

const supabaseInserts: Array<{ table: string; schema: string | null; payload: Record<string, unknown> }> = [];

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ["evt"] }) },
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/classifier/cache", () => ({
  // Empty whitelist → all classified rows take the bulk-review path
  // (skipped_not_whitelisted / skipped_unknown), keeping the tests focused
  // on the Stage 1 emit and away from categorize/archive side effects.
  readWhitelist: vi.fn().mockResolvedValue(new Set<string>()),
}));

vi.mock("@/lib/automations/debtor-email/mailboxes", () => ({
  ICONTROLLER_MAILBOXES: { "debiteuren@smeba.nl": "smeba-mbx" },
}));

vi.mock("@/lib/outlook", () => ({
  getMessageMeta: vi.fn(),
  fetchMessageBody: vi.fn(),
  categorizeEmail: vi.fn(),
  archiveEmail: vi.fn(),
}));

// classify() is the unit under test — we control its return per case.
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => {
  function makeChain(table: string, schema: string | null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === "labeling_settings") {
        return Promise.resolve({
          data: {
            source_mailbox: "debiteuren@smeba.nl",
            entity: "smeba",
            icontroller_company: "smeba",
            ingest_enabled: true,
            auto_label_enabled: false,
            triage_shadow_mode: false,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => Promise.resolve({ data: { id: "ar-1" }, error: null }));
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      supabaseInserts.push({ table, schema, payload });
      return chain;
    });
    return chain;
  }
  function makeAdmin() {
    return {
      from: (table: string) => makeChain(table, null),
      schema: (s: string) => ({
        from: (table: string) => makeChain(table, s),
      }),
    };
  }
  return { createAdminClient: () => makeAdmin() };
});

// ── Helpers ──────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function postIngest(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  const req = new NextRequest("http://localhost/api/automations/debtor-email/ingest", {
    method: "POST",
    headers: { "x-zapier-secret": "test-secret", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function pipelineEventRows() {
  return supabaseInserts.filter((r) => r.table === "pipeline_events");
}

function automationRunRows() {
  return supabaseInserts.filter((r) => r.table === "automation_runs");
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/automations/debtor-email/ingest — Stage 1 pipeline_events emit", () => {
  beforeEach(async () => {
    supabaseInserts.length = 0;
    process.env.ZAPIER_INGEST_SECRET = "test-secret";

    const outlook = await import("@/lib/outlook");
    vi.mocked(outlook.getMessageMeta).mockResolvedValue({
      subject: "Automatic reply: out of office",
      from: "alice@vendor.com",
      fromName: "Alice",
      receivedAt: "2026-05-05T10:00:00Z",
      categories: [],
    } as unknown as Awaited<ReturnType<typeof outlook.getMessageMeta>>);
    vi.mocked(outlook.fetchMessageBody).mockResolvedValue({
      bodyText: "I am away until next week.",
    } as unknown as Awaited<ReturnType<typeof outlook.fetchMessageBody>>);
    vi.mocked(outlook.categorizeEmail).mockResolvedValue({ success: true } as unknown as Awaited<ReturnType<typeof outlook.categorizeEmail>>);
    vi.mocked(outlook.archiveEmail).mockResolvedValue({ success: true } as unknown as Awaited<ReturnType<typeof outlook.archiveEmail>>);
  });

  it("with a regex-classified email emits ONE pipeline_events row at Stage 1 with decision = matched category", async () => {
    const { classify } = await import("@/lib/debtor-email/classify");
    vi.mocked(classify).mockReturnValue({
      category: "auto_reply",
      confidence: 0.95,
      matchedRule: "subject_autoreply",
    });

    const res = await postIngest({
      messageId: "outlook-msg-id-abc-123",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);

    const events = pipelineEventRows();
    expect(events).toHaveLength(1);
    const ev = events[0].payload;
    expect(ev.stage).toBe(1);
    expect(ev.swarm_type).toBe("debtor-email");
    expect(ev.decision).toBe("auto_reply");
    expect(ev.confidence).toBe(0.95);
    expect(ev.triggered_by).toBe("pipeline");
    expect((ev.decision_details as Record<string, unknown>).matched).toBe(true);
    expect((ev.decision_details as Record<string, unknown>).regex_rule_id).toBe("subject_autoreply");
  });

  it("with an unknown email (regex no-match) emits ONE pipeline_events row at Stage 1 with decision = 'unknown'", async () => {
    const { classify } = await import("@/lib/debtor-email/classify");
    vi.mocked(classify).mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const res = await postIngest({
      messageId: "outlook-msg-id-def-456",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);

    const events = pipelineEventRows();
    expect(events).toHaveLength(1);
    const ev = events[0].payload;
    expect(ev.stage).toBe(1);
    expect(ev.decision).toBe("unknown");
    expect((ev.decision_details as Record<string, unknown>).matched).toBe(false);
    expect((ev.decision_details as Record<string, unknown>).regex_rule_id).toBe("no_match");
  });

  it("Stage 1 emit decision_details carries the Outlook messageId (canonical uuid not in scope at classify() per Pitfall 3)", async () => {
    const { classify } = await import("@/lib/debtor-email/classify");
    vi.mocked(classify).mockReturnValue({
      category: "auto_reply",
      confidence: 0.92,
      matchedRule: "subject_acknowledgement",
    });

    const outlookMessageId = "AAMkAGI2Outlook-string-id-not-a-uuid";
    const res = await postIngest({
      messageId: outlookMessageId,
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);

    const events = pipelineEventRows();
    expect(events).toHaveLength(1);
    const ev = events[0].payload;
    // Per Pitfall 3 fallback: email_id stays null because the canonical
    // email_pipeline.emails.id (uuid) is not in scope at the classify()
    // site. The Outlook string id lives in decision_details.
    expect(ev.email_id).toBeNull();
    const details = ev.decision_details as Record<string, unknown>;
    expect(details.outlook_message_id).toBe(outlookMessageId);
    // Sanity: the Outlook id is NOT a uuid — confirms we are NOT mistakenly
    // shoving a non-uuid string into the uuid email_id column.
    expect(UUID_RE.test(outlookMessageId)).toBe(false);
  });

  it("TELE-02 regression: legacy automation_runs INSERTs still happen alongside the pipeline_events row", async () => {
    const { classify } = await import("@/lib/debtor-email/classify");
    vi.mocked(classify).mockReturnValue({
      category: "auto_reply",
      confidence: 0.95,
      matchedRule: "subject_autoreply",
    });

    const res = await postIngest({
      messageId: "outlook-msg-tele02",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);

    expect(pipelineEventRows()).toHaveLength(1);
    // Bulk-review path emits exactly one automation_runs row (status='predicted').
    expect(automationRunRows().length).toBeGreaterThanOrEqual(1);
    const tables = supabaseInserts.map((r) => r.table);
    expect(tables).toContain("automation_runs");
    expect(tables).toContain("pipeline_events");
  });
});
