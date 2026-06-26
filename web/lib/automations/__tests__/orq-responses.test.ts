import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractResponsesText, invokeOrqResponses } from "../orq-responses";

const ORIG_FETCH = global.fetch;
const ORIG_KEY = process.env.ORQ_API_KEY;

describe("extractResponsesText", () => {
  it("pulls the first output_text part from a Responses payload", () => {
    const payload = {
      status: "completed",
      output: [
        {
          content: [
            { type: "output_text", text: '{"ranked":[{"intent":"quote_request"}]}' },
          ],
        },
      ],
    };
    expect(extractResponsesText(payload)).toBe(
      '{"ranked":[{"intent":"quote_request"}]}',
    );
  });

  it("returns empty string when no text part is present", () => {
    expect(extractResponsesText({ output: [{ content: [] }] })).toBe("");
    expect(extractResponsesText({})).toBe("");
  });
});

describe("invokeOrqResponses", () => {
  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
    else process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("POSTs /v3/router/responses with model+input and returns text+usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "HI" }] }],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await invokeOrqResponses({
      model: "agent/sales-intent-agent",
      input: "classify this",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.orq.ai/v3/router/responses",
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("agent/sales-intent-agent");
    expect(body.input).toBe("classify this");
    expect(result.text).toBe("HI");
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
    });
  });

  it("throws on empty output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ output: [] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response) as unknown as typeof fetch;

    await expect(
      invokeOrqResponses({ model: "agent/x", input: "y" }),
    ).rejects.toThrow(/empty output/);
  });
});
