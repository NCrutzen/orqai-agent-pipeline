/**
 * Phase 112.5 Plan 01 Task 1 — Wave-0 RED tests for the swarm-agnostic
 * folder-convention aggregation helper (SC-3).
 *
 * The helper answers "how consistently does a team use afgehandeld-{jaar}
 * folders vs. Archive?" over a pre-bucketed corpus. These tests pin:
 *   1. per-bucket counts over {inbox, archive, afgehandeld-2024, afgehandeld-2025}
 *   2. afgehandeld-vs-archive ratio + division-by-zero → null (never NaN)
 *   3. unknown/unmapped folder ids fall into 'other' and are excluded from the ratio
 *   4. purity: same input → same output (no clock/randomness)
 *
 * The folder-id → bucket MAPPING is NOT the aggregator's job (the worker hands
 * in already-bucketed rows), but the pure year-collapse mapper
 * bucketForFolderName lives here too and is tested below.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateFolderConvention,
  bucketForFolderName,
} from "../folder-convention-report";

describe("aggregateFolderConvention", () => {
  it("Test 1: returns per-bucket counts over the corpus", () => {
    const report = aggregateFolderConvention([
      { email_id: "a", bucket: "inbox" },
      { email_id: "b", bucket: "inbox" },
      { email_id: "c", bucket: "archive" },
      { email_id: "d", bucket: "afgehandeld" },
      { email_id: "e", bucket: "afgehandeld" },
      { email_id: "f", bucket: "afgehandeld" },
    ]);
    expect(report.per_bucket).toEqual({
      inbox: 2,
      archive: 1,
      afgehandeld: 3,
    });
    expect(report.afgehandeld_total).toBe(3);
    expect(report.archive_total).toBe(1);
    expect(report.total_classified).toBe(6);
  });

  it("Test 2: computes afgehandeld-vs-archive ratio; div-by-zero → null", () => {
    const withBoth = aggregateFolderConvention([
      { email_id: "a", bucket: "afgehandeld" },
      { email_id: "b", bucket: "afgehandeld" },
      { email_id: "c", bucket: "afgehandeld" },
      { email_id: "d", bucket: "archive" },
    ]);
    // 3 / (3 + 1) = 0.75
    expect(withBoth.afgehandeld_vs_archive_ratio).toBe(0.75);

    const neither = aggregateFolderConvention([
      { email_id: "a", bucket: "inbox" },
      { email_id: "b", bucket: "sent" },
    ]);
    expect(neither.afgehandeld_vs_archive_ratio).toBeNull();
    expect(Number.isNaN(neither.afgehandeld_vs_archive_ratio as number)).toBe(
      false,
    );
  });

  it("Test 3: unknown/unmapped buckets fall into 'other', excluded from ratio", () => {
    const report = aggregateFolderConvention([
      { email_id: "a", bucket: "afgehandeld" },
      { email_id: "b", bucket: "archive" },
      { email_id: "c", bucket: "other" },
      { email_id: "d", bucket: "junk-unmapped" }, // unknown → coerced to other
    ]);
    expect(report.other_count).toBe(2);
    // ratio only sees afgehandeld (1) + archive (1) = 0.5; 'other' excluded
    expect(report.afgehandeld_vs_archive_ratio).toBe(0.5);
    expect(report.per_bucket.other).toBe(2);
  });

  it("Test 4: pure — same input yields identical output", () => {
    const rows = [
      { email_id: "a", bucket: "afgehandeld" },
      { email_id: "b", bucket: "archive" },
      { email_id: "c", bucket: "inbox" },
    ];
    const first = aggregateFolderConvention(rows);
    const second = aggregateFolderConvention(rows);
    expect(first).toEqual(second);
    // and key order / shape is stable
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("Test 1b: empty corpus → all zero, ratio null", () => {
    const report = aggregateFolderConvention([]);
    expect(report.total_classified).toBe(0);
    expect(report.afgehandeld_total).toBe(0);
    expect(report.archive_total).toBe(0);
    expect(report.other_count).toBe(0);
    expect(report.afgehandeld_vs_archive_ratio).toBeNull();
    expect(report.per_bucket).toEqual({});
  });
});

describe("bucketForFolderName", () => {
  it("collapses every afgehandeld-{jaar} folder to 'afgehandeld'", () => {
    expect(bucketForFolderName("afgehandeld 2024")).toBe("afgehandeld");
    expect(bucketForFolderName("afgehandeld 2025")).toBe("afgehandeld");
    expect(bucketForFolderName("Afgehandeld 2023")).toBe("afgehandeld");
    expect(bucketForFolderName("afgehandeld")).toBe("afgehandeld");
  });

  it("maps well-known folders to semantic buckets", () => {
    expect(bucketForFolderName("Inbox")).toBe("inbox");
    expect(bucketForFolderName("Postvak IN")).toBe("inbox");
    expect(bucketForFolderName("Archive")).toBe("archive");
    expect(bucketForFolderName("Archief")).toBe("archive");
    expect(bucketForFolderName("Sent Items")).toBe("sent");
    expect(bucketForFolderName("Verzonden items")).toBe("sent");
  });

  it("maps unknown display names to 'other'", () => {
    expect(bucketForFolderName("Some Custom Project Folder")).toBe("other");
    expect(bucketForFolderName("")).toBe("other");
  });
});
