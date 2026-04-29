// Phase 56.7 Wave 2 (D-02, D-10, D-11, D-12). Tests for the registry-driven
// classifier-verdict-worker. After Task 2's rewrite, the worker loads the
// matching swarm_categories row and switches on `category.action`. These tests
// pin every branch:
//
//   - decision='reject' short-circuit (no registry lookup)
//   - action='categorize_archive' with outlook_label set (Outlook side-effects)
//   - action='categorize_archive' with outlook_label=null (D-11: skip both)
//   - action='reject' (no-op + mark completed)
//   - action='manual_review' (no-op + mark completed)
//   - action='swarm_dispatch' (fires inngest.send with category.swarm_dispatch)
//   - action='swarm_dispatch' with null swarm_dispatch column (throws)
//   - missing category row (mark failed + throw)
//   - predicted_category='payment_admittance' resolves to its own seeded row
//   - swarm_type='sales' + categorize_archive: NO iController-delete (D-12)
//
// Pitfall 3 (compile-time): if a future migration adds a new SwarmAction
// literal, the worker's `default:` branch will fail to compile (`never`
// exhaustive check). That's enforced by tsc, not by a runtime test here.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SwarmCategoryRow } from "@/lib/swarms/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track every admin DB call so assertions can check tables, payloads, ids.
type FromCall = {
  table: string;
  op: "update" | "insert";
  payload: Record<string, unknown>;
  eqArgs?: [string, unknown];
};
const fromCalls: FromCall[] = [];

const updateMock = vi.fn();
const insertMock = vi.fn();
const eqMock = vi.fn();

function makeChainable(table: string) {
  return {
    update: (payload: Record<string, unknown>) => {
      updateMock(table, payload);
      return {
        eq: (col: string, val: unknown) => {
          eqMock(table, col, val);
          fromCalls.push({ table, op: "update", payload, eqArgs: [col, val] });
          return Promise.resolve({ error: null });
        },
      };
    },
    insert: async (payload: Record<string, unknown>) => {
      insertMock(table, payload);
      fromCalls.push({ table, op: "insert", payload });
      return { error: null };
    },
  };
}

const fromMock = vi.fn((table: string) => makeChainable(table));
const adminClientMock = { from: fromMock };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Programmable category list per test.
let categoriesToReturn: SwarmCategoryRow[] = [];
const loadSwarmCategoriesMock = vi.fn(async () => categoriesToReturn);

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmCategories: (...args: unknown[]) => loadSwarmCategoriesMock(...args),
}));

const categorizeMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const archiveMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));

vi.mock("@/lib/outlook", () => ({
  categorizeEmail: (...args: unknown[]) => categorizeMock(...args),
  archiveEmail: (...args: unknown[]) => archiveMock(...args),
}));

const emitStaleMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));

const inngestSendMock = vi.fn(async (..._args: unknown[]) => undefined);

// Stub the inngest client: capture the handler so we can invoke directly.
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      handler: (ctx: unknown) => Promise<unknown>,
    ) => ({ __handler: handler }),
    send: (...args: unknown[]) => inngestSendMock(...args),
  },
}));

// Import AFTER mocks are wired.
import { classifierVerdictWorker } from "@/lib/inngest/functions/classifier-verdict-worker";

// ---------------------------------------------------------------------------
// Invocation helper
// ---------------------------------------------------------------------------

type EventData = {
  automation_run_id: string;
  swarm_type: string;
  decision: "approve" | "reject";
  message_id: string;
  source_mailbox: string | number;
  predicted_category: string;
  override_category?: string | null;
  agent_run_id?: string;
  rule_key?: string;
  entity?: string;
};

async function invokeWorker(data: EventData) {
  const stepRun = async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> =>
    Promise.resolve(fn());
  const handler = (classifierVerdictWorker as unknown as {
    __handler: (ctx: {
      event: { data: EventData };
      step: { run: typeof stepRun };
    }) => Promise<unknown>;
  }).__handler;
  return handler({ event: { data }, step: { run: stepRun } });
}

function baseEvent(overrides: Partial<EventData> = {}): EventData {
  return {
    automation_run_id: "run-1",
    swarm_type: "debtor-email",
    decision: "approve",
    message_id: "msg-1",
    source_mailbox: 1,
    predicted_category: "payment",
    override_category: null,
    agent_run_id: "agent-1",
    rule_key: "payment-rule",
    entity: "debtor",
    ...overrides,
  };
}

function row(partial: Partial<SwarmCategoryRow>): SwarmCategoryRow {
  return {
    swarm_type: "debtor-email",
    category_key: "payment",
    display_label: "Payment",
    outlook_label: "Payment Admittance",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 10,
    enabled: true,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fromCalls.length = 0;
  fromMock.mockClear();
  updateMock.mockClear();
  insertMock.mockClear();
  eqMock.mockClear();
  loadSwarmCategoriesMock.mockClear();
  categorizeMock.mockClear();
  archiveMock.mockClear();
  emitStaleMock.mockClear();
  inngestSendMock.mockClear();
  categoriesToReturn = [];
});

