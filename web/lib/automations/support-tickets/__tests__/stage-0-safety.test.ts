// Plan 01-02 Task 1 — stage-0-safety.ts behavior tests.
// SAFETY-01 HMAC, SAFETY-02 rate-limit, SAFETY-03 body-size.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the rate-limit module so stage-0-safety can be unit-tested without DB.
vi.mock("../rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { runStage0Safety } from "../stage-0-safety";
import { checkRateLimit } from "../rate-limit";

const VALID_SECRET = "a".repeat(64);

function makeHeaders(secret?: string): Headers {
  const h = new Headers();
  if (secret !== undefined) h.set("x-support-ingest-secret", secret);
  return h;
}

const fakeSupabase = {} as unknown as Parameters<typeof runStage0Safety>[0]["supabase"];

beforeEach(() => {
  vi.mocked(checkRateLimit).mockReset();
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    count: 0,
    remaining: 10,
  });
});

describe("runStage0Safety", () => {
  it("rejects missing HMAC header with verdict='rejected_hmac' http_status=401", async () => {
    const r = await runStage0Safety({
      headers: makeHeaders(),
      body: { submitter_id: "u1", user_chosen_type: "bug" },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("rejected_hmac");
    expect(r.http_status).toBe(401);
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
  });

  it("rejects wrong HMAC (same length, different byte) — exercises the timingSafeEqual code path", async () => {
    // Equal-length-but-different-byte input takes the constant-time compare
    // branch (no length short-circuit before the compare). We verify
    // rejection; the implementation file is greppable for `timingSafeEqual`
    // (asserted by the route-level grep gate in Task 2's <verify>).
    const wrong = "b".repeat(VALID_SECRET.length);
    const r = await runStage0Safety({
      headers: makeHeaders(wrong),
      body: { submitter_id: "u1", user_chosen_type: "bug" },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("rejected_hmac");
    expect(r.http_status).toBe(401);
  });

  it("uses node:crypto.timingSafeEqual (source-level invariant)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "..", "stage-0-safety.ts"),
      "utf8",
    );
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/node:crypto/);
  });

  it("rejects HMAC of different length (length-mismatch normalized to rejection)", async () => {
    const r = await runStage0Safety({
      headers: makeHeaders("short"),
      body: { submitter_id: "u1", user_chosen_type: "bug" },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("rejected_hmac");
    expect(r.http_status).toBe(401);
  });

  it("rejects oversized body with verdict='rejected_body_size' http_status=413", async () => {
    const r = await runStage0Safety({
      headers: makeHeaders(VALID_SECRET),
      body: {
        submitter_id: "u1",
        user_chosen_type: "bug",
        video_size_bytes: 999_999_999,
      },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("rejected_body_size");
    expect(r.http_status).toBe(413);
  });

  it("rejects rate-limited submitter with verdict='rejected_rate_limit' http_status=429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      count: 10,
      remaining: 0,
      retry_after_seconds: 3600,
    });
    const r = await runStage0Safety({
      headers: makeHeaders(VALID_SECRET),
      body: { submitter_id: "u1", user_chosen_type: "bug" },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("rejected_rate_limit");
    expect(r.http_status).toBe(429);
    expect(r.retry_after_seconds).toBe(3600);
  });

  it("returns verdict='safe' http_status=200 with duration_ms when all gates pass", async () => {
    const r = await runStage0Safety({
      headers: makeHeaders(VALID_SECRET),
      body: { submitter_id: "u1", user_chosen_type: "bug" },
      supabase: fakeSupabase,
      env: { SUPPORT_INGEST_SECRET: VALID_SECRET },
    });
    expect(r.verdict).toBe("safe");
    expect(r.http_status).toBe(200);
    expect(typeof r.duration_ms).toBe("number");
  });
});
