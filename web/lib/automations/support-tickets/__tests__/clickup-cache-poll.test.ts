/**
 * Tests for clickup-cache-poll.ts — runCachePoll (incremental API refresh).
 *
 *  - watermark: uses max(date_updated) from cache minus the overlap buffer
 *  - empty cache: falls back to now − INITIAL_LOOKBACK
 *  - syncs each changed id via runCacheSync; counts synced/failed
 *  - per-task failure is counted, does not abort the batch
 *  - enumerate error → throws (Inngest retries)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../clickup-read-client", () => ({ fetchAllTaskIds: vi.fn() }));
vi.mock("../ticket-cache", () => ({ getMaxDateUpdated: vi.fn() }));
vi.mock("../clickup-cache-sync", () => ({ runCacheSync: vi.fn() }));

import { runCachePoll } from "../clickup-cache-poll";
import * as readClient from "../clickup-read-client";
import * as cache from "../ticket-cache";
import * as sync from "../clickup-cache-sync";

const m = {
  fetchAllTaskIds: vi.mocked(readClient.fetchAllTaskIds),
  getMaxDateUpdated: vi.mocked(cache.getMaxDateUpdated),
  runCacheSync: vi.mocked(sync.runCacheSync),
};

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-06-22T12:00:00.000Z").getTime();

beforeEach(() => {
  vi.clearAllMocks();
  m.fetchAllTaskIds.mockResolvedValue({ ids: [] });
  m.runCacheSync.mockResolvedValue({ ok: true, decision: "synced", group: "open" });
});

describe("runCachePoll", () => {
  it("uses max(date_updated) minus the overlap buffer as the watermark", async () => {
    const maxIso = "2026-06-22T11:00:00.000Z";
    m.getMaxDateUpdated.mockResolvedValue(maxIso);

    await runCachePoll(NOW);

    expect(m.fetchAllTaskIds).toHaveBeenCalledWith({
      updatedSince: new Date(maxIso).getTime() - HOUR,
    });
  });

  it("falls back to now − initial lookback when the cache is empty", async () => {
    m.getMaxDateUpdated.mockResolvedValue(null);

    await runCachePoll(NOW);

    expect(m.fetchAllTaskIds).toHaveBeenCalledWith({
      updatedSince: NOW - 24 * HOUR,
    });
  });

  it("re-syncs each changed task and counts them", async () => {
    m.getMaxDateUpdated.mockResolvedValue("2026-06-22T11:00:00.000Z");
    m.fetchAllTaskIds.mockResolvedValue({ ids: ["a", "b", "c"] });

    const res = await runCachePoll(NOW);

    expect(m.runCacheSync).toHaveBeenCalledTimes(3);
    expect(m.runCacheSync).toHaveBeenCalledWith(
      expect.objectContaining({ clickup_task_id: "a", event_type: "cache-poll" }),
    );
    expect(res).toMatchObject({ ok: true, changed: 3, synced: 3, failed: 0 });
  });

  it("counts a per-task failure without aborting the batch", async () => {
    m.getMaxDateUpdated.mockResolvedValue("2026-06-22T11:00:00.000Z");
    m.fetchAllTaskIds.mockResolvedValue({ ids: ["a", "b"] });
    m.runCacheSync.mockRejectedValueOnce(new Error("boom")); // first fails

    const res = await runCachePoll(NOW);

    expect(m.runCacheSync).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ changed: 2, synced: 1, failed: 1 });
  });

  it("throws when enumeration fails so Inngest retries", async () => {
    m.getMaxDateUpdated.mockResolvedValue(null);
    m.fetchAllTaskIds.mockResolvedValue({ error: "ClickUp API error: 500" });

    await expect(runCachePoll(NOW)).rejects.toThrow(/cache-poll enumerate failed/);
    expect(m.runCacheSync).not.toHaveBeenCalled();
  });
});
