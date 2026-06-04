/**
 * Phase 112.5 Plan 02 Task 3 — RED tests for the swarm-agnostic folder-map
 * registry-reader (outlook_folder_map → folder_id → bucket).
 *
 * The reader is registry-as-source-of-truth: no hardcoded folder-ids, mailbox
 * is a parameter (no sales-constanten). These tests pin:
 *   1. loadFolderMap filters on the given mailbox and returns Map<folder_id, bucket>
 *   2. getTrackedFolders only yields rows with tracked=true
 *   3. bucketForFolder resolves an unmapped folder-id to "other" (never undefined)
 */

import { describe, it, expect } from "vitest";
import { createSupabaseAdminMock } from "@/test-utils/supabase-mock";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadFolderMap,
  getTrackedFolders,
  bucketForFolder,
} from "../folder-map";

describe("loadFolderMap", () => {
  it("Test 1: reads outlook_folder_map for the given mailbox and returns a Map<folder_id, bucket>", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({
      data: [
        { folder_id: "F-inbox", bucket: "inbox", tracked: true, display_name: "Inbox" },
        { folder_id: "F-arch", bucket: "archive", tracked: true, display_name: "Archief" },
        { folder_id: "F-2024", bucket: "afgehandeld", tracked: false, display_name: "afgehandeld 2024" },
      ],
      error: null,
    });

    const map = await loadFolderMap(admin as unknown as SupabaseClient, "verkoop@smeba.nl");

    expect(map).toBeInstanceOf(Map);
    expect(map.get("F-inbox")).toBe("inbox");
    expect(map.get("F-arch")).toBe("archive");
    expect(map.get("F-2024")).toBe("afgehandeld");
    expect(map.size).toBe(3);

    // mailbox is een echte filter-parameter op de query.
    expect(admin.calls).toContainEqual({ method: "eq", args: ["mailbox", "verkoop@smeba.nl"] });
    expect(admin.calls).toContainEqual({ method: "from", args: ["outlook_folder_map"] });
  });

  it("returns an empty Map on Supabase error", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({ data: null, error: { message: "boom" } });

    const map = await loadFolderMap(admin as unknown as SupabaseClient, "x@y.nl");
    expect(map.size).toBe(0);
  });
});

describe("getTrackedFolders", () => {
  it("Test 2: only includes rows with tracked=true", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({
      data: [
        { folder_id: "F-inbox", bucket: "inbox", tracked: true, display_name: "Inbox" },
        { folder_id: "F-arch", bucket: "archive", tracked: true, display_name: "Archief" },
        { folder_id: "F-junk", bucket: "other", tracked: false, display_name: "Junk" },
      ],
      error: null,
    });

    const tracked = await getTrackedFolders(admin as unknown as SupabaseClient, "verkoop@smeba.nl");

    expect(tracked).toEqual([
      { folder_id: "F-inbox", bucket: "inbox" },
      { folder_id: "F-arch", bucket: "archive" },
    ]);
    expect(tracked.find((f) => f.folder_id === "F-junk")).toBeUndefined();
    expect(admin.calls).toContainEqual({ method: "eq", args: ["mailbox", "verkoop@smeba.nl"] });
  });
});

describe("bucketForFolder", () => {
  it("Test 3: resolves an unmapped folder-id to 'other', not undefined", () => {
    const map = new Map<string, string>([
      ["F-inbox", "inbox"],
      ["F-arch", "archive"],
    ]);

    expect(bucketForFolder(map, "F-inbox")).toBe("inbox");
    expect(bucketForFolder(map, "F-unknown")).toBe("other");
    expect(bucketForFolder(map, "F-unknown")).not.toBeUndefined();
  });
});
