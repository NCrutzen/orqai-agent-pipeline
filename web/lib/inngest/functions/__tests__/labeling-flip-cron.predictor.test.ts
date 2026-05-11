// Phase 999.8 Plan 01 — RED scaffold for per-predictor Wilson-CI split
// (D-07), the predictor IS NOT NULL filter (D-09), and the high-conf LLM
// false-positive calibration alarm (D-03).
//
// These tests describe the contract Wave 4 (per-predictor cron split) and
// Wave 5/6 (D-03 alert) must satisfy. They are RED today because:
//   1. `evaluateMailbox` runs ONE aggregate query per mailbox — it does not
//      split by predictor.
//   2. No `.not("predictor", "is", null)` filter exists.
//   3. The audit `rule_key` is `mailbox_flip:${mailbox}` (no `:${predictor}`
//      suffix).
//   4. No `classifier/calibration_drift.detected` emission path exists.
//
// Hard-separation discipline: this is pure Stage 1 mechanics — `predictor`
// is metadata on the Stage 1 noise-filter prediction. No swarm_intents /
// Stage 3 crossings.
//
// Pitfall 1 (RESEARCH §0): the cron filters `swarm_type='debtor-email'`
// (the value `recordVerdict` actually writes; production count = 404 rows
// all 'debtor-email', zero 'debtor-email-labeling' per the pre-flight
// verification 2026-05-11). Test asserts the eq filter argument is
// 'debtor-email' — Wave 4 MUST also reconcile this.

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factory is hoisted to top-of-file by vitest, so referencing a
// top-level `const inngestSend` inside the factory triggers TDZ. The
// vi.hoisted() escape hatch keeps the spy reachable from the factory AND
// addressable from the test body.
const { inngestSend } = vi.hoisted(() => ({
  inngestSend: vi.fn().mockResolvedValue({ ids: ["evt"] }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg: unknown, _trigger: unknown, handler: unknown) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- Chainable query-builder mock (mirrors load-page-data.test.ts) -------

interface EqCall {
  col: string;
  val: unknown;
}
interface NotCall {
  col: string;
  op: string;
  val: unknown;
}

interface MockBuilder {
  _table: string;
  _eqCalls: EqCall[];
  _notCalls: NotCall[];
  _filterCalls: Array<{ col: string; op: string; val: unknown }>;
  _orderCalls: Array<{ col: string }>;
  _limit: number | null;
  _selectCols: string | null;
  _resolveValue: { data: unknown; error: unknown };
  select: (cols: string) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  not: (col: string, op: string, val: unknown) => MockBuilder;
  filter: (col: string, op: string, val: unknown) => MockBuilder;
  order: (col: string, opts?: unknown) => MockBuilder;
  limit: (n: number) => MockBuilder;
  insert: (
    row: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  update: (row: Record<string, unknown>) => MockBuilder;
  then: (cb: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
}

function makeBuilder(
  table: string,
  resolveValue: { data: unknown; error: unknown },
  insertSink: Array<Record<string, unknown>>,
): MockBuilder {
  const b: Partial<MockBuilder> = {};
  b._table = table;
  b._eqCalls = [];
  b._notCalls = [];
  b._filterCalls = [];
  b._orderCalls = [];
  b._limit = null;
  b._selectCols = null;
  b._resolveValue = resolveValue;
  b.select = (cols) => {
    b._selectCols = cols;
    return b as MockBuilder;
  };
  b.eq = (col, val) => {
    b._eqCalls!.push({ col, val });
    return b as MockBuilder;
  };
  b.not = (col, op, val) => {
    b._notCalls!.push({ col, op, val });
    return b as MockBuilder;
  };
  b.filter = (col, op, val) => {
    b._filterCalls!.push({ col, op, val });
    return b as MockBuilder;
  };
  b.order = (col) => {
    b._orderCalls!.push({ col });
    return b as MockBuilder;
  };
  b.limit = (n) => {
    b._limit = n;
    return b as MockBuilder;
  };
  b.insert = async (row) => {
    insertSink.push({ __table: table, ...row });
    return { data: null, error: null };
  };
  b.update = (_row) => b as MockBuilder;
  b.then = (cb) => Promise.resolve(cb(resolveValue));
  return b as MockBuilder;
}

// ---- Mock admin client ---------------------------------------------------

interface AgentRunFixture {
  human_verdict: string | null;
  predictor: "regex" | "llm_2nd_pass" | null;
  confidence?: string | null;
  corrected_category?: string | null;
}

let regexRows: AgentRunFixture[] = [];
let llmRows: AgentRunFixture[] = [];
const insertSink: Array<Record<string, unknown>> = [];
const builders: MockBuilder[] = [];

function makeAdminMock() {
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") {
        // Discriminate which predictor stream by looking at the most-recent
        // builder created — the test sets `_currentPredictor` before each
        // evaluateMailbox call to route. But since evaluateMailbox is
        // expected (per Wave 4) to issue TWO queries (regex + llm_2nd_pass),
        // we return a per-call builder whose resolved value depends on which
        // .eq("predictor", ...) the caller appends.
        const b = makeBuilder(
          "agent_runs",
          { data: [], error: null },
          insertSink,
        );
        const originalEq = b.eq;
        b.eq = (col: string, val: unknown) => {
          // When the cron pins predictor, swap the resolved value.
          if (col === "predictor") {
            if (val === "regex") {
              b._resolveValue = { data: regexRows, error: null };
            } else if (val === "llm_2nd_pass") {
              b._resolveValue = { data: llmRows, error: null };
            }
          }
          return originalEq.call(b, col, val);
        };
        builders.push(b);
        return b;
      }
      if (table === "classifier_rule_evaluations") {
        const b = makeBuilder(
          "classifier_rule_evaluations",
          { data: null, error: null },
          insertSink,
        );
        builders.push(b);
        return b;
      }
      const b = makeBuilder(table, { data: [], error: null }, insertSink);
      builders.push(b);
      return b;
    }),
    schema: vi.fn(function (this: unknown, _name: string) {
      // Returns the same admin object — debtor.labeling_settings updates land
      // on a fresh builder via the same .from() switch above.
      return admin;
    }),
  };
  return admin;
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// Import AFTER mocks
import { evaluateMailbox } from "@/lib/inngest/functions/labeling-flip-cron";

function mailbox(id = 12) {
  return {
    source_mailbox: "debiteuren@smeba.nl",
    icontroller_mailbox_id: id,
    nxt_database: "SMEBA_NL",
    dry_run: true,
  };
}

function approvedRows(n: number): AgentRunFixture[] {
  return Array.from({ length: n }, (_, i) => ({
    human_verdict: "approve",
    predictor: i % 2 === 0 ? "regex" : "llm_2nd_pass",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  regexRows = [];
  llmRows = [];
  insertSink.length = 0;
  builders.length = 0;
  adminMock = makeAdminMock();
  inngestSend.mockReset();
  inngestSend.mockResolvedValue({ ids: ["evt"] });
});

describe("Phase 999.8 D-07 + D-09 — per-predictor Wilson-CI split", () => {
  it("issues TWO agent_runs queries per mailbox — one per predictor value", async () => {
    regexRows = approvedRows(50).map((r) => ({ ...r, predictor: "regex" }));
    llmRows = approvedRows(50).map((r) => ({ ...r, predictor: "llm_2nd_pass" }));

    await evaluateMailbox(adminMock, mailbox(), false);

    const agentRunsBuilders = builders.filter((b) => b._table === "agent_runs");
    expect(agentRunsBuilders.length).toBeGreaterThanOrEqual(2);

    const predictorValuesPinned = agentRunsBuilders.flatMap((b) =>
      b._eqCalls
        .filter((c) => c.col === "predictor")
        .map((c) => c.val as string),
    );
    expect(predictorValuesPinned).toEqual(
      expect.arrayContaining(["regex", "llm_2nd_pass"]),
    );
  });

  it("each predictor query includes the predictor IS NOT NULL filter (D-09 forward-only)", async () => {
    await evaluateMailbox(adminMock, mailbox(), false);

    const agentRunsBuilders = builders.filter((b) => b._table === "agent_runs");
    const notNullFilters = agentRunsBuilders.flatMap((b) =>
      b._notCalls.filter(
        (c) => c.col === "predictor" && c.op === "is" && c.val === null,
      ),
    );
    expect(notNullFilters.length).toBeGreaterThanOrEqual(2);
  });

  it("each query filters swarm_type='debtor-email' (Pitfall 1: matches what recordVerdict writes)", async () => {
    await evaluateMailbox(adminMock, mailbox(), false);

    const agentRunsBuilders = builders.filter((b) => b._table === "agent_runs");
    const swarmFilters = agentRunsBuilders.flatMap((b) =>
      b._eqCalls.filter((c) => c.col === "swarm_type"),
    );
    expect(swarmFilters.length).toBeGreaterThanOrEqual(2);
    for (const f of swarmFilters) {
      expect(f.val).toBe("debtor-email");
    }
  });

  it("writes TWO audit rows per mailbox — rule_key=mailbox_flip:<mailbox>:<predictor>", async () => {
    regexRows = approvedRows(50).map((r) => ({ ...r, predictor: "regex" }));
    llmRows = approvedRows(50).map((r) => ({ ...r, predictor: "llm_2nd_pass" }));

    await evaluateMailbox(adminMock, mailbox(), false);

    const auditInserts = insertSink.filter(
      (i) => i.__table === "classifier_rule_evaluations",
    );
    expect(auditInserts.length).toBeGreaterThanOrEqual(2);

    const ruleKeys = auditInserts.map((i) => i.rule_key as string);
    expect(ruleKeys).toEqual(
      expect.arrayContaining([
        "mailbox_flip:debiteuren@smeba.nl:regex",
        "mailbox_flip:debiteuren@smeba.nl:llm_2nd_pass",
      ]),
    );
  });

  it("cold-start floor: bucket with n<50 returns no_change action", async () => {
    regexRows = approvedRows(12).map((r) => ({ ...r, predictor: "regex" }));
    llmRows = []; // no llm rows yet — fresh cutover

    await evaluateMailbox(adminMock, mailbox(), false);

    const llmAudit = insertSink.find(
      (i) =>
        i.__table === "classifier_rule_evaluations" &&
        (i.rule_key as string).endsWith(":llm_2nd_pass"),
    );
    expect(llmAudit).toBeDefined();
    expect(llmAudit!.action).toBe("no_change");
    expect(llmAudit!.n).toBe(0);
  });
});

describe("Phase 999.8 D-03 — high-conf LLM false-positive calibration alarm", () => {
  it("alarm tier (>5% high-conf FP, n>=50) → emits classifier/calibration_drift.detected with action='calibration_alarm'", async () => {
    // 50 high-conf LLM predictions, 4 wrong (8% FP > 5% alarm threshold).
    const rows: AgentRunFixture[] = Array.from({ length: 50 }, (_, i) => ({
      human_verdict: i < 4 ? "rejected_other" : "approve",
      predictor: "llm_2nd_pass",
      confidence: "high",
      corrected_category: i < 4 ? "other_category" : null,
    }));
    llmRows = rows;
    regexRows = approvedRows(50).map((r) => ({ ...r, predictor: "regex" }));

    await evaluateMailbox(adminMock, mailbox(), false);

    const calls = inngestSend.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(calls).toContain("classifier/calibration_drift.detected");

    const auditAlarm = insertSink.find(
      (i) =>
        i.__table === "classifier_rule_evaluations" &&
        i.action === "calibration_alarm",
    );
    expect(auditAlarm).toBeDefined();
  });

  it("warn tier (>2% but <=5% high-conf FP) → audit row action='calibration_warn', NO event emission", async () => {
    // 50 high-conf, 2 wrong (4% — between warn 2% and alarm 5%).
    const rows: AgentRunFixture[] = Array.from({ length: 50 }, (_, i) => ({
      human_verdict: i < 2 ? "rejected_other" : "approve",
      predictor: "llm_2nd_pass",
      confidence: "high",
      corrected_category: i < 2 ? "other_category" : null,
    }));
    llmRows = rows;
    regexRows = approvedRows(50).map((r) => ({ ...r, predictor: "regex" }));

    await evaluateMailbox(adminMock, mailbox(), false);

    const auditWarn = insertSink.find(
      (i) =>
        i.__table === "classifier_rule_evaluations" &&
        i.action === "calibration_warn",
    );
    expect(auditWarn).toBeDefined();

    const calls = inngestSend.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(calls).not.toContain("classifier/calibration_drift.detected");
  });
});
