/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: 65-04 ships the synthesis Inngest function.
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

describe("CORD-03 debtor-email-synthesis function", () => {
  it.todo("loads HandlerOutput[] from agent_runs.tool_outputs via output-adapter");
  it.todo("partial_synthesis=true when failed_handlers > 0 (D-05)");
  it.todo("emits emitAutomationRunStale('debtor-email-review')");
});
