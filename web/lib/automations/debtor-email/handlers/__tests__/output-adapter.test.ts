// Phase 65 Plan 04 Task 1 — output-adapter unit tests.
import { describe, it, expect, vi } from "vitest";
import {
  bodyAgentOutputToHandlerOutput,
  loadHandlerOutputsForRun,
} from "../output-adapter";
import type { BodyAgentOutput } from "@/lib/automations/debtor-email/triage/types";

describe("bodyAgentOutputToHandlerOutput", () => {
  it("maps BodyAgentOutput → HandlerOutput with content_kind=draft_body and forwards detected_tone", () => {
    const body: BodyAgentOutput = {
      body_html: "<p>Hi there, here is your invoice copy.</p>",
      detected_tone: "neutral",
      body_version: "2026-04-23.v1",
    };
    const out = bodyAgentOutputToHandlerOutput(body, {
      handler_key: "debtor-copy-document-body-agent",
      intent: "copy_document_request",
      language: "nl",
      references: ["INV-12345"],
      confidence: "high",
    });
    expect(out.handler_key).toBe("debtor-copy-document-body-agent");
    expect(out.intent).toBe("copy_document_request");
    expect(out.content_kind).toBe("draft_body");
    expect(out.content).toBe(body.body_html);
    expect(out.tone).toBe("neutral");
    expect(out.language).toBe("nl");
    expect(out.references).toEqual(["INV-12345"]);
    expect(out.confidence).toBe("high");
  });

  it("preserves detected_tone='de-escalation'", () => {
    const body: BodyAgentOutput = {
      body_html: "<p>I understand the frustration.</p>",
      detected_tone: "de-escalation",
      body_version: "2026-04-23.v1",
    };
    const out = bodyAgentOutputToHandlerOutput(body, {
      handler_key: "x",
      intent: "payment_dispute",
      language: "fr",
      references: [],
      confidence: "medium",
    });
    expect(out.tone).toBe("de-escalation");
  });
});

// Build a minimal supabase chain stub: from(...).select(...).eq(...).neq(...) → { data, error }.
function makeSupabaseStub(rows: unknown[]) {
  const neq = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn(() => ({ neq }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const admin = { from } as unknown as Parameters<typeof loadHandlerOutputsForRun>[0];
  return { admin, from, select, eq, neq };
}

describe("loadHandlerOutputsForRun", () => {
  it("decodes JSONB string-wrapped tool_outputs (double-encode guard)", async () => {
    const handlerOutput = {
      handler_key: "h1",
      intent: "address_change",
      content_kind: "action_confirmation" as const,
      content: "Address updated.",
      language: "nl" as const,
      tone: "neutral" as const,
      references: ["addr-1"],
      confidence: "high" as const,
    };
    const rows = [
      {
        intent: "address_change",
        // Double-encoded JSONB: a JSON string that contains a JSON object.
        tool_outputs: JSON.stringify({ handler_output: handlerOutput }),
        status: "predicted",
        language: "nl",
        references: ["addr-1"],
      },
    ];
    const { admin } = makeSupabaseStub(rows);
    const out = await loadHandlerOutputsForRun(admin, "run-1");
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(handlerOutput);
  });

  it("uses the legacy body-agent adapter path when tool_outputs.body present", async () => {
    const rows = [
      {
        intent: "copy_document_request",
        tool_outputs: {
          body: {
            body_html: "<p>Hello</p>",
            detected_tone: "neutral",
            body_version: "2026-04-23.v1",
          },
        },
        status: "predicted",
        language: "nl",
        references: ["INV-1"],
      },
    ];
    const { admin } = makeSupabaseStub(rows);
    const out = await loadHandlerOutputsForRun(admin, "run-2");
    expect(out.length).toBe(1);
    expect(out[0].handler_key).toBe("debtor-copy-document-body-agent");
    expect(out[0].content_kind).toBe("draft_body");
    expect(out[0].content).toBe("<p>Hello</p>");
    expect(out[0].references).toEqual(["INV-1"]);
  });

  it("filters via supabase .neq('status','failed') (no rows returned have status=failed)", async () => {
    const rows = [
      {
        intent: "copy_document_request",
        tool_outputs: {
          handler_output: {
            handler_key: "h",
            intent: "copy_document_request",
            content_kind: "draft_body",
            content: "<p>x</p>",
            language: "nl",
            tone: "neutral",
            references: [],
            confidence: "medium",
          },
        },
        status: "predicted",
        language: "nl",
        references: [],
      },
    ];
    const stub = makeSupabaseStub(rows);
    const out = await loadHandlerOutputsForRun(stub.admin, "run-3");
    expect(stub.from).toHaveBeenCalledWith("agent_runs");
    expect(stub.eq).toHaveBeenCalledWith("coordinator_run_id", "run-3");
    expect(stub.neq).toHaveBeenCalledWith("status", "failed");
    expect(out.length).toBe(1);
  });

  it("skips rows with no usable tool_outputs payload", async () => {
    const rows = [
      { intent: "general_inquiry", tool_outputs: null, status: "predicted", language: "nl", references: [] },
      { intent: "general_inquiry", tool_outputs: { unrelated: 1 }, status: "predicted", language: "nl", references: [] },
    ];
    const { admin } = makeSupabaseStub(rows);
    const out = await loadHandlerOutputsForRun(admin, "run-4");
    expect(out).toEqual([]);
  });
});
