// Plan 02-05 Task 2 — embedAndSearchSimilar tests.
//
// Strategy (post mega-smoke refactor): mock `@orq-ai/node` SDK with a
// hoisted `vi.mock` + mutable handler (avoids the vi.doMock/dynamic-import
// race that surfaces under parallel test runs). Supabase mock exposes
// `.rpc(...)` directly because production calls
// `args.supabase.rpc("match_support_tickets", ...)` on the `public`
// schema wrapper (not `support.schema(...).rpc(...)`).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const orqEmbed = vi.hoisted(() => ({
  create: vi.fn(async (..._args: unknown[]) => ({
    data: [{ embedding: Array(1536).fill(0) }],
    usage: { prompt_tokens: 100 },
  })),
}));

vi.mock("@orq-ai/node", () => ({
  Orq: class {
    router = { embeddings: { create: orqEmbed.create } };
  },
}));

const ORIG_KEY = process.env.ORQ_API_KEY;
const ENV = { ORQ_API_KEY: "test-key" };

beforeEach(() => {
  process.env.ORQ_API_KEY = "test-key";
  orqEmbed.create.mockReset();
});

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.ORQ_API_KEY;
  else process.env.ORQ_API_KEY = ORIG_KEY;
});

function setOrqEmbedding(opts: { dim: number; tokens?: number }) {
  orqEmbed.create.mockImplementation(async () => ({
    data: [{ embedding: Array(opts.dim).fill(0) }],
    usage: { prompt_tokens: opts.tokens ?? 100 },
  }));
}

function buildSupabaseMock(opts: {
  rpcRows?: unknown[] | null;
  rpcError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: vi.fn(async (rpcName: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name: rpcName, args: params });
      return { data: opts.rpcRows ?? null, error: opts.rpcError ?? null };
    }),
  };
  return { supabase, rpcCalls };
}

function rowFixture(i: number, overrides: Record<string, unknown> = {}) {
  return {
    ticket_id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
    source_key: `src-${i}`,
    summary_text: `summary ${i}`,
    resolution_text: `resolution ${i}`,
    final_intent: "fix-it",
    final_system: "nxt",
    cosine_distance: 0.1 * i,
    ...overrides,
  };
}

describe("embedAndSearchSimilar — Plan 02-05 Task 2", () => {
  it("Test 1: happy — embed call + RPC returns 3 rows → similar.length=3, cost > 0", async () => {
    setOrqEmbedding({ dim: 1536 });
    const { supabase, rpcCalls } = buildSupabaseMock({
      rpcRows: [rowFixture(1), rowFixture(2), rowFixture(3)],
    });
    const { embedAndSearchSimilar } = await import("../embed-and-search");
    const result = await embedAndSearchSimilar({
      text: "printer broken",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      env: ENV,
      topK: 5,
    });
    expect(result.similar.length).toBe(3);
    expect(result.cost_cents).toBeGreaterThan(0);
    expect(rpcCalls[0].name).toBe("match_support_tickets");
    // pgvector literal string format "[x,y,z,...]"
    expect(typeof rpcCalls[0].args.query_embedding).toBe("string");
    expect((rpcCalls[0].args.query_embedding as string).startsWith("[")).toBe(true);
    expect(rpcCalls[0].args.top_k).toBe(5);
  });

  it("Test 2: empty table — rpc returns [] → similar=[], NO error, cost still billed", async () => {
    setOrqEmbedding({ dim: 1536 });
    const { supabase } = buildSupabaseMock({ rpcRows: [] });
    const { embedAndSearchSimilar } = await import("../embed-and-search");
    const result = await embedAndSearchSimilar({
      text: "anything",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      env: ENV,
    });
    expect(result.similar).toEqual([]);
    expect(result.cost_cents).toBeGreaterThan(0);
  });

  it("Test 3: topK clamp — topK=20 → clamped to MAX_TOP_K (=10); default topK=5", async () => {
    setOrqEmbedding({ dim: 1536 });
    const { supabase, rpcCalls } = buildSupabaseMock({ rpcRows: [] });
    const { embedAndSearchSimilar, MAX_TOP_K } = await import("../embed-and-search");
    expect(MAX_TOP_K).toBe(10);
    await embedAndSearchSimilar({
      text: "x",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      env: ENV,
      topK: 20,
    });
    expect(rpcCalls[0].args.top_k).toBe(10);

    // Default topK
    const second = buildSupabaseMock({ rpcRows: [] });
    await embedAndSearchSimilar({
      text: "x",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: second.supabase as any,
      env: ENV,
    });
    expect(second.rpcCalls[0].args.top_k).toBe(5);
  });

  it("Test 4: embedding dim mismatch — 512 dim → throws EmbedSearchError(embedding_dim_mismatch)", async () => {
    setOrqEmbedding({ dim: 512 });
    const { supabase } = buildSupabaseMock({ rpcRows: [] });
    const { embedAndSearchSimilar } = await import("../embed-and-search");
    await expect(
      embedAndSearchSimilar({
        text: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        env: ENV,
      }),
    ).rejects.toMatchObject({ code: "embedding_dim_mismatch" });
  });

  it("Test 5: RPC error → throws EmbedSearchError", async () => {
    setOrqEmbedding({ dim: 1536 });
    const { supabase } = buildSupabaseMock({
      rpcError: { message: "permission denied" },
    });
    const { embedAndSearchSimilar, EmbedSearchError } = await import("../embed-and-search");
    await expect(
      embedAndSearchSimilar({
        text: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        env: ENV,
      }),
    ).rejects.toBeInstanceOf(EmbedSearchError);
  });

  it("Test 6: malformed RPC row → throws on Zod parse", async () => {
    setOrqEmbedding({ dim: 1536 });
    const { supabase } = buildSupabaseMock({
      rpcRows: [{ ticket_id: "not-a-uuid", summary_text: "x" }],
    });
    const { embedAndSearchSimilar, EmbedSearchError } = await import("../embed-and-search");
    await expect(
      embedAndSearchSimilar({
        text: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        env: ENV,
      }),
    ).rejects.toBeInstanceOf(EmbedSearchError);
  });
});
