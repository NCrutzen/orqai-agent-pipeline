import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock admin client
const mockSend = vi.fn().mockResolvedValue("ok");
const mockRemoveChannel = vi.fn();
const mockAdminChannel = vi.fn().mockReturnValue({ send: mockSend });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    channel: mockAdminChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

// Mock browser client
const mockSubscribe = vi.fn().mockReturnValue({ id: "test-channel" });
const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
const mockBrowserChannel = vi.fn().mockReturnValue({ on: mockOn });
const mockBrowserRemoveChannel = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockBrowserChannel,
    removeChannel: mockBrowserRemoveChannel,
  }),
}));

// Import after mocks are set up
import {
  broadcastStepUpdate,
  broadcastRunUpdate,
  type StepUpdatePayload,
  type RunUpdatePayload,
} from "../broadcast";
import { useBroadcast } from "../broadcast-client";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("broadcastStepUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends step-update event to run:{runId} channel", async () => {
    const payload: StepUpdatePayload = {
      stepName: "architect",
      status: "running",
      displayName: "Designing agent swarm architecture",
    };

    await broadcastStepUpdate("run-123", payload);

    expect(mockAdminChannel).toHaveBeenCalledWith("run:run-123");
    expect(mockSend).toHaveBeenCalledWith({
      type: "broadcast",
      event: "step-update",
      payload,
    });
  });

  it("includes stepName, status, and displayName in payload", async () => {
    const payload: StepUpdatePayload = {
      stepName: "spec-generator",
      status: "complete",
      displayName: "Generating agent specifications",
      durationMs: 5000,
      stepsCompleted: 4,
      runStatus: "running",
      log: "Completed in 5s",
    };

    await broadcastStepUpdate("run-456", payload);

    const sentPayload = mockSend.mock.calls[0][0].payload;
    expect(sentPayload.stepName).toBe("spec-generator");
    expect(sentPayload.status).toBe("complete");
    expect(sentPayload.displayName).toBe("Generating agent specifications");
    expect(sentPayload.durationMs).toBe(5000);
    expect(sentPayload.stepsCompleted).toBe(4);
    expect(sentPayload.runStatus).toBe("running");
    expect(sentPayload.log).toBe("Completed in 5s");
  });

  it("removes channel after sending", async () => {
    const payload: StepUpdatePayload = {
      stepName: "architect",
      status: "running",
      displayName: "Designing",
    };

    await broadcastStepUpdate("run-789", payload);

    expect(mockRemoveChannel).toHaveBeenCalledWith({ send: mockSend });
  });

  it("handles missing optional fields gracefully", async () => {
    const payload: StepUpdatePayload = {
      stepName: "architect",
      status: "running",
      displayName: "Designing",
      // durationMs, stepsCompleted, runStatus, log are all optional
    };

    await broadcastStepUpdate("run-minimal", payload);

    const sentPayload = mockSend.mock.calls[0][0].payload;
    expect(sentPayload.durationMs).toBeUndefined();
    expect(sentPayload.stepsCompleted).toBeUndefined();
    expect(sentPayload.runStatus).toBeUndefined();
    expect(sentPayload.log).toBeUndefined();
  });
});

describe("broadcastRunUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends run-update event to runs:live channel", async () => {
    const payload: RunUpdatePayload = {
      runId: "run-123",
      status: "running",
      stepsCompleted: 3,
    };

    await broadcastRunUpdate("run-123", payload);

    expect(mockAdminChannel).toHaveBeenCalledWith("runs:live");
    expect(mockSend).toHaveBeenCalledWith({
      type: "broadcast",
      event: "run-update",
      payload,
    });
  });

  it("includes runId and status in payload", async () => {
    const payload: RunUpdatePayload = {
      runId: "run-456",
      status: "complete",
      stepsCompleted: 7,
      agentCount: 5,
    };

    await broadcastRunUpdate("run-456", payload);

    const sentPayload = mockSend.mock.calls[0][0].payload;
    expect(sentPayload.runId).toBe("run-456");
    expect(sentPayload.status).toBe("complete");
    expect(sentPayload.stepsCompleted).toBe(7);
    expect(sentPayload.agentCount).toBe(5);
  });

  it("removes channel after sending", async () => {
    const payload: RunUpdatePayload = {
      runId: "run-789",
      status: "failed",
      stepsCompleted: 2,
    };

    await broadcastRunUpdate("run-789", payload);

    expect(mockRemoveChannel).toHaveBeenCalledWith({ send: mockSend });
  });
});

describe("useBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the on mock to return subscribe again
    mockOn.mockReturnValue({ subscribe: mockSubscribe });
  });

  afterEach(() => {
    cleanup();
  });

  it("subscribes to the specified channel and event", () => {
    const callback = vi.fn();

    renderHook(() => useBroadcast("run:test-123", "step-update", callback));

    expect(mockBrowserChannel).toHaveBeenCalledWith("run:test-123");
    expect(mockOn).toHaveBeenCalledWith(
      "broadcast",
      { event: "step-update" },
      expect.any(Function)
    );
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("calls onMessage callback when event is received", () => {
    const callback = vi.fn();

    renderHook(() => useBroadcast("run:test-123", "step-update", callback));

    // Get the callback passed to .on()
    const broadcastHandler = mockOn.mock.calls[0][2];
    const testPayload = { stepName: "architect", status: "running" };
    broadcastHandler({ payload: testPayload });

    expect(callback).toHaveBeenCalledWith(testPayload);
  });

  it("cleans up channel subscription on unmount", () => {
    const callback = vi.fn();

    const { unmount } = renderHook(() =>
      useBroadcast("run:test-123", "step-update", callback)
    );

    unmount();

    expect(mockBrowserRemoveChannel).toHaveBeenCalled();
  });

  it("does not re-subscribe when callback reference changes", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useBroadcast("run:test-123", "step-update", cb),
      { initialProps: { cb: callback1 } }
    );

    const initialSubscribeCount = mockSubscribe.mock.calls.length;

    // Rerender with new callback reference
    rerender({ cb: callback2 });

    // Subscribe count should not increase (useRef prevents re-subscribe)
    expect(mockSubscribe.mock.calls.length).toBe(initialSubscribeCount);

    // But the new callback should be used when event fires
    const broadcastHandler = mockOn.mock.calls[0][2];
    broadcastHandler({ payload: { test: true } });
    expect(callback2).toHaveBeenCalledWith({ test: true });
  });
});
