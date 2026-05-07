// Phase 999.4 RED scaffold — failing imports gate Wave 1+ implementation. Do not fix by stubbing — implement the contract.
//
// Covers test-map IDs T-B1, T-C1, T-C2, T-C3 from RESEARCH.md.
// Wave 1 will add `OrqClientTimeoutError` and Wave 2 will add `invokeOrqModel` (Router-direct
// transport) to web/lib/automations/orq-agents/client.ts. Until those land, these tests
// MUST fail at the import boundary — that failure IS the contract.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

vi.mock("@/lib/supabase/admin", () => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    createAdminClient: vi.fn(() => ({ from })),
    __mocks__: { from, select, eq, single },
  };
});

import * as adminMod from "@/lib/supabase/admin";
const adminMocks = (adminMod as unknown as { __mocks__: any }).__mocks__;

// Wave 1+ contract — these imports will fail RED until implemented.
import {
  OrqClientTimeoutError,
  invokeOrqModel,
  __resetCacheForTests,
} from "../client";

const FIXTURE_AGENT_ROW = {
  agent_key: "stage-0-safety-classifier",
  orqai_id: "agent_xyz",
  output_schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "reason", "matched_span"],
    properties: {
      verdict: { type: "string", enum: ["safe", "injection_suspected"] },
      reason: { type: "string", maxLength: 280 },
      matched_span: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
  model_config: {
    primary: "aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    fallbacks: ["aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0"],
    temperature: 0,
    max_tokens: 600,
  },
  enabled: true,
  system_prompt: "You output strict JSON conforming to the schema.",
};

function mockAgentRow(row: Partial<typeof FIXTURE_AGENT_ROW> = {}) {
  adminMocks.single.mockResolvedValue({
    data: { ...FIXTURE_AGENT_ROW, ...row },
    error: null,
  });
}

function mockFetchOnceJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  }));
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as never;
  return fetchMock;
}

beforeEach(() => {
  vi.useRealTimers();
  __resetCacheForTests?.();
  adminMocks.single.mockReset?.();
  adminMocks.from.mockClear?.();
  adminMocks.select.mockClear?.();
  adminMocks.eq.mockClear?.();
  process.env.ORQ_API_KEY = "test-orq-key";
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// T-C-error: OrqClientTimeoutError class
// ---------------------------------------------------------------------------

describe("OrqClientTimeoutError", () => {
  it("is a typed error class with name='OrqClientTimeoutError'", () => {
    const err = new OrqClientTimeoutError("deadline exceeded");
    expect(err.name).toBe("OrqClientTimeoutError");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("deadline exceeded");
  });
});

// ---------------------------------------------------------------------------
// T-B1: invokeOrqModel honors a 45s client deadline and aborts with OrqClientTimeoutError
// ---------------------------------------------------------------------------

describe("invokeOrqModel — deadline (T-B1)", () => {
  it("aborts after 45s and throws OrqClientTimeoutError", async () => {
    mockAgentRow();
    vi.useFakeTimers();
    let abortSeen = false;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            abortSeen = true;
            const err = new Error("aborted");
            (err as Error & { name: string }).name = "AbortError";
            reject(err);
          });
        }),
    );
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as never;

    const promise = invokeOrqModel("stage-0-safety-classifier", {
      email_subject: "Hi",
      email_body: "Hello",
    });
    // attach catch synchronously to prevent unhandled rejection on advance
    const rejection = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(45_001);
    const err = await rejection;
    expect(abortSeen).toBe(true);
    expect((err as Error).name).toBe("OrqClientTimeoutError");
  });
});

// ---------------------------------------------------------------------------
// T-C1: invokeOrqModel posts the merged Router request body
// ---------------------------------------------------------------------------

describe("invokeOrqModel — router endpoint shape (T-C1)", () => {
  it("POSTs to /v2/router/chat/completions with merged model + fallback_models + response_format from registry", async () => {
    mockAgentRow();
    const fetchMock = mockFetchOnceJson({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"verdict":"safe","reason":"ok","matched_span":null}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: "claude-haiku-4-5-20251001",
    });

    await invokeOrqModel("stage-0-safety-classifier", {
      email_subject: "Hi",
      email_body: "Hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v2\/router\/chat\/completions$/);
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>).Authorization ??
        (init.headers as Record<string, string>).authorization,
    ).toMatch(/^Bearer /);

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0");
    expect(body.fallback_models).toEqual([
      "aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
    ]);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(600);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema).toEqual(
      FIXTURE_AGENT_ROW.output_schema,
    );
  });
});

// ---------------------------------------------------------------------------
// T-C2: response parser maps OpenAI-shape choices[0].message.content -> InvokeResult.raw
// ---------------------------------------------------------------------------

describe("invokeOrqModel — response parser (T-C2)", () => {
  it("parses OpenAI-style choices[0].message.content into InvokeResult.raw", async () => {
    mockAgentRow();
    mockFetchOnceJson({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"verdict":"safe","reason":"ok","matched_span":null}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: "claude-haiku-4-5-20251001",
    });

    const result = await invokeOrqModel("stage-0-safety-classifier", {
      email_subject: "Hi",
      email_body: "Hello",
    });

    expect((result.raw as { verdict: string }).verdict).toBe("safe");
    expect((result.raw as { matched_span: unknown }).matched_span).toBeNull();
    expect(result.usage.prompt_tokens).toBe(10);
    expect(result.usage.completion_tokens).toBe(5);
    expect(result.usage.total_tokens).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// T-C3: system prompt cache — prompt fetched once per 60s window
// ---------------------------------------------------------------------------

describe("invokeOrqModel — system prompt cache (T-C3)", () => {
  it("fetches system prompt once within 60s window across multiple invocations", async () => {
    // Each invokeOrqModel call should hit loadAgent only ONCE within the
    // REGISTRY_CACHE_TTL_MS window (60s) — proving system prompt + registry
    // row come from the same cached load.
    mockAgentRow();
    mockFetchOnceJson({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"verdict":"safe","reason":"ok","matched_span":null}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    await invokeOrqModel("stage-0-safety-classifier", {
      email_subject: "a",
      email_body: "b",
    });
    // Re-mock fetch so the second call doesn't reuse a one-shot mock.
    mockFetchOnceJson({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"verdict":"safe","reason":"ok","matched_span":null}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    await invokeOrqModel("stage-0-safety-classifier", {
      email_subject: "c",
      email_body: "d",
    });

    // The supabase .from('orq_agents') chain is the registry+prompt source.
    // It must have resolved exactly once due to REGISTRY_CACHE_TTL_MS=60s.
    expect(adminMocks.single).toHaveBeenCalledTimes(1);
  });
});
