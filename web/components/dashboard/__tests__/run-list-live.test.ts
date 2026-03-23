import { describe, it } from "vitest";

describe("RunListLive", () => {
  it.todo("renders RunCard for each initial run");
  it.todo("subscribes to runs:live Broadcast channel");
  it.todo("updates run status when run-update event is received");
  it.todo("updates steps_completed count from Broadcast payload");
  it.todo("passes showProject prop through to RunCard");
  it.todo("does not re-render unchanged runs");
});
