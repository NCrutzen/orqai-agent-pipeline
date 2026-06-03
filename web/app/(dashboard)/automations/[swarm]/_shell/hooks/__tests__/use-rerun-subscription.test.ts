// Phase 3 Plan 02 Task 1 — useRerunSubscription tests.
//
// Covers behaviors 1-3 from the plan:
//   1. markInFlight adds an id; subscription handler removes it on matching
//      agent_runs INSERT.
//   2. Subscribes once on mount; resubscribes when the joined emailIds string
//      changes.
//   3. On unmount, removeChannel is called.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Capture the live subscription handler so tests can simulate INSERTs.
let lastHandler: ((p: { new: { email_id: string } }) => void) | null = null;
let onCalls = 0;
let subscribeCalls = 0;
let removeChannelCalls = 0;
let lastChannelName: string | null = null;
let lastFilter: string | null = null;

const channelFactory = vi.fn(() => {
  const channel = {
    on: vi.fn(
      (
        _event: string,
        opts: { filter?: string },
        handler: (p: { new: { email_id: string } }) => void,
      ) => {
        onCalls++;
        lastFilter = opts.filter ?? null;
        lastHandler = handler;
        return channel;
      },
    ),
    subscribe: vi.fn(() => {
      subscribeCalls++;
      return channel;
    }),
  };
  return channel;
});

const removeChannelMock = vi.fn(() => {
  removeChannelCalls++;
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (name: string) => {
      lastChannelName = name;
      return channelFactory();
    },
    removeChannel: removeChannelMock,
  }),
}));

import { useRerunSubscription } from "../use-rerun-subscription";

beforeEach(() => {
  lastHandler = null;
  onCalls = 0;
  subscribeCalls = 0;
  removeChannelCalls = 0;
  lastChannelName = null;
  lastFilter = null;
  channelFactory.mockClear();
  removeChannelMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useRerunSubscription", () => {
  it("Test 1: markInFlight adds an id; subscription handler removes it on matching INSERT", () => {
    const { result } = renderHook(() =>
      useRerunSubscription(["email-1", "email-2"]),
    );

    expect(result.current.inFlightIds.has("email-1")).toBe(false);

    act(() => {
      result.current.markInFlight("email-1");
    });
    expect(result.current.inFlightIds.has("email-1")).toBe(true);

    // Simulate the subscription handler firing for email-1.
    act(() => {
      lastHandler?.({ new: { email_id: "email-1" } });
    });
    expect(result.current.inFlightIds.has("email-1")).toBe(false);
  });

  it("Test 1b: handler is a no-op when email_id was never markInFlight'd", () => {
    const { result } = renderHook(() =>
      useRerunSubscription(["email-1"]),
    );
    act(() => {
      lastHandler?.({ new: { email_id: "email-1" } });
    });
    expect(result.current.inFlightIds.size).toBe(0);
  });

  it("Test 2: subscribes once on mount; resubscribes when emailIds join string changes", () => {
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useRerunSubscription(ids),
      { initialProps: { ids: ["a", "b"] } },
    );
    expect(subscribeCalls).toBe(1);
    expect(lastFilter).toBe("email_id=in.(a,b)");

    // Same set, same order — no new subscription.
    rerender({ ids: ["a", "b"] });
    expect(subscribeCalls).toBe(1);

    // Different set — re-subscribe.
    rerender({ ids: ["a", "b", "c"] });
    expect(subscribeCalls).toBe(2);
    expect(removeChannelCalls).toBe(1);
    expect(lastFilter).toBe("email_id=in.(a,b,c)");
  });

  it("Test 3: removeChannel called on unmount", () => {
    const { unmount } = renderHook(() =>
      useRerunSubscription(["e1"]),
    );
    expect(subscribeCalls).toBe(1);
    unmount();
    expect(removeChannelCalls).toBe(1);
  });

  it("does not subscribe when emailIds is empty (avoids invalid PostgREST filter)", () => {
    renderHook(() => useRerunSubscription([]));
    expect(subscribeCalls).toBe(0);
  });

  it("channel name includes a rerun-watch prefix", () => {
    renderHook(() => useRerunSubscription(["x"]));
    expect(lastChannelName).toMatch(/^rerun-watch:/);
  });
});
