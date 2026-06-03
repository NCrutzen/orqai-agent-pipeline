// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-03 Task 1.
// Cross-surface URL helper tests. P1-D-05: Bulk Review ↔ Kanban share
// email_labels.id losslessly. CON-bulk-review-vs-kanban-split.

import { describe, it, expect } from "vitest";
import {
  bulkReviewUrlFor,
  kanbanUrlFor,
  parseEmailLabelIdFromUrl,
  type SurfaceLocator,
} from "@/lib/bulk-review/routes";

// Deterministic UUID generator — no node:crypto required. Format-valid v4.
// Uses xorshift32 to fill a 32-hex-char buffer, then slices into 8-4-4-4-12.
function uuid(seed: number): string {
  let state = (seed * 0x9e3779b1 + 0x12345678) >>> 0;
  const hexChars: string[] = [];
  for (let i = 0; i < 32; i++) {
    // xorshift32 step → take lowest nibble.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    hexChars.push((state & 0xf).toString(16));
  }
  // Force version=4 and variant=8 (RFC 4122).
  hexChars[12] = "4";
  hexChars[16] = "8";
  const h = hexChars.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

describe("Test 1: bulkReviewUrlFor", () => {
  it("returns a URL starting with /automations/<swarm_type> with email_label_id as query param", () => {
    const loc: SurfaceLocator = {
      email_label_id: uuid(1),
      swarm_type: "debtor-email",
    };
    const url = bulkReviewUrlFor(loc);
    expect(url.startsWith("/automations/debtor-email")).toBe(true);
    expect(url).toContain(loc.email_label_id);
    expect(url).toContain("bulk_review_focus=");
    // NOT a path segment.
    expect(url).not.toContain(`/${loc.email_label_id}`);
  });
});

describe("Test 2: kanbanUrlFor", () => {
  it("returns a URL with email_label_id under the kanban_focus query param", () => {
    const loc: SurfaceLocator = {
      email_label_id: uuid(2),
      swarm_type: "sales-email",
    };
    const url = kanbanUrlFor(loc);
    expect(url.startsWith("/automations/sales-email")).toBe(true);
    expect(url).toContain("kanban_focus=");
    expect(url).toContain(loc.email_label_id);
    // Distinct from bulk_review_focus so the shell can dispatch.
    expect(url).not.toContain("bulk_review_focus");
  });
});

describe("Test 3: parseEmailLabelIdFromUrl — 50-iteration round-trip property test", () => {
  const swarms = ["debtor-email", "sales-email", "agent-namer"];
  const fixtures: SurfaceLocator[] = [];
  for (let i = 0; i < 50; i++) {
    fixtures.push({
      email_label_id: uuid(i + 100),
      swarm_type: swarms[i % swarms.length],
    });
  }

  it("round-trips every fixture for bulk-review surface", () => {
    for (const loc of fixtures) {
      const url = bulkReviewUrlFor(loc);
      const parsed = parseEmailLabelIdFromUrl(url);
      expect(parsed, `bulk-review parse failed for ${url}`).not.toBeNull();
      expect(parsed!.email_label_id).toBe(loc.email_label_id);
      expect(parsed!.swarm_type).toBe(loc.swarm_type);
      expect(parsed!.surface).toBe("bulk-review");
    }
  });

  it("round-trips every fixture for kanban surface", () => {
    for (const loc of fixtures) {
      const url = kanbanUrlFor(loc);
      const parsed = parseEmailLabelIdFromUrl(url);
      expect(parsed, `kanban parse failed for ${url}`).not.toBeNull();
      expect(parsed!.email_label_id).toBe(loc.email_label_id);
      expect(parsed!.swarm_type).toBe(loc.swarm_type);
      expect(parsed!.surface).toBe("kanban");
    }
  });

  it("also parses absolute URLs (host + protocol prefix)", () => {
    const loc = fixtures[0];
    const url = `https://app.example.com${bulkReviewUrlFor(loc)}`;
    const parsed = parseEmailLabelIdFromUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed!.email_label_id).toBe(loc.email_label_id);
  });

  it("returns null for unrelated URLs / missing query / invalid UUID", () => {
    expect(parseEmailLabelIdFromUrl("/some/other/path")).toBeNull();
    expect(parseEmailLabelIdFromUrl("/automations/debtor-email")).toBeNull();
    expect(
      parseEmailLabelIdFromUrl(
        "/automations/debtor-email?bulk_review_focus=not-a-uuid",
      ),
    ).toBeNull();
  });
});

describe("Test 4: invalid swarm_type throws with message containing 'swarm_type'", () => {
  const valid = uuid(999);

  it("rejects empty swarm_type", () => {
    expect(() =>
      bulkReviewUrlFor({ email_label_id: valid, swarm_type: "" }),
    ).toThrow(/swarm_type/);
    expect(() =>
      kanbanUrlFor({ email_label_id: valid, swarm_type: "" }),
    ).toThrow(/swarm_type/);
  });

  it("rejects swarm_type containing a slash", () => {
    expect(() =>
      bulkReviewUrlFor({ email_label_id: valid, swarm_type: "foo/bar" }),
    ).toThrow(/swarm_type/);
    expect(() =>
      kanbanUrlFor({ email_label_id: valid, swarm_type: "foo/bar" }),
    ).toThrow(/swarm_type/);
  });

  it("rejects swarm_type with leading dash or uppercase", () => {
    expect(() =>
      bulkReviewUrlFor({ email_label_id: valid, swarm_type: "-debtor" }),
    ).toThrow(/swarm_type/);
    expect(() =>
      bulkReviewUrlFor({ email_label_id: valid, swarm_type: "Debtor" }),
    ).toThrow(/swarm_type/);
  });
});

describe("Test 5: invalid email_label_id (non-UUID) throws", () => {
  it("rejects non-UUID email_label_id", () => {
    expect(() =>
      bulkReviewUrlFor({
        email_label_id: "not-a-uuid",
        swarm_type: "debtor-email",
      }),
    ).toThrow(/email_label_id/);
    expect(() =>
      kanbanUrlFor({
        email_label_id: "12345",
        swarm_type: "debtor-email",
      }),
    ).toThrow(/email_label_id/);
  });

  it("rejects empty email_label_id", () => {
    expect(() =>
      bulkReviewUrlFor({ email_label_id: "", swarm_type: "debtor-email" }),
    ).toThrow(/email_label_id/);
  });

  it("rejects UUID-shaped string with wrong character", () => {
    // 'z' is not hex.
    expect(() =>
      bulkReviewUrlFor({
        email_label_id: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
        swarm_type: "debtor-email",
      }),
    ).toThrow(/email_label_id/);
  });
});
