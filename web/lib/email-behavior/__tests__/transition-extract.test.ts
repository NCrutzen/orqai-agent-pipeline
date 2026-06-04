/**
 * Phase 112.5 Plan 03 Task 1 — RED tests voor de swarm-agnostische pure
 * transition-extractor (SC-1).
 *
 * Mapt ruwe Graph delta-events -> Transition[] met cross-folder move-correlatie
 * op immutable id (RESEARCH Pattern 2) en split-over-ticks fallback via
 * lastKnownBucket (Pitfall 3). Geen IO, geen clock, geen randomness, geen
 * sales-constanten: alle context (bucketOf / lastKnownBucket / prevCategories /
 * prevIsRead / conversationToEmailId / observed_at) komt als parameter binnen.
 */

import { describe, it, expect } from "vitest";
import {
  extractTransitions,
  type RawDeltaEvent,
  type Transition,
  type ExtractInput,
} from "../transition-extract";

// Folder-id -> bucket testmap. De helper kent geen folder-namen; de worker geeft
// een bucketOf-functie mee (in productie: bucketForFolder op de registry-map).
const BUCKET: Record<string, string> = {
  "F-inbox": "inbox",
  "F-afg": "afgehandeld",
  "F-arch": "archive",
  "F-sent": "sent",
};
const bucketOf = (folderId: string): string => BUCKET[folderId] ?? "other";

const OBSERVED = "2026-06-04T10:00:00.000Z";

function baseInput(events: RawDeltaEvent[], overrides: Partial<ExtractInput> = {}): ExtractInput {
  return {
    events,
    bucketOf,
    lastKnownBucket: new Map(),
    observed_at: OBSERVED,
    ...overrides,
  };
}

describe("extractTransitions — cross-folder move correlatie (within-tick)", () => {
  it("Test 1: @removed:deleted in inbox + verschijning in afgehandeld -> moved_to_afgehandeld", () => {
    const events: RawDeltaEvent[] = [
      { id: "m1", _folderId: "F-inbox", "@removed": { reason: "deleted" } },
      { id: "m1", _folderId: "F-afg", parentFolderId: "F-afg" },
    ];
    const out = extractTransitions(baseInput(events));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject<Partial<Transition>>({
      immutable_id: "m1",
      kind: "moved_to_afgehandeld",
      from_bucket: "inbox",
      to_bucket: "afgehandeld",
      observed_at: OBSERVED,
    });
  });

  it("Test 2: @removed in inbox + verschijning in archive -> self_archived", () => {
    const events: RawDeltaEvent[] = [
      { id: "m2", _folderId: "F-inbox", "@removed": { reason: "deleted" } },
      { id: "m2", _folderId: "F-arch", parentFolderId: "F-arch" },
    ];
    const out = extractTransitions(baseInput(events));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "self_archived",
      from_bucket: "inbox",
      to_bucket: "archive",
    });
  });

  it("Test 3: @removed in archive + verschijning in inbox -> restored_from_archive", () => {
    const events: RawDeltaEvent[] = [
      { id: "m3", _folderId: "F-arch", "@removed": { reason: "deleted" } },
      { id: "m3", _folderId: "F-inbox", parentFolderId: "F-inbox" },
    ];
    const out = extractTransitions(baseInput(events));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "restored_from_archive",
      from_bucket: "archive",
      to_bucket: "inbox",
    });
  });
});

