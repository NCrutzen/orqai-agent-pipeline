/**
 * Phase 85 Wave 0 — RED tests for `invokeIntentAgent` returning
 * IntentAgentOutputV2 | IntentAgentOutputV3 via the discriminated-union
 * Zod gate that Plan 02 will install.
 *
 * Mirrors the mocked-fetch posture of invoke-intent-v2.test.ts. These tests
 * are RED by design — they reference V3 schema symbols (`INTENT_VERSION_V3`,
 * `IntentAgentOutputV3`) and union-typed return paths that do not yet exist
 * in `../invoke-intent` / `../types`. `// @ts-expect-error` annotations let
 * the file compile so vitest reports assertion failures (the GREEN path)
 * rather than TS parse errors (a spurious RED).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeIntentAgent } from "../invoke-intent";
import { INTENT_VERSION_V2 } from "../types";
// @ts-expect-error — V3 lands in Wave 1 (Plan 02).
import { INTENT_VERSION_V3 } from "../types";

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
  assembled_input:
    "<inbound_message>\n  <subject>Kopie factuur</subject>\n  <body>Mag ik een kopie?</body>\n</inbound_message>\n<quoted_thread>\n</quoted_thread>",
  sender_email: "test@example.com",
  sender_domain: "example.com",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  received_at: "2026-05-20T10:00:00Z",
};

describe("Phase 85 invokeIntentAgent — discriminated V2|V3 return", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("accepts a V2 payload and returns output.intent_version === V2 literal", async () => {
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
    expect(result.output.intent_version).toBe(INTENT_VERSION_V2);
    expect(result.output.ranked[0].intent).toBe("copy_document_request");
    // V2 path — no intent_proposal field on output
    // @ts-expect-error — V2 branch must not type `intent_proposal`; after Wave 1 the union narrows correctly.
    expect(result.output.intent_proposal).toBeUndefined();
  });

  it("accepts a V3 closed-list payload and returns the V3 literal + null proposal", async () => {
    const v3JsonClosed = JSON.stringify({
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
      intent_version: INTENT_VERSION_V3,
      intent_proposal: null,
      proposal_reason: null,
    });
    global.fetch = vi.fn().mockResolvedValue(mockOrqResponse(v3JsonClosed)) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);
    expect(result.output.intent_version).toBe(INTENT_VERSION_V3);
    // After Plan 02 narrows the union, intent_proposal is `string | null`.
    // @ts-expect-error — V3 keys land in Wave 1.
    expect(result.output.intent_proposal).toBeNull();
    // @ts-expect-error — V3 keys land in Wave 1.
    expect(result.output.proposal_reason).toBeNull();
  });

  it("accepts a V3 open-set payload and roundtrips intent_proposal='wka_data_request'", async () => {
    const v3JsonOpen = JSON.stringify({
      ranked: [
        {
          intent: "general_inquiry",
          confidence: "low",
          document_reference: null,
          sub_type: null,
          reasoning: "WKA data request — closest closed-list intent is general_inquiry but fit is weak",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V3,
      intent_proposal: "wka_data_request",
      proposal_reason: "Sender explicitly requests Wet Ketenaansprakelijkheid documentation; no closed-list intent captures chain-liability data requests",
    });
    global.fetch = vi.fn().mockResolvedValue(mockOrqResponse(v3JsonOpen)) as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);
    expect(result.output.intent_version).toBe(INTENT_VERSION_V3);
    // @ts-expect-error — V3 keys land in Wave 1.
    expect(result.output.intent_proposal).toBe("wka_data_request");
    // @ts-expect-error — V3 keys land in Wave 1.
    expect(result.output.proposal_reason).toMatch(/Wet Ketenaansprakelijkheid|WKA/);
  });

  it("rejects a payload where intent_version doesn't match the body shape (V3 literal, V2 body)", async () => {
    // V3 literal but no intent_proposal/proposal_reason keys — V3 schema branch
    // must reject for missing required keys.
    const mismatched = JSON.stringify({
      ranked: [
        {
          intent: "copy_document_request",
          confidence: "high",
          document_reference: null,
          sub_type: null,
          reasoning: "r",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V3,
      // intent_proposal + proposal_reason intentionally missing
    });
    global.fetch = vi.fn().mockResolvedValue(mockOrqResponse(mismatched)) as unknown as typeof fetch;

    await expect(invokeIntentAgent(baseInput)).rejects.toThrow(/schema mismatch|intent_proposal|proposal_reason/i);
  });

  it("rejects a v1 single-label shape (defence-in-depth, unchanged from V2 behaviour)", async () => {
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

    await expect(invokeIntentAgent(baseInput)).rejects.toThrow(/schema mismatch|intent_version/i);
  });
});
