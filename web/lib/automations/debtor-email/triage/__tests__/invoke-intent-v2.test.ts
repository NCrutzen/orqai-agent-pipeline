/**
 * Phase 65 Plan 03 — CORD-01 invokeIntentAgent V2 transport.
 * Mocks global.fetch to assert v2 zod parsing + v1 rejection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeIntentAgent } from "../invoke-intent";
import { INTENT_VERSION_V2 } from "../types";

const ORIG_FETCH = global.fetch;
const ORIG_KEY = process.env.ORQ_API_KEY;

function mockOrqResponse(jsonText: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue({
      output: [
        {
          role: "assistant",
          parts: [{ kind: "text", text: jsonText }],
        },
      ],
    }),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

const baseInput = {
  email_id: "00000000-0000-0000-0000-000000000001",
  inngest_run_id: "evt-1",
  subject: "Kopie factuur",
  body_text: "Mag ik een kopie?",
  sender_email: "test@example.com",
  sender_domain: "example.com",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  received_at: "2026-05-03T10:00:00Z",
};

describe("CORD-01 invokeIntentAgent V2", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("invokeIntentAgent returns IntentAgentOutputV2 parsed from /responses body", async () => {
    const v2Json = JSON.stringify({
      ranked: [
        {
          intent: "copy_document_request",
          confidence: "high",
          document_reference: "INV-12345",
          sub_type: "invoice",
          reasoning: "operator asks for copy",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V2,
    });
    global.fetch = vi.fn().mockResolvedValue(mockOrqResponse(v2Json)) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);
    expect(result.output.ranked.length).toBeGreaterThanOrEqual(1);
    expect(result.output.ranked[0].intent).toBe("copy_document_request");
    expect(result.output.intent_version).toBe(INTENT_VERSION_V2);
  });

  it("rejects v1 single-label shape with informative 'v2 output schema mismatch' error", async () => {
    const v1Json = JSON.stringify({
      intent: "copy_document_request",
      sub_type: null,
      document_reference: null,
      urgency: "normal",
      language: "nl",
      confidence: "high",
      reasoning: "v1 single-label",
      intent_version: "2026-04-23.v1",
    });
    global.fetch = vi.fn().mockResolvedValue(mockOrqResponse(v1Json)) as unknown as typeof fetch;

    await expect(invokeIntentAgent(baseInput)).rejects.toThrow(
      /v2 output schema mismatch/,
    );
  });
});
