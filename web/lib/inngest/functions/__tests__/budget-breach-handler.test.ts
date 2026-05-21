// Phase 64-01 Task 3 (RED). BUDG-01 — budget breach handler files Kanban human-review row.
// Worker module shipped by Plan 04. RED state by design until then.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
    send: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/admin", () => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ insert, update }));
  return {
    createAdminClient: vi.fn(() => ({ from })),
    __mocks__: { from, insert, update, eq },
  };
});

import { inngest } from "@/lib/inngest/client";
import * as adminMod from "@/lib/supabase/admin";
import { budgetBreachHandler } from "../budget-breach-handler";

// Phase 88.2-03 lint-narrow (D-10).
type MockRow = Record<string, unknown> & {
  status?: string;
  topic?: string;
  triggered_by?: string;
  error_message?: string;
  result?: Record<string, unknown> & { source_automation_run_id?: string };
};
type AdminMocks = {
  from: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};
type BudgetEvent = {
  event: { data: Record<string, unknown> };
  step: { run: ReturnType<typeof vi.fn> };
};
type BudgetHandler = (e: BudgetEvent) => Promise<unknown>;

const adminMocks = (adminMod as unknown as { __mocks__: AdminMocks }).__mocks__;
const createFunctionMock = inngest.createFunction as unknown as ReturnType<
  typeof vi.fn
>;

function makeStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
  };
}

function getHandler(): BudgetHandler {
  return (budgetBreachHandler as unknown as { handler: BudgetHandler }).handler;
}

beforeEach(() => {
  adminMocks.from.mockClear();
  adminMocks.insert.mockClear();
  adminMocks.update.mockClear();
  adminMocks.eq.mockClear();
});

describe("BUDG-01: budget-breach-handler marks originating run failed", () => {
  it("calls automation_runs.update({status:'failed', error_message:/budget breach/}).eq('id', ...)", async () => {
    const handler = getHandler();
    const step = makeStep();
    await handler({
      event: {
        data: {
          automation_run_id: "ar-orig",
          email_id: "e1",
          budget: { cost_cents: 18, token_count: 4200 },
          reason: "cost_cents 18 > 15",
        },
      },
      step,
    });

    expect(adminMocks.update).toHaveBeenCalled();
    const updateArgs = adminMocks.update.mock.calls.map((c: unknown[]) => c[0] as MockRow);
    const failedUpdate = updateArgs.find(
      (row: MockRow) => row?.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate!.error_message).toMatch(/budget breach/i);

    // .eq("id", automation_run_id) was called
    const eqCalls = adminMocks.eq.mock.calls;
    const idEq = eqCalls.find(
      (c: unknown[]) => c[0] === "id" && c[1] === "ar-orig",
    );
    expect(idEq).toBeDefined();
  });
});

describe("BUDG-01: budget-breach-handler files Kanban human-review row", () => {
  it("inserts a second automation_runs row with topic='budget_breach' and source_automation_run_id link", async () => {
    const handler = getHandler();
    const step = makeStep();
    await handler({
      event: {
        data: {
          automation_run_id: "ar-orig",
          email_id: "e1",
          budget: { cost_cents: 18, token_count: 4200 },
          reason: "cost_cents 18 > 15",
        },
      },
      step,
    });

    const insertArgs = adminMocks.insert.mock.calls.map((c: unknown[]) => c[0] as MockRow);
    const kanbanRow = insertArgs.find(
      (row: MockRow) => row?.topic === "budget_breach",
    );
    expect(kanbanRow).toBeDefined();
    expect(kanbanRow!.triggered_by).toBe("budget-breach-handler");
    expect(kanbanRow!.result?.source_automation_run_id).toBe("ar-orig");
  });
});

describe("BUDG-01: budget-breach-handler is registered with retries:0 (D-13)", () => {
  it("inngest.createFunction was called with retries:0 (Inngest auto-retry MUST NOT trigger on breach)", () => {
    const calls = createFunctionMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const cfg = calls[0][0] as { retries?: number };
    expect(cfg.retries).toBe(0);
  });
});
