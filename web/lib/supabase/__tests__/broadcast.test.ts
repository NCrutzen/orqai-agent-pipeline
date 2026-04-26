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
  broadcastChatMessage,
  createChatBroadcaster,
  type StepUpdatePayload,
  type RunUpdatePayload,
} from "../broadcast";
import { useBroadcast } from "../broadcast-client";

// ---------------------------------------------------------------------------
// Tests: Debounce behavior (Phase 59 D-03)
// ---------------------------------------------------------------------------

describe("broadcast debounce (Phase 59 D-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: coalesces rapid step updates for same (runId, stepName) — emit-the-latest", async () => {
    await broadcastStepUpdate("run1", { stepName: "x", status: "waiting", displayName: "" });
    await broadcastStepUpdate("run1", { stepName: "x", status: "running", displayName: "" });
    await broadcastStepUpdate("run1", { stepName: "x", status: "complete", displayName: "" });

    // Before window elapses, no send yet
    expect(mockSend).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].payload.status).toBe("complete");
    expect(mockSend.mock.calls[0][0].event).toBe("step-update");
  });

  it("Test 2: different stepNames within same run do not interfere", async () => {
    await broadcastStepUpdate("run1", { stepName: "x", status: "running", displayName: "" });
    await broadcastStepUpdate("run1", { stepName: "y", status: "running", displayName: "" });

    await vi.advanceTimersByTimeAsync(600);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const stepNames = mockSend.mock.calls.map((c) => c[0].payload.stepName).sort();
    expect(stepNames).toEqual(["x", "y"]);
  });

  it("Test 3: different runIds do not interfere", async () => {
    await broadcastStepUpdate("runA", { stepName: "x", status: "running", displayName: "" });
    await broadcastStepUpdate("runB", { stepName: "x", status: "running", displayName: "" });

    await vi.advanceTimersByTimeAsync(600);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const channels = mockAdminChannel.mock.calls.map((c) => c[0]).sort();
    expect(channels).toContain("run:runA");
    expect(channels).toContain("run:runB");
  });

  it("Test 4: broadcastChatMessage is NOT debounced (3 calls = 3 sends)", async () => {
    await broadcastChatMessage("run1", { id: "1", role: "user", content: "a" });
    await broadcastChatMessage("run1", { id: "2", role: "user", content: "b" });
    await broadcastChatMessage("run1", { id: "3", role: "user", content: "c" });

    // Chat is direct-send: should already have all 3 calls without advancing timers
    expect(mockSend).toHaveBeenCalledTimes(3);
    const events = mockSend.mock.calls.map((c) => c[0].event);
    expect(events).toEqual(["chat-message", "chat-message", "chat-message"]);
  });

  it("Test 5: createChatBroadcaster.send is NOT debounced (5 calls = 5 sends)", async () => {
    const broadcaster = createChatBroadcaster("run1");
    await broadcaster.send({ messageId: "m1", role: "assistant", token: "a", isStart: true });
    await broadcaster.send({ messageId: "m1", role: "assistant", token: "b" });
    await broadcaster.send({ messageId: "m1", role: "assistant", token: "c" });
    await broadcaster.send({ messageId: "m1", role: "assistant", token: "d" });
    await broadcaster.send({ messageId: "m1", role: "assistant", token: "e", isDone: true });
    broadcaster.close();

    expect(mockSend).toHaveBeenCalledTimes(5);
    const events = mockSend.mock.calls.map((c) => c[0].event);
    expect(events.every((e) => e === "chat-token")).toBe(true);
  });

  it("Test 6: broadcastRunUpdate coalesces rapid same-runId calls — emit-the-latest", async () => {
    await broadcastRunUpdate("run1", { runId: "run1", status: "running", stepsCompleted: 1 });
    await broadcastRunUpdate("run1", { runId: "run1", status: "running", stepsCompleted: 2 });
    await broadcastRunUpdate("run1", { runId: "run1", status: "complete", stepsCompleted: 3 });

    expect(mockSend).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].payload.status).toBe("complete");
    expect(mockSend.mock.calls[0][0].payload.stepsCompleted).toBe(3);
    expect(mockAdminChannel).toHaveBeenCalledWith("runs:live");
  });
});

// ---------------------------------------------------------------------------
// Tests: broadcastStepUpdate (existing surface, now via debounce)
// ---------------------------------------------------------------------------

describe("broadcastStepUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends step-update event to run:{runId} channel after debounce window", async () => {
    const payload: StepUpdatePayload = {
      stepName: "architect",
      status: "running",
      displayName: "Designing agent swarm architecture",
    };

    await broadcastStepUpdate("run-123", payload);
    await vi.advanceTimersByTimeAsync(600);

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
    await vi.advanceTimersByTimeAsync(600);

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
    await vi.advanceTimersByTimeAsync(600);

    expect(mockRemoveChannel).toHaveBeenCalledWith({ send: mockSend });
  });

  it("handles missing optional fields gracefully", async () => {
    const payload: StepUpdatePayload = {
      stepName: "architect",
      status: "running",
      displayName: "Designing",
    };

    await broadcastStepUpdate("run-minimal", payload);
    await vi.advanceTimersByTimeAsync(600);

    const sentPayload = mockSend.mock.calls[0][0].payload;
    expect(sentPayload.durationMs).toBeUndefined();
    expect(sentPayload.stepsCompleted).toBeUndefined();
    expect(sentPayload.runStatus).toBeUndefined();
    expect(sentPayload.log).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: broadcastRunUpdate (existing surface, now via debounce)
// ---------------------------------------------------------------------------

describe("broadcastRunUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends run-update event to runs:live channel after debounce window", async () => {
    const payload: RunUpdatePayload = {
      runId: "run-123",
      status: "running",
      stepsCompleted: 3,
    };

    await broadcastRunUpdate("run-123", payload);
    await vi.advanceTimersByTimeAsync(600);

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
    await vi.advanceTimersByTimeAsync(600);

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
    await vi.advanceTimersByTimeAsync(600);

    expect(mockRemoveChannel).toHaveBeenCalledWith({ send: mockSend });
  });
});

// ---------------------------------------------------------------------------
// Tests: useBroadcast hook (unchanged)
// ---------------------------------------------------------------------------

describe("useBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    rerender({ cb: callback2 });

    expect(mockSubscribe.mock.calls.length).toBe(initialSubscribeCount);

    const broadcastHandler = mockOn.mock.calls[0][2];
    broadcastHandler({ payload: { test: true } });
    expect(callback2).toHaveBeenCalledWith({ test: true });
  });
});
