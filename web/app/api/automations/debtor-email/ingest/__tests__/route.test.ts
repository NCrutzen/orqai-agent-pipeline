// Phase 82.2 Plan 07 D-A — thin-ingest contract tests.
//
// The route is now Stage 0's HTTP boundary only: validate → load settings
// → fetch Outlook → resolve email_pipeline.emails.id → INSERT pending
// placeholder automation_runs → inngest.send stage-0/email.received → 200.
//
// Tests here lock that the regex / whitelist / auto-action / Stage-1 emit
// surfaces are GONE (now Plan 06 Stage 1 worker concerns) and that the
// stage-0/email.received payload carries the full passthrough field set the
// downstream Stage 0 → Stage 1 chain needs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────

const supabaseInserts: Array<{ table: string; schema: string | null; payload: Record<string, unknown> }> = [];
const sendCalls: Array<{ name: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn((p: { name: string; data: Record<string, unknown> }) => {
      sendCalls.push(p);
      return Promise.resolve({ ids: ["evt"] });
    }),
  },
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/automations/debtor-email/mailboxes", () => ({
  ICONTROLLER_MAILBOXES: { "debiteuren@smeba.nl": 1 },
}));

vi.mock("@/lib/outlook", () => ({
  getMessageMeta: vi.fn(),
  fetchMessageBody: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => {
  function makeChain(table: string, schema: string | null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      supabaseInserts.push({ table: `${table}:update`, schema, payload });
      return chain;
    });
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
      // email_pipeline.emails SELECT: return no existing row so the
      // INSERT branch fires (and yields email_id = "email-uuid-1").
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === "automation_runs") {
        return Promise.resolve({ data: { id: "ar-stage0" }, error: null });
      }
      if (table === "emails") {
        return Promise.resolve({ data: { id: "email-uuid-1" }, error: null });
      }
      return Promise.resolve({ data: { id: "x" }, error: null });
    });
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

async function postIngest(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  const req = new NextRequest("http://localhost/api/automations/debtor-email/ingest", {
    method: "POST",
    headers: { "x-zapier-secret": "test-secret", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function automationRunInserts() {
  return supabaseInserts.filter((r) => r.table === "automation_runs");
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/automations/debtor-email/ingest — D-A thin ingest", () => {
  beforeEach(async () => {
    supabaseInserts.length = 0;
    sendCalls.length = 0;
    process.env.ZAPIER_INGEST_SECRET = "test-secret";

    const outlook = await import("@/lib/outlook");
    vi.mocked(outlook.getMessageMeta).mockResolvedValue({
      subject: "any subject",
      from: "alice@vendor.com",
      fromName: "Alice",
      receivedAt: "2026-05-05T10:00:00Z",
      categories: [],
    } as unknown as Awaited<ReturnType<typeof outlook.getMessageMeta>>);
    vi.mocked(outlook.fetchMessageBody).mockResolvedValue({
      bodyText: "body text",
    } as unknown as Awaited<ReturnType<typeof outlook.fetchMessageBody>>);
  });

  it("creates ONE pending placeholder automation_runs row and fires stage-0/email.received UNCONDITIONALLY", async () => {
    const res = await postIngest({
      messageId: "outlook-msg-id-abc-123",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("stage_0_dispatched");
    expect(json.automation_run_id).toBe("ar-stage0");

    // Exactly one Stage 0 placeholder (no other automation_runs surfaces).
    const runs = automationRunInserts();
    expect(runs).toHaveLength(1);
    const ar = runs[0].payload;
    expect(ar.status).toBe("pending");
    expect(ar.swarm_type).toBe("debtor-email");
    expect(ar.topic).toBeNull();
    expect((ar.result as Record<string, unknown>).stage).toBe("stage_0_safety_pending");

    // Stage 0 event fired with full passthrough payload.
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].name).toBe("stage-0/email.received");
    const data = sendCalls[0].data;
    expect(data.automation_run_id).toBe("ar-stage0");
    expect(data.email_id).toBe("email-uuid-1");
    expect(data.swarm_type).toBe("debtor-email");
    expect(data.entity).toBe("smeba");
    expect(data.mailbox_id).toBe(1);
    expect(data.from).toBe("alice@vendor.com");
    expect(data.fromName).toBe("Alice");
    expect(data.receivedAt).toBe("2026-05-05T10:00:00Z");
    expect(data.subject).toBe("any subject");
    expect(data.body_text).toBe("body text");
    expect(data.safety_overridden).toBeUndefined(); // Pitfall 5
  });

  it("does NOT emit any pipeline_events row (Stage 1 emit is now Plan 06 worker's job)", async () => {
    await postIngest({
      messageId: "outlook-msg-id-xyz",
      source_mailbox: "debiteuren@smeba.nl",
    });
    const pipelineEvents = supabaseInserts.filter((r) => r.table === "pipeline_events");
    expect(pipelineEvents).toHaveLength(0);
  });

  it("does NOT emit categorize/archive/iController-cleanup surfaces", async () => {
    await postIngest({
      messageId: "outlook-msg-id-categorize",
      source_mailbox: "debiteuren@smeba.nl",
    });
    // The only automation_runs INSERT is the Stage 0 placeholder. No
    // 'predicted', no 'completed' categorize+archive row, no
    // debtor-email-cleanup pending row.
    const runs = automationRunInserts();
    expect(runs).toHaveLength(1);
    const automations = runs.map((r) => r.payload.automation);
    expect(automations).not.toContain("debtor-email-cleanup");
  });

  it("respects settings.ingest_enabled=false → 200 skipped_disabled with no event fired", async () => {
    // Override the labeling_settings mock to return disabled.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const original = createAdminClient;
    const adminMod = await import("@/lib/supabase/admin");
    vi.spyOn(adminMod, "createAdminClient").mockImplementationOnce(() => {
      function makeChain(table: string): Record<string, unknown> {
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
                ingest_enabled: false,
                auto_label_enabled: false,
                triage_shadow_mode: false,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.insert = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: { id: "x" }, error: null }));
        return chain;
      }
      return {
        from: (t: string) => makeChain(t),
        schema: () => ({ from: (t: string) => makeChain(t) }),
      } as unknown as ReturnType<typeof original>;
    });

    const res = await postIngest({
      messageId: "outlook-msg-disabled",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("skipped_disabled");
    expect(sendCalls).toHaveLength(0);
  });

  it("404 from Outlook fetch → 200 skipped_not_found with audit row, no Stage 0 dispatch", async () => {
    const outlook = await import("@/lib/outlook");
    vi.mocked(outlook.getMessageMeta).mockRejectedValueOnce(new Error("Graph 404 not found"));
    vi.mocked(outlook.fetchMessageBody).mockRejectedValueOnce(new Error("Graph 404 not found"));

    const res = await postIngest({
      messageId: "outlook-msg-404",
      source_mailbox: "debiteuren@smeba.nl",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("skipped_not_found");

    // Audit row exists for the fetch failure.
    const runs = automationRunInserts();
    expect(runs).toHaveLength(1);
    expect(runs[0].payload.status).toBe("completed");
    expect((runs[0].payload.result as Record<string, unknown>).outcome).toBe("not_found");

    // No Stage 0 dispatch.
    expect(sendCalls).toHaveLength(0);
  });
});
