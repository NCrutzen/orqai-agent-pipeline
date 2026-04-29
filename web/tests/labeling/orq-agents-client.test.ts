// Phase 56-02 wave 3: orq-agents registry-driven client.
// Verifies invokeOrqAgent resolves slug + timeout from public.orq_agents,
// builds response_format from registry output_schema, unwraps Orq's
// optional { output: ... } envelope, and surfaces helpful errors when
// the registry row is missing/disabled.
//
// Supabase admin + fetch are mocked — no live DB or network.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const AGENT_ROWS = [
  {
    agent_key: "test-agent",
    orqai_id: "01TESTSLUG",
    description: "Test agent",
    swarm_type: "test",
    version: "1.0",
    input_schema: {},
    output_schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["yes", "no"] },
        reason: { type: "string" },
      },
      required: ["verdict", "reason"],
    },
    model_config: { primary: "anthropic/claude-sonnet-4-6" },
    timeout_ms: 30000,
    enabled: true,
  },
];

function buildMockAdmin() {
  return {
    from: (table: string) => {
      if (table !== "orq_agents") {
        throw new Error(`unexpected from(${table})`);
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: AGENT_ROWS, error: null }),
        }),
      };
    },
  };
}

describe("invokeOrqAgent (registry-driven)", () => {
  const ORIG_KEY = process.env.ORQ_API_KEY;

  beforeEach(() => {
    process.env.ORQ_API_KEY = "test-key";
    vi.resetModules();
  });
  afterEach(() => {
    process.env.ORQ_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves slug from registry and posts to /v2/agents/{slug}/invoke", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verdict: "yes", reason: "found it" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    const out = await invokeOrqAgent("test-agent", { foo: "bar" });
    expect(out.raw).toEqual({ verdict: "yes", reason: "found it" });
    expect(out.agent.orqai_id).toBe("01TESTSLUG");

    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe("https://api.orq.ai/v2/agents/01TESTSLUG/invoke");

    const init = fetchSpy.mock.calls[0][1];
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.inputs).toEqual({ foo: "bar" });
  });

  it("builds response_format with strict json_schema from registry output_schema", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verdict: "yes", reason: "n/a" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    await invokeOrqAgent("test-agent", { foo: "bar" }, {
      jsonSchemaName: "test_output",
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("test_output");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual([
      "verdict",
      "reason",
    ]);
  });

  it("unwraps Orq's optional { output: ... } envelope", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: { verdict: "yes", reason: "wrapped" },
          metadata: { tokens: 100 },
        }),
      }),
    );

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    const out = await invokeOrqAgent("test-agent", {});
    expect(out.raw).toEqual({ verdict: "yes", reason: "wrapped" });
  });

  it("throws when agent_key not in registry", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    await expect(
      invokeOrqAgent("does-not-exist", {}),
    ).rejects.toThrow(/does-not-exist/);
  });

  it("throws when ORQ_API_KEY is unset", async () => {
    delete process.env.ORQ_API_KEY;
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    await expect(invokeOrqAgent("test-agent", {})).rejects.toThrow(
      /ORQ_API_KEY/,
    );
  });

  it("throws on non-2xx with status + body snippet", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "service unavailable",
      }),
    );

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    await expect(invokeOrqAgent("test-agent", {})).rejects.toThrow(
      /HTTP 503/,
    );
  });
});
