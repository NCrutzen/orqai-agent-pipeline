// Phase 65 Plan 04 Task 1 — real assertions for the coordinator-complete RPC fan-in helper.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

import { inngest } from "@/lib/inngest/client";
import { notifyCoordinatorComplete } from "../coordinator-complete";

const mockSend = inngest.send as unknown as ReturnType<typeof vi.fn>;

function makeAdmin(rpcImpl: ReturnType<typeof vi.fn>) {
  return { rpc: rpcImpl } as unknown as Parameters<typeof notifyCoordinatorComplete>[0];
}

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ ids: ["evt"] });
});

describe("CORD-03 notifyCoordinatorComplete RPC fan-in helper", () => {
  it("invokes admin.rpc with correct args (p_run_id, p_failed=false default)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_handlers: 1, expected_handlers: 2, claim_synthesis: false }],
      error: null,
    });
    await notifyCoordinatorComplete(makeAdmin(rpc), "run-abc");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("coordinator_complete_handler", {
      p_run_id: "run-abc",
      p_failed: false,
    });
  });

  it("emits debtor-email/synthesis.requested when claim_synthesis=true", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_handlers: 2, expected_handlers: 2, claim_synthesis: true }],
      error: null,
    });
    const result = await notifyCoordinatorComplete(makeAdmin(rpc), "run-xyz");
    expect(result.claim_synthesis).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentPayload = mockSend.mock.calls[0][0] as { name: string; data: { run_id: string } };
    expect(sentPayload.name).toBe("debtor-email/synthesis.requested");
    expect(sentPayload.data.run_id).toBe("run-xyz");
  });

  it("does NOT emit synthesis when claim_synthesis=false", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_handlers: 1, expected_handlers: 3, claim_synthesis: false }],
      error: null,
    });
    const result = await notifyCoordinatorComplete(makeAdmin(rpc), "run-1");
    expect(result.claim_synthesis).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("forwards p_failed=true to the RPC argument", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_handlers: 1, expected_handlers: 2, claim_synthesis: false }],
      error: null,
    });
    await notifyCoordinatorComplete(makeAdmin(rpc), "run-fail", true);
    expect(rpc).toHaveBeenCalledWith("coordinator_complete_handler", {
      p_run_id: "run-fail",
      p_failed: true,
    });
  });

  it("throws an informative Error when RPC returns an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(notifyCoordinatorComplete(makeAdmin(rpc), "run-err")).rejects.toThrow(
      /coordinator_complete_handler RPC failed: boom/,
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns mapped {completed, expected, claim_synthesis} from RPC row", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ completed_handlers: 5, expected_handlers: 5, claim_synthesis: true }],
      error: null,
    });
    const result = await notifyCoordinatorComplete(makeAdmin(rpc), "run-map");
    expect(result).toEqual({ completed: 5, expected: 5, claim_synthesis: true });
  });
});
