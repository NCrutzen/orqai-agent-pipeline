/**
 * Fail-soft parse: the Stage-3 intent agent intermittently returns a ranked
 * entry whose ONLY violation is a secondary field — an out-of-enum `sub_type`
 * or an over-long `document_reference`. Before the fail-soft, `safeParse`
 * threw, the throw was deterministic across retries:3, and the row stranded at
 * status='classifying' with no label. Now the secondary field is coerced and
 * the verdict (and its top-1 intent) survives. A verdict broken on a PRIMARY
 * field still throws — no silent mislabel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeIntentAgent } from "../invoke-intent";
import { INTENT_VERSION_V3 } from "../types";

const ORIG_FETCH = global.fetch;
const ORIG_KEY = process.env.ORQ_API_KEY;

function mockOrqResponse(jsonText: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue({
      output: [{ role: "assistant", parts: [{ kind: "text", text: jsonText }] }],
    }),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

const baseInput = {
  email_id: "00000000-0000-0000-0000-000000000001",
  inngest_run_id: "evt-1",
  subject: "Kopie factuur",
  body_text: "Mag ik een kopie?",
  assembled_input:
    "<inbound_message>\n  <subject>Kopie factuur</subject>\n  <body>Mag ik een kopie?</body>\n</inbound_message>\n<quoted_thread>\n</quoted_thread>",
  sender_email: "test@example.com",
  sender_domain: "example.com",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  received_at: "2026-05-20T10:00:00Z",
};

function v3WithRanked(ranked: unknown) {
  return JSON.stringify({
    ranked,
    language: "nl",
    urgency: "normal",
    intent_version: INTENT_VERSION_V3,
    intent_proposal: null,
    proposal_reason: null,
  });
}

describe("invokeIntentAgent fail-soft secondary-field coercion", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("coerces an out-of-enum sub_type to null and preserves the top-1 intent", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOrqResponse(
        v3WithRanked([
          {
            intent: "copy_document_request",
            confidence: "high",
            document_reference: null,
            sub_type: "packing_slip", // not in SUB_TYPE enum
            reasoning: "klant vraagt kopie",
          },
        ]),
      ),
    ) as unknown as typeof fetch;

    const { output } = await invokeIntentAgent(baseInput);
    expect(output.ranked[0].intent).toBe("copy_document_request");
    expect(output.ranked[0].sub_type).toBeNull();
  });

  it("truncates an over-long document_reference instead of throwing", async () => {
    const long = "X".repeat(120);
    global.fetch = vi.fn().mockResolvedValue(
      mockOrqResponse(
        v3WithRanked([
          {
            intent: "copy_document_request",
            confidence: "high",
            document_reference: long,
            sub_type: "invoice",
            reasoning: "kopie factuur",
          },
        ]),
      ),
    ) as unknown as typeof fetch;

    const { output } = await invokeIntentAgent(baseInput);
    expect(output.ranked[0].document_reference).toHaveLength(64);
  });

  it("still throws when a PRIMARY field (ranked[].intent) is out of enum", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOrqResponse(
        v3WithRanked([
          {
            intent: "totally_made_up_intent", // primary, not nullable
            confidence: "high",
            document_reference: null,
            sub_type: "invoice",
            reasoning: "x",
          },
        ]),
      ),
    ) as unknown as typeof fetch;

    await expect(invokeIntentAgent(baseInput)).rejects.toThrow(/schema mismatch/);
  });
});
