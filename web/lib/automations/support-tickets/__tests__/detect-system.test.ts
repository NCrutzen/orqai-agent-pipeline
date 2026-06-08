// Plan 02-05 Task 1 — detectSoftwareSystem tests.
//
// Orq.ai LLM (Sonnet 4.5) over transcript + frame URLs + registry list.
// Production code calls `orq.router.chatCompletions.create(body)` via the
// `@orq-ai/node` SDK (post mega-smoke refactor — was raw fetch to
// /v2/router/chat/completions). Tests use a hoisted `vi.mock` of
// `@orq-ai/node` with a mutable handler so each test can swap the behavior;
// this avoids the `vi.doMock`/dynamic-import race that surfaces when the
// support-tickets suite runs alongside other test files in parallel.
//
// Reference pattern: ./transcribe.test.ts mocks `@elevenlabs/elevenlabs-js`
// (which uses vi.doMock + resetModules — works there because that test file
// imports the production module via `await import(...)` inside each test).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mutable handler for the Orq SDK mock. Each test swaps
// `orqHandler.create` to control what the SDK returns / throws.
const orqHandler = vi.hoisted(() => ({
  create: vi.fn(async (..._args: unknown[]) => ({
    choices: [{ message: { content: "{}" } }],
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  })),
}));

vi.mock("@orq-ai/node", () => ({
  Orq: class {
    router = { chatCompletions: { create: orqHandler.create } };
  },
}));

const ORIG_KEY = process.env.ORQ_API_KEY;
const ENV = { ORQ_API_KEY: "test-key" };

const REGISTRY = [
  { system_key: "nxt", display_name: "NXT" },
  { system_key: "icontroller", display_name: "iController" },
];

beforeEach(() => {
  process.env.ORQ_API_KEY = "test-key";
  orqHandler.create.mockReset();
});

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
  else process.env.ORQ_API_KEY = ORIG_KEY;
});

type SignedUrlResult = { data: { signedUrl: string } | null; error: unknown };

function buildSupabaseMock(opts: { signedUrl?: string } = {}) {
  const signed: SignedUrlResult = {
    data: { signedUrl: opts.signedUrl ?? "https://signed.example/frame.jpg" },
    error: null,
  };
  const storage = {
    from: vi.fn((_b: string) => ({
      createSignedUrl: vi.fn(async (_key: string, _ttl: number) => signed),
    })),
  };
  return { storage };
}

function setOrqChat(result: {
  content: string;
  tokens?: { p?: number; c?: number };
  reject?: Error;
}) {
  orqHandler.create.mockImplementation(async (..._args: unknown[]) => {
    if (result.reject) throw result.reject;
    return {
      choices: [{ message: { content: result.content } }],
      usage: {
        prompt_tokens: result.tokens?.p ?? 1000,
        completion_tokens: result.tokens?.c ?? 50,
      },
    };
  });
}

