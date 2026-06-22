/**
 * Tests for clickup-cache-sync.ts — runCacheSync (the pure runner that mirrors
 * a ClickUp task into the read-cache tables).
 *
 * Branches covered:
 *  - taskDeleted event           → deleteCachedTicket, no fetch
 *  - fetchTaskForSync notFound    → deleteCachedTicket (removed_not_found)
 *  - fetchTaskForSync error       → throws (Inngest retries)
 *  - synced, NOT resolved         → upsert + comments + solutions cleared
 *  - synced, resolved             → solutions NOT cleared
 *
 * NB: runCacheSync no longer generates translations (lazy/read-through on the
 * pages instead), so there are no translation assertions here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the modules runCacheSync calls directly.
vi.mock("../clickup-read-client", () => ({
  fetchTaskForSync: vi.fn(),
  fetchCommentsForSync: vi.fn(),
}));
vi.mock("../ticket-cache", () => ({
  upsertCachedTicket: vi.fn(),
  replaceCachedComments: vi.fn(),
  deleteCachedTicket: vi.fn(),
  deleteCachedSolutions: vi.fn(),
}));

import { runCacheSync, type CacheSyncEvent } from "../clickup-cache-sync";
import * as readClient from "../clickup-read-client";
import * as cache from "../ticket-cache";
import type { SyncTaskRecord } from "../clickup-read-client";

const mocked = {
  fetchTaskForSync: vi.mocked(readClient.fetchTaskForSync),
  fetchCommentsForSync: vi.mocked(readClient.fetchCommentsForSync),
  upsertCachedTicket: vi.mocked(cache.upsertCachedTicket),
  replaceCachedComments: vi.mocked(cache.replaceCachedComments),
  deleteCachedTicket: vi.mocked(cache.deleteCachedTicket),
  deleteCachedSolutions: vi.mocked(cache.deleteCachedSolutions),
};

function makeRecord(overrides: Partial<SyncTaskRecord> = {}): SyncTaskRecord {
  return {
    external_task_id: "t1",
    email: "user@example.com",
    title: "Printer broken",
    raw_status: "new request",
    status_type: "open",
    ticket_group: "open",
    description: "It does not print",
    assignee: null,
    summary: "",
    date_created: "2026-06-17T00:00:00.000Z",
    date_updated: "2026-06-17T00:00:00.000Z",
    url: "https://app.clickup.com/t/t1",
    raw: {},
    ...overrides,
  };
}

function event(overrides: Partial<CacheSyncEvent> = {}): CacheSyncEvent {
  return {
    clickup_task_id: "t1",
    event_type: "taskUpdated",
    history_items: [],
    received_at: "2026-06-17T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults — individual tests override as needed.
  mocked.fetchCommentsForSync.mockResolvedValue([]);
});

describe("runCacheSync", () => {
  it("deletes the cached ticket on a taskDeleted event without fetching", async () => {
    const result = await runCacheSync(event({ event_type: "taskDeleted" }));

    expect(mocked.deleteCachedTicket).toHaveBeenCalledWith("t1");
    expect(mocked.fetchTaskForSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, decision: "deleted" });
  });

  it("removes the ticket when the task is no longer found", async () => {
    mocked.fetchTaskForSync.mockResolvedValue({ notFound: true });

    const result = await runCacheSync(event());

    expect(mocked.deleteCachedTicket).toHaveBeenCalledWith("t1");
    expect(mocked.upsertCachedTicket).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, decision: "removed_not_found" });
  });

  it("throws on a transient fetch error so Inngest retries", async () => {
    mocked.fetchTaskForSync.mockResolvedValue({ error: "ClickUp API error: 500" });

    await expect(runCacheSync(event())).rejects.toThrow(/cache-sync fetch failed/);
    expect(mocked.upsertCachedTicket).not.toHaveBeenCalled();
  });

  it("upserts ticket + comments and clears solutions when NOT resolved", async () => {
    mocked.fetchTaskForSync.mockResolvedValue({ record: makeRecord({ ticket_group: "open" }) });

    const result = await runCacheSync(event());

    expect(mocked.upsertCachedTicket).toHaveBeenCalledTimes(1);
    expect(mocked.replaceCachedComments).toHaveBeenCalledWith("t1", []);
    expect(mocked.deleteCachedSolutions).toHaveBeenCalledWith("t1");
    expect(result).toEqual({ ok: true, decision: "synced", group: "open" });
  });

  it("does NOT clear solutions when the ticket is resolved", async () => {
    mocked.fetchTaskForSync.mockResolvedValue({ record: makeRecord({ ticket_group: "resolved" }) });

    const result = await runCacheSync(event());

    expect(mocked.deleteCachedSolutions).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, decision: "synced", group: "resolved" });
  });

  it("does not translate during sync (translations are lazy/read-through)", async () => {
    mocked.fetchTaskForSync.mockResolvedValue({ record: makeRecord() });

    const result = await runCacheSync(event());

    expect(mocked.upsertCachedTicket).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe("synced");
  });
});
