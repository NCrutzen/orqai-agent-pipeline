import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeSalesIntentAgent } from "../invoke-intent";
import { SALES_INTENT_VERSION } from "../types";

const baseInput = {
  email_id: "e1",
  inngest_run_id: "r1",
  subject: "Offerte aanvraag",
  body_text: "Graag een prijs",
  assembled_input: "<inbound_message>Graag een prijs</inbound_message>",
  sender_email: "buyer@acme.example",
  sender_domain: "acme.example",
  mailbox: "verkoop@smeba.nl",
  received_at: "2026-06-05T10:00:00Z",
  resolution_status: "resolved_entity",
};

function validOutput() {
  return {
    ranked: [{ intent: "other", confidence: "high", reasoning: "x" }],
    language: "nl",
    urgency: "normal",
    intent_version: SALES_INTENT_VERSION,
    intent_proposal: null,
    proposal_reason: null,
    entity_relationship: null,
  };
}

function orqResponse(text: string, usage?: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      output: [{ role: "assistant", parts: [{ kind: "text", text }] }],
      usage,
    }),
    text: async () => "",
  } as unknown as Response;
}

describe("invokeSalesIntentAgent (Task 3)", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { output, raw, usage } on a valid JSON response", async () => {
    const text = JSON.stringify(validOutput());
    vi.spyOn(global, "fetch").mockResolvedValue(
      orqResponse(text, {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      }),
    );
    const res = await invokeSalesIntentAgent(baseInput);
    expect(res.output.intent_version).toBe(SALES_INTENT_VERSION);
    expect(res.usage?.total_tokens).toBe(15);
    expect(salesParseable(res.raw)).toBe(true);
  });

  it("strips ```json fences before parse", async () => {
    const text = "```json\n" + JSON.stringify(validOutput()) + "\n```";
    vi.spyOn(global, "fetch").mockResolvedValue(orqResponse(text));
    const res = await invokeSalesIntentAgent(baseInput);
    expect(res.output.ranked[0].intent).toBe("other");
  });

  it("throws an Error mentioning the status on a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "upstream down",
    } as unknown as Response);
    await expect(invokeSalesIntentAgent(baseInput)).rejects.toThrow(/503/);
  });

  it("throws an Error carrying .raw on Zod failure", async () => {
    const bad = JSON.stringify({ ...validOutput(), language: "xx" });
    vi.spyOn(global, "fetch").mockResolvedValue(orqResponse(bad));
    let caught: unknown;
    try {
      await invokeSalesIntentAgent(baseInput);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { raw?: string }).raw).toBe(bad);
  });

  it("throws 'ORQ_API_KEY not set' when unset", async () => {
    delete process.env.ORQ_API_KEY;
    await expect(invokeSalesIntentAgent(baseInput)).rejects.toThrow(
      "ORQ_API_KEY not set",
    );
  });

  it("POSTs to the sales-intent-agent responses endpoint", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(orqResponse(JSON.stringify(validOutput())));
    await invokeSalesIntentAgent(baseInput);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("sales-intent-agent/responses");
  });
});

function salesParseable(raw: string): boolean {
  try {
    JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    return true;
  } catch {
    return false;
  }
}
