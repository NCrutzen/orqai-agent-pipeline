// Phase 82.4 Plan 05 — RED tests for loadStageFeedbackList (Option Z).
//
// Locks (per Plan 82.4-05 must_haves):
//   - Per-stage list of every email with a verdict at that stage.
//   - Three queries: pipeline_events (stage=$stage, swarm_type=$swarm),
//     email_pipeline.emails (subject/sender/received_at/mailbox), and
//     email_feedback (own-latest verdict join, filtered by stage and
//     optionally operator_id).
//   - Sort buckets: needs_action < auto_handled < own_reviewed; within
//     bucket, received_at DESC.
//   - Pagination: cursor on pipeline_events.created_at — `.lt('created_at',
//     before)` filter on pipeline_events AND `nextBefore` returned from
//     the same column on the last surfaced row. Same column both ways —
//     no drift across pages.
//
// Hard-separation reminder (RFC docs/agentic-pipeline/README.md):
//   The loader queries pipeline_events filtered by an explicit stage
//   parameter; the per-tab consumer respects Stage 1 (noise) vs Stage 3
//   (intent) hard separation by simply passing a different stage value.
//   This module does NOT blur the two.

import { describe, it, expect, vi } from "vitest";
import {
  loadStageFeedbackList,
  type FeedbackListParams,
} from "../feedback-list-loader";

interface BuilderTrace {
  table: string;
  schema?: string;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  ltCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts: unknown }>;
  inCalls: Array<{ col: string; vals: unknown[] }>;
  limit: number | null;
}

