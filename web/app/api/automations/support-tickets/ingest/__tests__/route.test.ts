// Plan 01-02 Task 2 — POST /api/automations/support-tickets/ingest contract tests.
//
// Locks the Walking Skeleton route surface: HMAC reject (401), bad-enum (400),
// body-size reject (413), rate-limit reject (429), happy path (200 + 1
// support_tickets row + 2 pipeline_events rows on the canonical table).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────

const supabaseOps: Array<{
  op: "insert" | "select";
  table: string;
  payload?: unknown;
}> = [];

// Configurable behavior for the rate-limit + insert paths.
const fixture = {
  rateLimitCount: 0,
  supportTicketInsertId: "st-uuid-1",
  forceInsertError: false as boolean,
  // Force pipeline_events bulk-insert to resolve with { data: null, error: {...} }
  // — mirrors supabase-js v2 behavior on UUID parse / RLS / constraint failure.
  pipelineEventsInsertError: null as null | {
    message: string;
    code: string;
    details: string;
  },
};

vi.mock("@/lib/supabase/admin", () => {
  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts && opts.count === "exact" && opts.head === true) {
        // rate-limit count branch — resolves with { count, error: null }
        const finalThen = {
          eq: vi.fn(() => finalThen),
          gte: vi.fn(() =>
            Promise.resolve({ count: fixture.rateLimitCount, error: null }),
          ),
        };
        return finalThen;
      }
      return chain;
    });
    chain.insert = vi.fn((payload: unknown) => {
      supabaseOps.push({ op: "insert", table, payload });
      const result: Record<string, unknown> = {
        select: vi.fn(() => result),
        single: vi.fn(() =>
          Promise.resolve(
            fixture.forceInsertError
              ? { data: null, error: { message: "boom" } }
              : { data: { id: fixture.supportTicketInsertId }, error: null },
          ),
        ),
        then: undefined,
      };
      // For .insert([array]) — bulk pipeline_events — caller awaits the
      // builder directly without `.select().single()`. Resolve with the
      // configured pipelineEventsInsertError (default null) so tests can
      // simulate a silent DB-error path (UUID parse, RLS rejection, etc.).
      const thenable: Record<string, unknown> = {
        ...result,
        then: (onFulfilled: (v: unknown) => unknown) =>
          onFulfilled({
            data: null,
            error:
              table === "pipeline_events"
                ? fixture.pipelineEventsInsertError
                : null,
          }),
      };
      return thenable as unknown;
    });
    return chain;
  }

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => makeChain(table)),
    })),
  };
});

import { POST } from "../route";

