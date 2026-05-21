/**
 * Phase 87 Plan 03 — RED test for `invokeIntentAgent` surfacing the Orq
 * `/responses` usage block on `InvokeIntentResult.usage`.
 *
 * Existing behavior (V2/V3 return shape, prompt assembly, fallback chain) is
 * unchanged — `usage` is a strictly additive optional field. Plan 04's retro
 * loop reads `result.usage?.total_tokens` to accumulate cost per run_id.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeIntentAgent } from "../invoke-intent";
import { INTENT_VERSION_V3 } from "../types";

const ORIG_FETCH = global.fetch;
const ORIG_KEY = process.env.ORQ_API_KEY;

const baseInput = {
  email_id: "00000000-0000-0000-0000-000000000001",
  inngest_run_id: "evt-87",
  subject: "Wat is de status?",
  body_text: "Vraag.",
  assembled_input:
    "<inbound_message>\n  <subject>Wat is de status?</subject>\n  <body>Vraag.</body>\n</inbound_message>\n<quoted_thread>\n</quoted_thread>",
  sender_email: "test@example.com",
  sender_domain: "example.com",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  received_at: "2026-05-21T10:00:00Z",
};

function v3Json() {
  return JSON.stringify({
    ranked: [
      {
        intent: "general_inquiry",
        confidence: "medium",
        document_reference: null,
        sub_type: null,
        reasoning: "open question without obvious intent",
      },
    ],
    language: "nl",
    urgency: "normal",
    intent_version: INTENT_VERSION_V3,
    intent_proposal: null,
    proposal_reason: null,
  });
}

function mockOrqResponse(opts: {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}) {
  const body: Record<string, unknown> = {
    output: [
      { role: "assistant", parts: [{ kind: "text", text: opts.text }] },
    ],
  };
  if (opts.usage !== undefined) body.usage = opts.usage;
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

describe("Phase 87 invokeIntentAgent — usage telemetry", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("surfaces usage block from Orq /responses (Plan 04 reads total_tokens)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockOrqResponse({
        text: v3Json(),
        usage: { input_tokens: 1500, output_tokens: 120, total_tokens: 1620 },
      }),
    ) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);

    expect(result.usage).toBeDefined();
    expect(result.usage?.input_tokens).toBe(1500);
    expect(result.usage?.output_tokens).toBe(120);
    expect(result.usage?.total_tokens).toBe(1620);
  });

  it("returns usage=undefined when Orq omits the usage block (edge case)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockOrqResponse({ text: v3Json() }),
    ) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);

    expect(result.output).toBeDefined();
    expect(result.raw).toBeTypeOf("string");
    expect(result.usage).toBeUndefined();
  });

  it("non-regression: existing { output, raw } shape still resolves and parses", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockOrqResponse({
        text: v3Json(),
        usage: { input_tokens: 800, output_tokens: 60, total_tokens: 860 },
      }),
    ) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);

    expect(result.output).toBeDefined();
    if (result.output.intent_version === INTENT_VERSION_V3) {
      expect(result.output.ranked[0].intent).toBe("general_inquiry");
    }
    expect(typeof result.raw).toBe("string");
  });
});
