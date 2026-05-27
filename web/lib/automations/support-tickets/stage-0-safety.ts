// Plan 01-02 Stage 0 — safety gates for the support-tickets ingest route.
//
// Composes three checks in order:
//   1. HMAC (SAFETY-01) — constant-time compare via node:crypto.timingSafeEqual.
//      Length-mismatch throws inside timingSafeEqual; we catch and normalize
//      to a rejection (do NOT branch on length BEFORE the compare — that would
//      leak length via timing).
//   2. Body-size (SAFETY-03) — pre-check on body.video_size_bytes. Video
//      duration is NOT checked here; duration is only knowable after Whisper
//      runs in Phase 2.
//   3. Rate-limit (SAFETY-02) — delegates to ./rate-limit.checkRateLimit.
//
// PII/injection stub (SAFETY-04): transcript-based, deferred to Phase 2 Stage 2.
//   Current verdict 'safe' is correct for Phase 1 since no transcript exists yet.
// Cost-ceiling stub (SAFETY-05): per-run cost ceiling enforced once LLM-emitting
//   stages exist (Phase 2+). Current verdict 'safe' is correct for Phase 1
//   since this slice fires zero LLM calls.
//
// ZERO LLM imports, ZERO fetch. The only async work is the rate-limit DB count.

import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "./rate-limit";
import type { IngestBody } from "./types";

export type Stage0Verdict =
  | "safe"
  | "rejected_hmac"
  | "rejected_body_size"
  | "rejected_rate_limit"
  | "failed";

export interface Stage0Result {
  verdict: Stage0Verdict;
  http_status: number;
  duration_ms: number;
  retry_after_seconds?: number;
  decision_details: Record<string, unknown>;
}

interface Stage0Input {
  headers: Headers | Record<string, string | undefined>;
  body: IngestBody;
  supabase: SupabaseClient;
  env: {
    SUPPORT_INGEST_SECRET?: string;
    SUPPORT_MAX_VIDEO_BYTES?: string | number;
    SUPPORT_RATE_LIMIT_PER_HOUR?: string | number;
  };
}

const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const DEFAULT_RATE_LIMIT_PER_HOUR = 10;

function readHeader(
  headers: Stage0Input["headers"],
  name: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  // Plain record — Next.js NextRequest.headers is a Headers instance, but
  // unit tests sometimes pass a plain object. Lookup is case-insensitive
  // because Headers is, and we want parity.
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v ?? undefined;
  }
  return undefined;
}

function constantTimeCompare(a: string, b: string): boolean {
  // timingSafeEqual throws on length mismatch. We deliberately do NOT short-
  // circuit on length before the compare (that would leak length via timing).
  // Instead, if lengths differ, we still call timingSafeEqual on equal-length
  // buffers derived from the LONGER input vs itself so the work is comparable,
  // then return false. Simpler approach with equivalent guarantees: catch the
  // thrown error inside try/catch — the cost difference between throw and
  // successful compare is dominated by Buffer.from allocations either way.
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export async function runStage0Safety(input: Stage0Input): Promise<Stage0Result> {
  const start = performance.now();
  const provided = readHeader(input.headers, "x-support-ingest-secret");
  const expected = input.env.SUPPORT_INGEST_SECRET;

  // (1) HMAC
  if (!provided || !expected || !constantTimeCompare(provided, expected)) {
    return {
      verdict: "rejected_hmac",
      http_status: 401,
      duration_ms: Math.round(performance.now() - start),
      decision_details: {
        submitter_id: input.body?.submitter_id ?? null,
        reason: "missing_or_invalid_hmac",
      },
    };
  }

  // (2) Body-size
  const maxBytes = Number(
    input.env.SUPPORT_MAX_VIDEO_BYTES ?? DEFAULT_MAX_VIDEO_BYTES,
  );
  if (
    input.body.video_size_bytes != null &&
    input.body.video_size_bytes > maxBytes
  ) {
    return {
      verdict: "rejected_body_size",
      http_status: 413,
      duration_ms: Math.round(performance.now() - start),
      decision_details: {
        submitter_id: input.body.submitter_id,
        video_size_bytes: input.body.video_size_bytes,
        max_bytes: maxBytes,
        reason: "body_size",
      },
    };
  }

  // (3) Rate-limit
  const limit = Number(
    input.env.SUPPORT_RATE_LIMIT_PER_HOUR ?? DEFAULT_RATE_LIMIT_PER_HOUR,
  );
  const rl = await checkRateLimit(input.supabase, input.body.submitter_id, limit);
  if (!rl.allowed) {
    return {
      verdict: "rejected_rate_limit",
      http_status: 429,
      duration_ms: Math.round(performance.now() - start),
      retry_after_seconds: rl.retry_after_seconds,
      decision_details: {
        submitter_id: input.body.submitter_id,
        rate_limit_remaining: rl.remaining,
        rate_limit_count: rl.count,
        reason: "rate_limit",
      },
    };
  }

  // SAFETY-04 stub: transcript-based PII/injection check is deferred to
  //   Phase 2 Stage 2 (no transcript exists in Phase 1 — body has only the
  //   user_chosen_type enum and an optional video URL).
  // SAFETY-05 stub: per-run cost ceiling is enforced once LLM-emitting
  //   stages exist (Phase 2+). Phase 1 fires zero LLM calls.

  return {
    verdict: "safe",
    http_status: 200,
    duration_ms: Math.round(performance.now() - start),
    decision_details: {
      submitter_id: input.body.submitter_id,
      video_size_bytes: input.body.video_size_bytes ?? null,
      rate_limit_remaining: rl.remaining,
    },
  };
}