// ── Helpers ──────────────────────────────────────────────────────────────

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeReq(opts: {
  body: unknown;
  secret?: string;
}): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.secret !== undefined) {
    headers.set("x-support-ingest-secret", opts.secret);
  }
  return new NextRequest("http://test.local/api/automations/support-tickets/ingest", {
    method: "POST",
    headers,
    body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}

beforeEach(() => {
  supabaseOps.length = 0;
  fixture.rateLimitCount = 0;
  fixture.supportTicketInsertId = "st-uuid-1";
  fixture.forceInsertError = false;
  fixture.pipelineEventsInsertError = null;
  process.env.SUPPORT_INGEST_SECRET = SECRET;
  delete process.env.SUPPORT_MAX_VIDEO_BYTES;
  delete process.env.SUPPORT_RATE_LIMIT_PER_HOUR;
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/automations/support-tickets/ingest", () => {
  it("rejects missing HMAC header with 401 and writes no support_tickets row", async () => {
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "bug",
          external_task_id: "CU-NOHMAC-001",
        },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.action).toBe("rejected_safety");
    expect(
      supabaseOps.filter((o) => o.table === "support_tickets").length,
    ).toBe(0);
  });

  it("rejects wrong HMAC with 401", async () => {
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "bug",
          external_task_id: "CU-WRONGHMAC-001",
        },
        secret: "WRONG",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await POST(makeReq({ body: "{not json", secret: SECRET }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.action).toBe("failed");
    expect(body.error).toMatch(/json/i);
  });

  it("rejects user_chosen_type='nonsense' with 400 mentioning user_chosen_type", async () => {
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "nonsense",
          external_task_id: "CU-BADENUM-001",
        },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.action).toBe("failed");
    expect(body.error).toMatch(/user_chosen_type/);
  });

  it("rejects missing external_task_id with 400 (Zod rejects before any DB write)", async () => {
    const res = await POST(
      makeReq({
        body: { submitter_id: "u1", user_chosen_type: "bug" },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.action).toBe("failed");
    expect(body.error).toMatch(/external_task_id/);
    // No DB writes whatsoever — Zod gate fires before Stage 0.
    expect(
      supabaseOps.filter((o) => o.table === "support_tickets").length,
    ).toBe(0);
    expect(
      supabaseOps.filter((o) => o.table === "pipeline_events").length,
    ).toBe(0);
  });

  it("rejects unknown top-level fields (e.g. submission_id) with 400", async () => {
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "bug",
          external_task_id: "CU-UNKNOWN-001",
          submission_id: "00000000-0000-0000-0000-000000000000",
        },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects oversize video with 413 and reason=body_size", async () => {
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "bug",
          external_task_id: "CU-OVERSIZE-001",
          video_size_bytes: 999_999_999,
        },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.action).toBe("rejected_safety");
    expect(body.reason).toBe("body_size");
  });

  it("rejects rate-limited submitter with 429 and a Retry-After header", async () => {
    fixture.rateLimitCount = 99; // well over default limit 10
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "u1",
          user_chosen_type: "bug",
          external_task_id: "CU-RATELIMIT-001",
        },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.json();
    expect(body.action).toBe("rejected_safety");
    expect(body.reason).toBe("rate_limit");
  });

  it("HAPPY PATH — writes 1 support_tickets row + 2 pipeline_events rows; email_id=submission_id (UUID), external_task_id in decision_details", async () => {
    const EXTERNAL_TASK_ID = "CU-HAPPY-001";
    const res = await POST(
      makeReq({
        body: {
          submitter_id: "smoke-happy",
          user_chosen_type: "bug",
          external_task_id: EXTERNAL_TASK_ID,
        },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("stage_0_dispatched");
    expect(body.submission_id).toBeTruthy();
    expect(body.automation_run_id).toBe("st-uuid-1");

    const ticketInserts = supabaseOps.filter(
      (o) => o.op === "insert" && o.table === "support_tickets",
    );
    expect(ticketInserts.length).toBe(1);
    const ticket = ticketInserts[0].payload as Record<string, unknown>;
    expect(ticket.user_chosen_type).toBe("bug");
    expect(ticket.attempt).toBe(1);
    expect(ticket.submitter_id).toBe("smoke-happy");
    // external_task_id MUST be persisted on the support_tickets row.
    expect(ticket.external_task_id).toBe(EXTERNAL_TASK_ID);

    const eventInserts = supabaseOps.filter(
      (o) => o.op === "insert" && o.table === "pipeline_events",
    );
    expect(eventInserts.length).toBe(1); // single .insert([...]) batched call
    const events = eventInserts[0].payload as Array<Record<string, unknown>>;
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(2);

    const stage0 = events.find((e) => e.stage === 0)!;
    const stage1 = events.find((e) => e.stage === 1)!;

    // email_id is UUID-typed; for support-tickets it carries the
    // submission_id (UUID generated by randomUUID() at ingest — same value
    // returned to caller in body.submission_id), NOT the support_tickets PK
    // (which is automation_run_id) and NOT the text-typed external_task_id.
    expect(stage0.swarm_type).toBe("support-tickets");
    expect(stage0.decision).toBe("safe");
    expect(stage0.email_id).toBe(body.submission_id);
    expect(typeof stage0.duration_ms).toBe("number");
    // external_task_id lives in decision_details for per-event audit trail.
    const stage0Details = stage0.decision_details as Record<string, unknown>;
    expect(stage0Details.external_task_id).toBe(EXTERNAL_TASK_ID);

    expect(stage1.swarm_type).toBe("support-tickets");
    expect(stage1.decision).toBe("route_bug");
    expect(stage1.email_id).toBe(body.submission_id);
    expect(typeof stage1.duration_ms).toBe("number");
    expect(stage1.automation_run_id).toBe("st-uuid-1");
    const stage1Details = stage1.decision_details as Record<string, unknown>;
    expect(stage1Details.external_task_id).toBe(EXTERNAL_TASK_ID);
  });

  it("SILENT INSERT FAILURE — pipeline_events DB error is logged but route still returns 200", async () => {
    // Simulate the original production bug: supabase-js returns
    // { data: null, error: {...} } on UUID parse failure (or any DB error).
    // The route MUST NOT swallow this silently — it must log via
    // console.error AND continue to return 200 (telemetry is non-fatal once
    // the user-visible support_tickets row is persisted).
    fixture.pipelineEventsInsertError = {
      message: "invalid input syntax for type uuid",
      code: "22P02",
      details: 'Token "CU-HAPPY-001" is invalid.',
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(
        makeReq({
          body: {
            submitter_id: "smoke-silent-fail",
            user_chosen_type: "bug",
            external_task_id: "CU-SILENT-FAIL-001",
          },
          secret: SECRET,
        }),
      );
      // Route still returns 200 — support_tickets row exists; telemetry is best-effort.
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.action).toBe("stage_0_dispatched");
      expect(body.automation_run_id).toBe("st-uuid-1");

      // The .error path MUST have been observed and logged.
      const loggedFailure = errorSpy.mock.calls.some((args) =>
        args.some(
          (a) =>
            typeof a === "string" && a.includes("pipeline_events insert failed"),
        ),
      );
      expect(loggedFailure).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
