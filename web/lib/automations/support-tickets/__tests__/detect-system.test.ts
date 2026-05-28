// Plan 02-05 Task 1 — detectSoftwareSystem tests.
//
// Orq.ai LLM (Sonnet 4.5) over transcript + frame URLs + registry list.
// json_schema strict mode with anyOf-for-nullable on `system_key`.
// Hallucination guard: a `system_key` not in the registry forces `'unknown'`.
//
// Strategy: stub global fetch + supabase.storage.from(...).createSignedUrl.
// No real network I/O.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectSoftwareSystem,
  DetectSystemError,
} from "../detect-system";

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

const ENV = { ORQ_API_KEY: "test-key" };

const REGISTRY = [
  { system_key: "nxt", display_name: "NXT" },
  { system_key: "icontroller", display_name: "iController" },
];

function orqOkResponse(body: {
  system_key: string | null;
  confidence?: "high" | "medium" | "low";
  reasoning?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                system_key: body.system_key,
                confidence: body.confidence ?? "high",
                reasoning: body.reasoning ?? "matched on transcript keywords",
              }),
            },
          },
        ],
        usage: body.usage ?? { prompt_tokens: 1000, completion_tokens: 50 },
      };
    },
    async text() {
      return "";
    },
  } as unknown as Response;
}

describe("detectSoftwareSystem — Plan 02-05 Task 1", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test 1: empty registry → returns null/unknown WITHOUT calling fetch", async () => {
    const { storage } = buildSupabaseMock();
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
    expect((global.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("Test 2: clear NXT match → status='detected', cost_cents > 0", async () => {
    const { storage } = buildSupabaseMock();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      orqOkResponse({ system_key: "nxt", confidence: "high", reasoning: "user mentions NXT" }),
    );
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

    // Verify json_schema strict body shape
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const reqBody = JSON.parse(call[1].body);
    expect(reqBody.model).toMatch(/claude-sonnet-4-5/);
    expect(reqBody.response_format.type).toBe("json_schema");
    expect(reqBody.response_format.json_schema.strict).toBe(true);
    const schemaProps = reqBody.response_format.json_schema.schema.properties;
    expect(schemaProps.system_key.anyOf).toEqual([
      { type: "string" },
      { type: "null" },
    ]);
  });

  it("Test 3: LLM returns null → status='unknown'", async () => {
    const { storage } = buildSupabaseMock();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      orqOkResponse({ system_key: null, confidence: "low", reasoning: "unclear from transcript" }),
    );
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
    const { storage } = buildSupabaseMock();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      orqOkResponse({ system_key: "ghost-system", confidence: "high", reasoning: "fabricated" }),
    );
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

  it("Test 5: fetch rejects → throws DetectSystemError", async () => {
    const { storage } = buildSupabaseMock();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
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
    const { storage } = buildSupabaseMock();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {
          choices: [{ message: { content: "not json at all {{" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        };
      },
      async text() {
        return "";
      },
    } as unknown as Response);
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
});