describe("extractTransitions — in-place updates", () => {
  it("Test 4: updated-event met gewijzigde categories -> category_edited", () => {
    const events: RawDeltaEvent[] = [
      { id: "m4", _folderId: "F-inbox", parentFolderId: "F-inbox", categories: ["Klacht"] },
    ];
    const out = extractTransitions(
      baseInput(events, { prevCategories: new Map([["m4", ["Offerte"]]]) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "category_edited",
      immutable_id: "m4",
    });
    expect(out[0].categories).toEqual(["Klacht"]);
  });

  it("Test 5: isRead flip false->true zonder move -> read_aged", () => {
    const events: RawDeltaEvent[] = [
      { id: "m5", _folderId: "F-inbox", parentFolderId: "F-inbox", isRead: true },
    ];
    const out = extractTransitions(
      baseInput(events, { prevIsRead: new Map([["m5", false]]) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("read_aged");
  });
});

describe("extractTransitions — split-over-ticks (Pitfall 3)", () => {
  it("Test 6: alleen verschijning in afgehandeld + lastKnownBucket=inbox -> moved_to_afgehandeld", () => {
    const events: RawDeltaEvent[] = [
      { id: "m6", _folderId: "F-afg", parentFolderId: "F-afg" },
    ];
    const out = extractTransitions(
      baseInput(events, { lastKnownBucket: new Map([["m6", "inbox"]]) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "moved_to_afgehandeld",
      from_bucket: "inbox",
      to_bucket: "afgehandeld",
    });
  });

  it("verschijning in dezelfde bucket als lastKnownBucket -> geen move-transitie", () => {
    const events: RawDeltaEvent[] = [
      { id: "m6b", _folderId: "F-inbox", parentFolderId: "F-inbox" },
    ];
    const out = extractTransitions(
      baseInput(events, { lastKnownBucket: new Map([["m6b", "inbox"]]) }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("extractTransitions — puur (deterministisch)", () => {
  it("Test 7: zelfde input geeft zelfde output", () => {
    const events: RawDeltaEvent[] = [
      { id: "m7", _folderId: "F-inbox", "@removed": { reason: "deleted" } },
      { id: "m7", _folderId: "F-afg", parentFolderId: "F-afg" },
    ];
    const a = extractTransitions(baseInput(events));
    const b = extractTransitions(baseInput(events));
    expect(a).toEqual(b);
    expect(a[0].observed_at).toBe(OBSERVED);
  });
});

describe("extractTransitions — replied via conversationId (Plan-checker warning 2)", () => {
  it("Test 8a: sent-bucket created-event met conversationId-match -> replied gekoppeld aan inbound email", () => {
    const events: RawDeltaEvent[] = [
      { id: "s1", _folderId: "F-sent", parentFolderId: "F-sent", conversationId: "C-99" },
    ];
    const out = extractTransitions(
      baseInput(events, {
        conversationToEmailId: new Map([["C-99", "inbound-email-42"]]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "replied",
      to_bucket: "sent",
    });
    // gekoppeld aan de gematchte inbound email, niet aan het sent-bericht
    expect(out[0].matched_email_id).toBe("inbound-email-42");
  });

  it("Test 8b: sent-created zonder conversationId-match -> geen transitie", () => {
    const events: RawDeltaEvent[] = [
      { id: "s2", _folderId: "F-sent", parentFolderId: "F-sent", conversationId: "C-unknown" },
    ];
    const out = extractTransitions(
      baseInput(events, {
        conversationToEmailId: new Map([["C-99", "inbound-email-42"]]),
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("extractTransitions — left_to_untracked vangnet (gap-fix 2026-06-04)", () => {
  it("Test 9a: @removed uit inbox zonder verschijning elders -> left_to_untracked", () => {
    // De Sugar-sweep / verse-jaarmap blinde vlek: mail verdwijnt uit een
    // getrackte bucket en duikt nergens getrackt op.
    const events: RawDeltaEvent[] = [
      { id: "m9", _folderId: "F-inbox", "@removed": { reason: "deleted" } },
    ];
    const out = extractTransitions(baseInput(events));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      immutable_id: "m9",
      kind: "left_to_untracked",
      from_bucket: "inbox",
      to_bucket: null,
    });
  });

  it("Test 9b: @removed uit een 'other'-bucket -> geen transitie", () => {
    const events: RawDeltaEvent[] = [
      { id: "m10", _folderId: "F-unknown", "@removed": { reason: "deleted" } },
    ];
    expect(extractTransitions(baseInput(events))).toHaveLength(0);
  });

  it("Test 9c: @removed mét verschijning in een getrackte folder -> géén left_to_untracked (gewone move wint)", () => {
    const events: RawDeltaEvent[] = [
      { id: "m11", _folderId: "F-inbox", "@removed": { reason: "deleted" } },
      { id: "m11", _folderId: "F-afg", parentFolderId: "F-afg" },
    ];
    const out = extractTransitions(baseInput(events));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("moved_to_afgehandeld");
  });
});
