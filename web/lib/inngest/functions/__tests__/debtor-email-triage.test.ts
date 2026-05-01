/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: 65-03 rewrites debtor-email-triage.ts as the new coordinator function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock-step shell mirrored from stage-0-safety-worker.test.ts — real test bodies
// land in Plan 65-03. The vi.mock("@/lib/inngest/client" stub is required at
// import time once the worker module is in place; keeping it here locks the
// contract.

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
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

describe("CORD-02 + CORD-04 debtor-email-triage coordinator function", () => {
  it.todo(
    "single_shot path emits exactly one debtor-email/<intent>.requested with ranked[0].intent",
  );
  it.todo(
    "escalation path emits debtor-email/orchestrator.requested + writes coordinator_runs row with escalation_reason",
  );
});