describe("classifier-verdict-worker: registry-driven dispatch", () => {
  it("Test 1: decision=reject short-circuits without registry lookup", async () => {
    await invokeWorker(baseEvent({ decision: "reject" }));

    expect(loadSwarmCategoriesMock).not.toHaveBeenCalled();
    expect(categorizeMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();

    const updates = fromCalls.filter(
      (c) => c.table === "automation_runs" && c.op === "update",
    );
    expect(updates.length).toBeGreaterThan(0);
    const completed = updates.find(
      (c) => (c.payload as { status?: string }).status === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("Test 2: action=categorize_archive with outlook_label set fires Outlook + iController-delete", async () => {
    categoriesToReturn = [row({})];
    await invokeWorker(baseEvent());

    expect(categorizeMock).toHaveBeenCalledWith(1, "msg-1", "Payment Admittance");
    expect(archiveMock).toHaveBeenCalledWith(1, "msg-1");

    const cleanupInsert = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "insert" &&
        (c.payload as { automation?: string }).automation === "debtor-email-cleanup",
    );
    expect(cleanupInsert).toBeDefined();
    expect((cleanupInsert!.payload as { swarm_type?: string }).swarm_type).toBe(
      "debtor-email",
    );

    const completed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string }).status === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("Test 3: action=categorize_archive with outlook_label=null skips both Outlook steps but still fires iController-delete", async () => {
    categoriesToReturn = [row({ outlook_label: null })];
    await invokeWorker(baseEvent());

    expect(categorizeMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();

    // D-12 gate is on swarm_type, not on outlook_label.
    const cleanupInsert = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "insert" &&
        (c.payload as { automation?: string }).automation === "debtor-email-cleanup",
    );
    expect(cleanupInsert).toBeDefined();

    const completed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string }).status === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("Test 4: action=reject + decision=approve no-ops side-effects, marks completed", async () => {
    categoriesToReturn = [
      row({ category_key: "unknown", action: "reject", outlook_label: null }),
    ];
    await invokeWorker(baseEvent({ predicted_category: "unknown" }));

    expect(categorizeMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();

    const completed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string }).status === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("Test 5: action=manual_review no-ops side-effects, still marks completed (per RESEARCH.md)", async () => {
    categoriesToReturn = [
      row({
        category_key: "needs_human",
        action: "manual_review",
        outlook_label: null,
      }),
    ];
    await invokeWorker(baseEvent({ predicted_category: "needs_human" }));

    expect(categorizeMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();

    const completed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string }).status === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("Test 6: action=swarm_dispatch fires inngest.send with category.swarm_dispatch event name", async () => {
    categoriesToReturn = [
      row({
        category_key: "invoice_copy_request",
        action: "swarm_dispatch",
        swarm_dispatch: "invoice-copy/dispatch.requested",
        outlook_label: null,
      }),
    ];
    await invokeWorker(baseEvent({ predicted_category: "invoice_copy_request" }));

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const sendArg = inngestSendMock.mock.calls[0][0] as {
      name: string;
      data: Record<string, unknown>;
    };
    expect(sendArg.name).toBe("invoice-copy/dispatch.requested");
    expect(sendArg.data).toMatchObject({
      automation_run_id: "run-1",
      swarm_type: "debtor-email",
      category_key: "invoice_copy_request",
      message_id: "msg-1",
      source_mailbox: 1,
    });

    expect(categorizeMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
  });

  it("Test 7: action=swarm_dispatch with null swarm_dispatch column throws", async () => {
    categoriesToReturn = [
      row({
        category_key: "broken",
        action: "swarm_dispatch",
        swarm_dispatch: null,
        outlook_label: null,
      }),
    ];

    await expect(
      invokeWorker(baseEvent({ predicted_category: "broken" })),
    ).rejects.toThrow(/swarm_dispatch action requires swarm_dispatch event name/);

    expect(inngestSendMock).not.toHaveBeenCalled();

    const failed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string }).status === "failed",
    );
    expect(failed).toBeDefined();
  });

  it("Test 8: missing category row marks automation_runs failed and throws", async () => {
    categoriesToReturn = []; // no matching row
    await expect(
      invokeWorker(baseEvent({ predicted_category: "bogus" })),
    ).rejects.toThrow(/no swarm_categories row for \(debtor-email, bogus\)/);

    const failed = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "update" &&
        (c.payload as { status?: string; error_message?: string }).status === "failed",
    );
    expect(failed).toBeDefined();
    expect(
      (failed!.payload as { error_message?: string }).error_message,
    ).toMatch(/no swarm_categories row for \(debtor-email, bogus\)/);
  });

  it("Test 9: predicted_category='payment_admittance' resolves to its own seeded alias row (NOT normalized)", async () => {
    // Two seeded rows: 'payment' and the alias 'payment_admittance'.
    categoriesToReturn = [
      row({ category_key: "payment", outlook_label: "Payment Admittance" }),
      row({
        category_key: "payment_admittance",
        outlook_label: "Payment Admittance",
        display_order: 15,
      }),
    ];
    await invokeWorker(
      baseEvent({ predicted_category: "payment_admittance" }),
    );

    expect(categorizeMock).toHaveBeenCalledWith(1, "msg-1", "Payment Admittance");
    expect(archiveMock).toHaveBeenCalledWith(1, "msg-1");
  });

  it("Test 10: swarm_type='sales' + categorize_archive does NOT insert iController-delete row (D-12)", async () => {
    categoriesToReturn = [
      row({
        swarm_type: "sales",
        category_key: "lead_followup",
        outlook_label: "Lead Follow-up",
      }),
    ];
    await invokeWorker(
      baseEvent({
        swarm_type: "sales",
        predicted_category: "lead_followup",
      }),
    );

    expect(categorizeMock).toHaveBeenCalled();
    expect(archiveMock).toHaveBeenCalled();

    const cleanupInsert = fromCalls.find(
      (c) =>
        c.table === "automation_runs" &&
        c.op === "insert" &&
        (c.payload as { automation?: string }).automation === "debtor-email-cleanup",
    );
    expect(cleanupInsert).toBeUndefined();
  });
});
