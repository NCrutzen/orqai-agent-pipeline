// Plan 01-02 Task 1 — rate-limit.ts behavior tests.
// Pure-ish: takes a Supabase client (stubbed here) and returns allow/deny.

import { describe, it, expect, vi } from "vitest";
import { checkRateLimit } from "../rate-limit";

function makeStubClient(count: number) {
  // Mirror the supabase-js builder chain used inside checkRateLimit:
  //   client.from(...).select(..., { count, head: true }).eq(...).gte(...)
  // Resolves to { count, error: null }.
  const final = Promise.resolve({ count, error: null });
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.gte = vi.fn(() => final);
  return builder as unknown as Parameters<typeof checkRateLimit>[0];
}

describe("checkRateLimit", () => {
  it("returns { allowed:true, remaining:9 } when count=1 limit=10", async () => {
    const r = await checkRateLimit(makeStubClient(1), "u1", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
    expect(r.count).toBe(1);
  });

  it("returns { allowed:false, retry_after_seconds } when count=limit", async () => {
    const r = await checkRateLimit(makeStubClient(10), "u1", 10);
    expect(r.allowed).toBe(false);
    expect(r.retry_after_seconds).toBeGreaterThan(0);
    expect(r.remaining).toBe(0);
  });

  it("returns { allowed:false } when count exceeds limit", async () => {
    const r = await checkRateLimit(makeStubClient(99), "u1", 10);
    expect(r.allowed).toBe(false);
  });

  it("returns { allowed:true, remaining:10 } when count=0", async () => {
    const r = await checkRateLimit(makeStubClient(0), "u1", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(10);
  });
});
