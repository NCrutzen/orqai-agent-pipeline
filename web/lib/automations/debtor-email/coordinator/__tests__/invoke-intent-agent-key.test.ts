/**
 * Phase 113 Plan 02 (Q1 seam) — invokeIntentAgent parameterization.
 *
 * The debtor invoke is now additive-parameterized with `agent_key` + `schema`
 * options. With NO options it POSTs the debtor agent URL and gates with the
 * debtor V2/V3 union (byte-neutral). With options it POSTs the passed key and
 * gates with the passed schema. Mocked-fetch posture mirrors
 * invoke-intent-v3.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
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

const debtorV3Payload = JSON.stringify({
  ranked: [
    {
      intent: "copy_document_request",
      confidence: "high",
      document_reference: "INV-1",
      sub_type: "invoice",
      reasoning: "asks for copy",
    },
  ],
  language: "nl",
  urgency: "normal",
  intent_version: INTENT_VERSION_V3,
  intent_proposal: null,
  proposal_reason: null,
});

describe("Phase 113 invokeIntentAgent — parameterized agent_key + schema", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("no options → POSTs /v2/agents/debtor-intent-agent/responses + debtor schema gate (byte-neutral)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockOrqResponse(debtorV3Payload));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.orq.ai/v2/agents/debtor-intent-agent/responses",
    );
    expect(result.output.intent_version).toBe(INTENT_VERSION_V3);
  });

  it("{ agent_key, schema } → POSTs the passed key + gates with the passed schema", async () => {
    const customSchema = z.object({
      ranked: z
        .array(z.object({ intent: z.literal("sales_quote_request") }))
        .min(1),
      marker: z.literal("custom-gate"),
    });
    const customPayload = JSON.stringify({
      ranked: [{ intent: "sales_quote_request" }],
      marker: "custom-gate",
    });
    const fetchMock = vi.fn().mockResolvedValue(mockOrqResponse(customPayload));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await invokeIntentAgent(baseInput, {
      agent_key: "sales-intent-agent",
      schema: customSchema,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.orq.ai/v2/agents/sales-intent-agent/responses",
    );
    expect((result.output as unknown as { marker: string }).marker).toBe(
      "custom-gate",
    );
  });

  it("the passed schema REJECTS a debtor payload (gate really swapped, not the default)", async () => {
    const customSchema = z.object({ marker: z.literal("custom-gate") });
    const fetchMock = vi.fn().mockResolvedValue(mockOrqResponse(debtorV3Payload));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      invokeIntentAgent(baseInput, {
        agent_key: "sales-intent-agent",
        schema: customSchema,
      }),
    ).rejects.toThrow(/schema mismatch/i);
  });
});
