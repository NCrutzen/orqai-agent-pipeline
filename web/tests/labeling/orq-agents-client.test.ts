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
    // Phase 88.2-04: Orq response envelope is now { output: [{ parts: [{ text }]}] }
    // where text is JSON-stringified. See lib/automations/orq-agents/client.ts:210.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            parts: [
              { text: JSON.stringify({ verdict: "yes", reason: "found it" }) },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { invokeOrqAgent } = await import(
      "@/lib/automations/orq-agents/client"
    );
    const out = await invokeOrqAgent("test-agent", { foo: "bar" });
    expect(out.raw).toEqual({ verdict: "yes", reason: "found it" });
    expect(out.agent.orqai_id).toBe("01TESTSLUG");

    // Phase 88.2-04: agents-path migrated to /v2/agents/{agent_key}/responses
    // (keyed by agent_key, NOT the orqai_id slug). Body shape is now
    // { message: { role, parts: [{kind, text}] }, configuration: { blocking } }.
    // Per-call `inputs` was removed — the JSON inputs are stringified into the
    // user message text. See lib/automations/orq-agents/client.ts:167-180.
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe("https://api.orq.ai/v2/agents/test-agent/responses");

    const init = fetchSpy.mock.calls[0][1];
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.message.role).toBe("user");
    expect(body.message.parts[0].text).toContain("foo");
    expect(body.configuration.blocking).toBe(true);
  });

  // Phase 88.2-04: per-call response_format was removed when client migrated
  // to the /v2/agents/{agent_key}/responses path — schema enforcement now
  // lives server-side on the Orq agent. Test intent no longer maps to
  // production. See .planning/todos/pending/2026-05-21-test-fixture-orq-response-format-server-side.md
  it.skip("builds response_format with strict json_schema from registry output_schema (see .planning/todos/pending/2026-05-21-test-fixture-orq-response-format-server-side.md)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            parts: [
              { text: JSON.stringify({ verdict: "yes", reason: "n/a" }) },
            ],
          },
        ],
      }),
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

  it("unwraps Orq's output[].parts[].text JSON envelope and parses to .raw", async () => {
    // Phase 88.2-04: replaces the legacy "{ output: {...} } envelope" shape.
    // Orq /responses now returns output as an array of role/parts, where
    // parts[0].text holds the JSON-stringified agent payload (optionally
    // fenced as ```json ... ```; the client strips fences before JSON.parse).
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => buildMockAdmin(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            {
              role: "assistant",
              parts: [
                {
                  kind: "text",
                  text:
                    "```json\n" +
                    JSON.stringify({ verdict: "yes", reason: "wrapped" }) +
                    "\n```",
                },
              ],
            },
          ],
          usage: { input_tokens: 50, output_tokens: 50, total_tokens: 100 },
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
