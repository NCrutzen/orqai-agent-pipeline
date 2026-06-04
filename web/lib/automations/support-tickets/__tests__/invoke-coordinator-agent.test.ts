// Plan 03-03 Task 2 — invokeCoordinatorAgent unit tests.
//
// Per the 03-02 spec deviation: this is NOT a Studio-deployed agent. We call
// `POST /v3/router/responses` with inline `model + instructions + response_format`.
// The function uses raw `fetch` (not the @orq-ai/node SDK) because the SDK's
// router methods cover chatCompletions, not the /v3/router/responses endpoint.
//
// Mock strategy: vi.stubGlobal("fetch", ...) — mirrors the Phase 2 transcribe
// test pattern.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  invokeCoordinatorAgent,
  CoordinatorAgentError,
} from "../invoke-coordinator-agent";
import { CONTEXT_VERSION } from "../pipeline-stage-context";

const ORIG_KEY = process.env.ORQ_API_KEY;

const SUPPORT_TICKET = {
  transcript: "PDF export crashes in iController above 50 invoices.",
  submitter_locale: "en" as const,
  user_chosen_type: "bug" as const,
  proposed_system: "icontroller",
  proposed_system_status: "detected",
};

const CONTEXT = {
  context_version: CONTEXT_VERSION,
  prior_tickets_same_user: [],
  prior_tickets_same_system: [],
  similar_tickets: [],
  prior_clarifications: [],
};

const HAPPY_AGENT_JSON = JSON.stringify({
  chosen_intent: "clickup-escalate",
  completeness_verdict: "complete",
  confidence: "high",
  reasoning: "Clear bug report with reproducer.",
  missing_information: null,
});

function stubFetchOk(body: {
  content: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}) {
  const response = {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: body.content }],
      },
    ],
    usage: {
      input_tokens: body.prompt_tokens ?? 1000,
      output_tokens: body.completion_tokens ?? 50,
    },
    model: "anthropic/claude-sonnet-4-5-20250929",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    })),
  );
}

function stubFetchStatus(status: number, text = "server error") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({ error: text }),
      text: async () => text,
    })),
  );
}

beforeEach(() => {
  process.env.ORQ_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
  else process.env.ORQ_API_KEY = ORIG_KEY;
});

describe("invokeCoordinatorAgent", () => {
  it("happy-path: posts to /v3/router/responses, returns parsed output + cost>0", async () => {
    stubFetchOk({ content: HAPPY_AGENT_JSON });

    const result = await invokeCoordinatorAgent({
      supportTicket: SUPPORT_TICKET,
      pipelineStageContext: CONTEXT,
      apiKey: "test-key",
    });

    expect(result.output.chosen_intent).toBe("clickup-escalate");
    expect(result.output.completeness_verdict).toBe("complete");
    expect(result.cost_cents).toBeGreaterThan(0);
    expect(result.raw).toBe(HAPPY_AGENT_JSON);

    // Verify fetch was called against /v3/router/responses with inline config
    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.orq.ai/v3/router/responses");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.strict).toBe(true);
    // input contract: stringified JSON in input[0].content[0].text
    expect(typeof body.input?.[0]?.content?.[0]?.text).toBe("string");
    const inputJson = JSON.parse(body.input[0].content[0].text);
    expect(inputJson.transcript).toBe(SUPPORT_TICKET.transcript);
    expect(inputJson.proposed_system).toBe("icontroller");
  });

  it("throws CoordinatorAgentError('missing_orq_api_key') when apiKey absent", async () => {
    await expect(
      invokeCoordinatorAgent({
        supportTicket: SUPPORT_TICKET,
        pipelineStageContext: CONTEXT,
        apiKey: "",
      }),
    ).rejects.toMatchObject({
      name: "CoordinatorAgentError",
      code: "missing_orq_api_key",
    });
  });

  it("throws CoordinatorAgentError('orq_http_500') when Orq returns 500", async () => {
    stubFetchStatus(500, "boom");

    let caught: unknown;
    try {
      await invokeCoordinatorAgent({
        supportTicket: SUPPORT_TICKET,
        pipelineStageContext: CONTEXT,
        apiKey: "test-key",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CoordinatorAgentError);
    expect((caught as CoordinatorAgentError).code).toBe("orq_http_500");
    expect((caught as CoordinatorAgentError).http_status).toBe(500);
  });

  it("throws CoordinatorAgentError('schema_validation_failed') on malformed agent JSON", async () => {
    stubFetchOk({
      content: JSON.stringify({
        chosen_intent: "clickup-escalate",
        // missing required fields → Zod fails
      }),
    });
    let caught: unknown;
    try {
      await invokeCoordinatorAgent({
        supportTicket: SUPPORT_TICKET,
        pipelineStageContext: CONTEXT,
        apiKey: "test-key",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CoordinatorAgentError);
    expect((caught as CoordinatorAgentError).code).toBe(
      "schema_validation_failed",
    );
  });
});