function makeBuilder(
  trace: BuilderTrace,
  resolveValue: { data: unknown; error: unknown },
) {
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => {
    trace.selectCols = cols;
    return b;
  };
  b.eq = (col: string, val: unknown) => {
    trace.eqCalls.push({ col, val });
    return b;
  };
  b.lt = (col: string, val: unknown) => {
    trace.ltCalls.push({ col, val });
    return b;
  };
  b.order = (col: string, opts: unknown) => {
    trace.orderCalls.push({ col, opts });
    return b;
  };
  b.in = (col: string, vals: unknown[]) => {
    trace.inCalls.push({ col, vals });
    return b;
  };
  b.limit = (n: number) => {
    trace.limit = n;
    return b;
  };
  b.then = (cb: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(cb(resolveValue));
  return b;
}

function makeAdmin(
  resolveByTable: Record<string, { data: unknown; error: unknown }>,
  schemaResolveByTable: Record<
    string,
    Record<string, { data: unknown; error: unknown }>
  > = {},
) {
  const traces: BuilderTrace[] = [];
  const admin = {
    from: (table: string) => {
      const trace: BuilderTrace = {
        table,
        selectCols: null,
        eqCalls: [],
        ltCalls: [],
        orderCalls: [],
        inCalls: [],
        limit: null,
      };
      traces.push(trace);
      return makeBuilder(
        trace,
        resolveByTable[table] ?? { data: [], error: null },
      );
    },
    schema: (schemaName: string) => ({
      from: (table: string) => {
        const trace: BuilderTrace = {
          schema: schemaName,
          table,
          selectCols: null,
          eqCalls: [],
          ltCalls: [],
          orderCalls: [],
          inCalls: [],
          limit: null,
        };
        traces.push(trace);
        return makeBuilder(
          trace,
          schemaResolveByTable[schemaName]?.[table] ?? {
            data: [],
            error: null,
          },
        );
      },
    }),
  };
  return { admin, traces };
}

// Common fixture: 3 pipeline_events for emails A, B, C (stage=1, debtor-email)
// - email_pipeline.emails has A, B (C is missing → must be dropped).
// - email_feedback has A only (verdict='confirm', operator_id='op1').
// - Decision values: A='ok' (auto_handled), B='unknown' (needs_action), C='ok'.
function commonFixture() {
  return {
    pipeline_events: {
      data: [
        {
          id: "pe-A",
          email_id: "email-A",
          stage: 1,
          decision: "ok",
          created_at: "2026-05-12T10:00:00Z",
        },
        {
          id: "pe-B",
          email_id: "email-B",
          stage: 1,
          decision: "unknown",
          created_at: "2026-05-12T09:00:00Z",
        },
        {
          id: "pe-C",
          email_id: "email-C",
          stage: 1,
          decision: "ok",
          created_at: "2026-05-12T08:00:00Z",
        },
      ],
      error: null,
    },
    emails: {
      data: [
        {
          id: "email-A",
          subject: "A subject",
          sender_email: "a@example.com",
          sender_name: "A Co",
          received_at: "2026-05-12T10:05:00Z",
          mailbox_id: 4,
        },
        {
          id: "email-B",
          subject: "B subject",
          sender_email: "b@example.com",
          sender_name: "B Co",
          received_at: "2026-05-12T09:05:00Z",
          mailbox_id: 4,
        },
        // email-C intentionally missing → must be dropped.
      ],
      error: null,
    },
    email_feedback: {
      data: [
        {
          email_id: "email-A",
          stage: 1,
          verdict: "confirm",
          operator_id: "op1",
          created_at: "2026-05-12T11:00:00Z",
        },
      ],
      error: null,
    },
  };
}

describe("Phase 82.4 Plan 05: loadStageFeedbackList", () => {
  it("1. Happy path: drops missing-email rows; sorts needs_action then auto_handled then own_reviewed", async () => {
    const fx = commonFixture();
    const { admin } = makeAdmin(
      {
        pipeline_events: fx.pipeline_events,
        email_feedback: fx.email_feedback,
      },
      { email_pipeline: { emails: fx.emails } },
    );
    const params: FeedbackListParams = {
      stage: 1,
      swarmType: "debtor-email",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await loadStageFeedbackList(admin as any, params);
    // C dropped (no email row). Two surviving: B (needs_action), A (own_reviewed).
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0].email_id).toBe("email-B");
    expect(page.rows[0].sort_bucket).toBe("needs_action");
    expect(page.rows[1].email_id).toBe("email-A");
    expect(page.rows[1].sort_bucket).toBe("own_reviewed");
    expect(page.rows[1].own_latest_verdict).toBe("confirm");
  });

  it("2. mineOnly=true + operatorId returns only rows with own feedback", async () => {
    const fx = commonFixture();
    const { admin } = makeAdmin(
      {
        pipeline_events: fx.pipeline_events,
        email_feedback: fx.email_feedback,
      },
      { email_pipeline: { emails: fx.emails } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
      mineOnly: true,
      operatorId: "op1",
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].email_id).toBe("email-A");
    expect(page.rows[0].own_latest_verdict).toBe("confirm");
  });

  it("3. mineOnly=true without operatorId returns empty (defensive)", async () => {
    const fx = commonFixture();
    const { admin } = makeAdmin(
      {
        pipeline_events: fx.pipeline_events,
        email_feedback: fx.email_feedback,
      },
      { email_pipeline: { emails: fx.emails } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
      mineOnly: true,
      // operatorId intentionally omitted.
    });
    expect(page.rows).toEqual([]);
    expect(page.nextBefore).toBeNull();
  });

  it("4. needsActionOnly=true applies .in('decision', [...]) filter on pipeline_events", async () => {
    const fx = commonFixture();
    const { admin, traces } = makeAdmin(
      {
        pipeline_events: fx.pipeline_events,
        email_feedback: fx.email_feedback,
      },
      { email_pipeline: { emails: fx.emails } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
      needsActionOnly: true,
    });
    const peTrace = traces.find((t) => t.table === "pipeline_events")!;
    const decisionIn = peTrace.inCalls.find((c) => c.col === "decision");
    expect(decisionIn).toBeDefined();
    // Closed needs-action set (Plan 82.4-05 spec).
    expect((decisionIn!.vals as string[]).length).toBeGreaterThan(0);
    expect(decisionIn!.vals).toEqual(
      expect.arrayContaining(["unknown"]),
    );
  });

  it("5. before cursor triggers .lt('created_at', before) on pipeline_events", async () => {
    const fx = commonFixture();
    const { admin, traces } = makeAdmin(
      {
        pipeline_events: fx.pipeline_events,
        email_feedback: fx.email_feedback,
      },
      { email_pipeline: { emails: fx.emails } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
      before: "2026-05-12T00:00:00Z",
    });
    const peTrace = traces.find((t) => t.table === "pipeline_events")!;
    expect(peTrace.ltCalls).toContainEqual({
      col: "created_at",
      val: "2026-05-12T00:00:00Z",
    });
  });

  it("6. empty pipeline_events → {rows:[], nextBefore:null}", async () => {
    const { admin, traces } = makeAdmin({
      pipeline_events: { data: [], error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
    });
    expect(page).toEqual({ rows: [], nextBefore: null });
    // No emails / email_feedback queries fired.
    expect(traces.find((t) => t.table === "email_feedback")).toBeUndefined();
  });

  it("7. pagination cursor = pipeline_events.created_at of last returned row when full page", async () => {
    // Need at least `limit` surviving rows. Use limit=2; supply 2 pipeline_events rows
    // both of which have matching email rows AND a feedback row (so neither is dropped).
    const { admin } = makeAdmin(
      {
        pipeline_events: {
          data: [
            {
              id: "pe-X",
              email_id: "email-X",
              stage: 1,
              decision: "ok",
              created_at: "2026-05-12T10:00:00Z",
            },
            {
              id: "pe-Y",
              email_id: "email-Y",
              stage: 1,
              decision: "ok",
              created_at: "2026-05-12T09:00:00Z",
            },
          ],
          error: null,
        },
        email_feedback: { data: [], error: null },
      },
      {
        email_pipeline: {
          emails: {
            data: [
              {
                id: "email-X",
                subject: "X",
                sender_email: "x@e.com",
                sender_name: "X",
                received_at: "2026-05-12T10:30:00Z",
                mailbox_id: 4,
              },
              {
                id: "email-Y",
                subject: "Y",
                sender_email: "y@e.com",
                sender_name: "Y",
                received_at: "2026-05-12T09:30:00Z",
                mailbox_id: 4,
              },
            ],
            error: null,
          },
        },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await loadStageFeedbackList(admin as any, {
      stage: 1,
      swarmType: "debtor-email",
      limit: 2,
    });
    expect(page.rows).toHaveLength(2);
    // nextBefore must equal the pipeline_events.created_at of the LAST returned row
    // (NOT email_pipeline.emails.received_at — same column as the .lt filter uses).
    // Both rows are auto_handled (received_at desc) → X then Y → last = Y.
    expect(page.nextBefore).toBe("2026-05-12T09:00:00Z");
  });

  // Sanity reference so the vi import isn't pruned.
  it("vi import sanity", () => {
    expect(typeof vi.fn).toBe("function");
  });
});
