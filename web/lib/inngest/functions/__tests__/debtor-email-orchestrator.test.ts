/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: 65-04 ships the orchestrator-planner Inngest function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("CORD-03 debtor-email-orchestrator function", () => {
  it.todo(
    "plan.handlers.length=N → exactly N inngest.send calls + UPDATE coordinator_runs SET expected_handlers=N",
  );
  it.todo("validates orchestrator-planner output against zod schema; rejects malformed plan");
});