describe("detectSoftwareSystem — Plan 02-05 Task 1", () => {
  it("Test 1: empty registry → returns null/unknown WITHOUT calling Orq", async () => {
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    const result = await detectSoftwareSystem({
      transcript: "Het werkt niet meer",
      frameUrls: [],
      registryRows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { storage } as any,
      env: ENV,
    });
    expect(result).toEqual({
      system_key: null,
      status: "unknown",
      cost_cents: 0,
      reasoning: "registry_empty",
    });
    expect(orqHandler.create).not.toHaveBeenCalled();
  });

  it("Test 2: clear NXT match → status='detected', cost_cents > 0, uses camelCase responseFormat.jsonSchema API", async () => {
    setOrqChat({
      content: JSON.stringify({
        system_key: "nxt",
        confidence: "high",
        reasoning: "user mentions NXT",
      }),
    });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    const result = await detectSoftwareSystem({
      transcript: "Ik kan in NXT geen factuur aanmaken",
      frameUrls: ["t/0.jpg"],
      registryRows: REGISTRY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { storage } as any,
      env: ENV,
    });
    expect(result.system_key).toBe("nxt");
    expect(result.status).toBe("detected");
    expect(result.cost_cents).toBeGreaterThan(0);
    expect(result.reasoning).toContain("NXT");

    expect(orqHandler.create).toHaveBeenCalledTimes(1);
    // Orq SDK uses camelCase field names — responseFormat (not response_format),
    // jsonSchema (not json_schema). Snake_case keys are silently dropped by the
    // SDK's outbound Zod schema, causing the model to receive no constraint.
    // This assertion verifies the fix is correct end-to-end.
    const reqBody = orqHandler.create.mock.calls[0][0] as {
      model: string;
      responseFormat: {
        type: string;
        jsonSchema: {
          strict: boolean;
          schema: { properties: Record<string, { anyOf?: unknown[] }> };
        };
      };
    };
    expect(reqBody.model).toMatch(/claude-sonnet-4-5/);
    expect(reqBody.responseFormat.type).toBe("json_schema");
    expect(reqBody.responseFormat.jsonSchema.strict).toBe(true);
    const schemaProps = reqBody.responseFormat.jsonSchema.schema.properties;
    expect(schemaProps.system_key.anyOf).toEqual([
      { type: "string" },
      { type: "null" },
    ]);
  });

  it("Test 3: LLM returns null → status='unknown'", async () => {
    setOrqChat({
      content: JSON.stringify({
        system_key: null,
        confidence: "low",
        reasoning: "unclear from transcript",
      }),
    });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    const result = await detectSoftwareSystem({
      transcript: "Iets is stuk",
      frameUrls: [],
      registryRows: REGISTRY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { storage } as any,
      env: ENV,
    });
    expect(result.system_key).toBeNull();
    expect(result.status).toBe("unknown");
    expect(result.cost_cents).toBeGreaterThan(0);
  });

  it("Test 4: LLM hallucinates key not in registry → forced to 'unknown' with marker reasoning", async () => {
    setOrqChat({
      content: JSON.stringify({
        system_key: "ghost-system",
        confidence: "high",
        reasoning: "fabricated",
      }),
    });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    const result = await detectSoftwareSystem({
      transcript: "X is broken",
      frameUrls: [],
      registryRows: REGISTRY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { storage } as any,
      env: ENV,
    });
    expect(result.system_key).toBeNull();
    expect(result.status).toBe("unknown");
    expect(result.reasoning).toBe("llm_hallucinated_system_key:ghost-system");
  });

  it("Test 5: SDK rejects → throws DetectSystemError", async () => {
    setOrqChat({ content: "", reject: new Error("network down") });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem, DetectSystemError } = await import("../detect-system");
    await expect(
      detectSoftwareSystem({
        transcript: "X",
        frameUrls: [],
        registryRows: REGISTRY,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: { storage } as any,
        env: ENV,
      }),
    ).rejects.toBeInstanceOf(DetectSystemError);
  });

  it("Test 6: malformed JSON → throws DetectSystemError('response_schema_invalid')", async () => {
    setOrqChat({ content: "not json at all {{" });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    await expect(
      detectSoftwareSystem({
        transcript: "X",
        frameUrls: [],
        registryRows: REGISTRY,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: { storage } as any,
        env: ENV,
      }),
    ).rejects.toMatchObject({ code: "response_schema_invalid" });
  });

  it("Test 7: LLM wraps JSON in markdown code fences → stripped and parsed correctly", async () => {
    // Defensive guard: models occasionally return ```json ... ``` despite
    // responseFormat enforcement. The stripMarkdownCodeFences function handles this.
    setOrqChat({
      content: "```json\n" + JSON.stringify({
        system_key: "nxt",
        confidence: "medium",
        reasoning: "fence-wrapped output",
      }) + "\n```",
    });
    const { storage } = buildSupabaseMock();
    const { detectSoftwareSystem } = await import("../detect-system");
    const result = await detectSoftwareSystem({
      transcript: "NXT is down",
      frameUrls: [],
      registryRows: REGISTRY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { storage } as any,
      env: ENV,
    });
    expect(result.system_key).toBe("nxt");
    expect(result.status).toBe("detected");
  });
});
