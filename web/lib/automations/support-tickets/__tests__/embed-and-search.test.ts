// Plan 02-05 Task 2 — embedAndSearchSimilar tests.
//
// Strategy: stub global fetch (Orq /v2/embeddings) + supabase.schema('support').rpc('match_tickets', ...).
// 1536-dim assertion forces a dim_mismatch error if the model is swapped to a
// non-3-small variant.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  embedAndSearchSimilar,
  EmbedSearchError,
  MAX_TOP_K,
} from "../embed-and-search";

const ENV = { ORQ_API_KEY: "test-key" };

function buildSupabaseMock(opts: {
  rpcRows?: unknown[] | null;
  rpcError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const schemaCalls: string[] = [];
  const supabase = {
    schema(name: string) {
      schemaCalls.push(name);
      return {
        rpc: vi.fn(async (rpcName: string, params: Record<string, unknown>) => {
          rpcCalls.push({ name: rpcName, args: params });
          return { data: opts.rpcRows ?? null, error: opts.rpcError ?? null };
        }),
      };
    },
  };
  return { supabase, rpcCalls, schemaCalls };
}

function embeddingFetchResponse(dim: number, usage = { prompt_tokens: 50 }) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        data: [{ embedding: Array(dim).fill(0) }],
        usage,
      };
    },
    async text() {
      return "";
    },
  } as unknown as Response;
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
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test 1: happy — embed call + RPC returns 3 rows → similar.length=3, cost > 0", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
    const { supabase, rpcCalls } = buildSupabaseMock({
      rpcRows: [rowFixture(1), rowFixture(2), rowFixture(3)],
    });
    const result = await embedAndSearchSimilar({
      text: "printer broken",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      env: ENV,
      topK: 5,
    });
    expect(result.similar.length).toBe(3);
    expect(result.cost_cents).toBeGreaterThan(0);
    expect(rpcCalls[0].name).toBe("match_tickets");
    expect((rpcCalls[0].args.query_embedding as number[]).length).toBe(1536);
    expect(rpcCalls[0].args.top_k).toBe(5);
  });

  it("Test 2: empty table — rpc returns [] → similar=[], NO error, cost still billed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
    const { supabase } = buildSupabaseMock({ rpcRows: [] });
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
    expect(MAX_TOP_K).toBe(10);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
    const { supabase, rpcCalls } = buildSupabaseMock({ rpcRows: [] });
    await embedAndSearchSimilar({
      text: "x",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      env: ENV,
      topK: 20,
    });
    expect(rpcCalls[0].args.top_k).toBe(10);

    // Default
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
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
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(512));
    const { supabase } = buildSupabaseMock({ rpcRows: [] });
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
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
    const { supabase } = buildSupabaseMock({
      rpcError: { message: "permission denied" },
    });
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
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(embeddingFetchResponse(1536));
    const { supabase } = buildSupabaseMock({
      rpcRows: [{ ticket_id: "not-a-uuid", summary_text: "x" }],
    });
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
