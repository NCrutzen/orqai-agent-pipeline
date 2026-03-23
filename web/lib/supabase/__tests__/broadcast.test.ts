import { describe, it } from "vitest";

describe("broadcastStepUpdate", () => {
  it.todo("sends step-update event to run:{runId} channel");
  it.todo("includes stepName, status, and displayName in payload");
  it.todo("removes channel after sending");
  it.todo("handles missing optional fields gracefully");
});

describe("broadcastRunUpdate", () => {
  it.todo("sends run-update event to runs:live channel");
  it.todo("includes runId and status in payload");
  it.todo("removes channel after sending");
});

describe("useBroadcast", () => {
  it.todo("subscribes to the specified channel and event");
  it.todo("calls onMessage callback when event is received");
  it.todo("cleans up channel subscription on unmount");
  it.todo("does not re-subscribe when callback reference changes");
});
