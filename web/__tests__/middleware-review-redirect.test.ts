// Phase 76 Plan 08 Task 1 — Backwards-compat redirect (D-05.6).
//
// Pure-function tests for resolveReviewRedirect. Covers the four cases
// captured in the plan's <behavior> section + non-/review passthrough +
// the open-redirect threat (T-76-08-01).

import { describe, it, expect } from "vitest";
import { resolveReviewRedirect } from "../middleware";

function sp(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("resolveReviewRedirect (D-05.6)", () => {
  it("redirects /automations/<swarm>/review (no query) to /stage-1", () => {
    expect(
      resolveReviewRedirect("/automations/debtor-email/review", sp("")),
    ).toBe("/automations/debtor-email/stage-1");
  });

  it("redirects ?tab=safety to /stage-0", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=safety"),
      ),
    ).toBe("/automations/debtor-email/stage-0");
  });

  it("redirects ?tab=pending to /stage-1?sub=pending", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=pending"),
      ),
    ).toBe("/automations/debtor-email/stage-1?sub=pending");
  });

  it("redirects unknown ?tab=<other> through to /stage-1 (default)", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=other"),
      ),
    ).toBe("/automations/debtor-email/stage-1");
  });

  it("tolerates trailing slash on /review", () => {
    expect(
      resolveReviewRedirect("/automations/debtor-email/review/", sp("")),
    ).toBe("/automations/debtor-email/stage-1");
  });

  it("preserves the swarm segment for cross-swarm reuse (sales-email)", () => {
    expect(
      resolveReviewRedirect("/automations/sales-email/review", sp("")),
    ).toBe("/automations/sales-email/stage-1");
  });

  it("returns null for non-/review URLs (passthrough)", () => {
    expect(
      resolveReviewRedirect("/automations/debtor-email/stage-3", sp("")),
    ).toBeNull();
    expect(resolveReviewRedirect("/login", sp(""))).toBeNull();
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review/extra",
        sp(""),
      ),
    ).toBeNull();
  });

  it("preserves non-tab query params across the redirect", () => {
    // Bookmarked /review URLs may carry topic / entity / mailbox / rule /
    // selected / before. Earlier revisions silently dropped these so the
    // operator landed on /stage-1 with no filter; this regression broke
    // QueueTree topic-filter clicks via the redirect hop.
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("topic=unknown&selected=abc-123"),
      ),
    ).toBe(
      "/automations/debtor-email/stage-1?topic=unknown&selected=abc-123",
    );
  });

  it("preserves non-tab params alongside tab=pending → sub=pending", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=pending&entity=staedion"),
      ),
    ).toBe(
      "/automations/debtor-email/stage-1?sub=pending&entity=staedion",
    );
  });

  it("preserves non-tab params alongside tab=safety", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=safety&topic=safety_review"),
      ),
    ).toBe("/automations/debtor-email/stage-0?topic=safety_review");
  });

  // Phase 81 Plan 04 — extend coverage for the `?sub=pending` round-trip.
  // The previous Stage 1 surface pushed `?sub=pending` via QueueTree clicks
  // while loadPageData read `?tab=pending`; the redirect bridges both shapes.
  // These 4 cases lock the contract so a future operator bookmark to
  // `/review?sub=pending` still lands on `/stage-1?sub=pending`.

  it("preserves ?sub=pending direct (Phase 81 — direct external bookmark to sub-view)", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("sub=pending"),
      ),
    ).toBe("/automations/debtor-email/stage-1?sub=pending");
  });

  it("preserves ?topic=payment alongside ?sub=pending (Phase 81 — multi-param round-trip)", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("topic=payment&sub=pending"),
      ),
    ).toBe(
      "/automations/debtor-email/stage-1?topic=payment&sub=pending",
    );
  });

  it("preserves ?selected=abc123 (Phase 81 — pre-existing selected-row param regression net)", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("selected=abc123"),
      ),
    ).toBe("/automations/debtor-email/stage-1?selected=abc123");
  });

  it("rewrites ?tab=pending → ?sub=pending alongside ?selected=abc123 (Phase 81 — legacy + new co-existing)", () => {
    expect(
      resolveReviewRedirect(
        "/automations/debtor-email/review",
        sp("tab=pending&selected=abc123"),
      ),
    ).toBe(
      "/automations/debtor-email/stage-1?sub=pending&selected=abc123",
    );
  });

  it("does not honor an attacker-controlled tab value (T-76-08-01)", () => {
    // Anything outside the closed enum {safety, pending} falls through to
    // /stage-1 — there's no path by which the operator-supplied tab value
    // lands in the redirect target as a host or path fragment.
    const result = resolveReviewRedirect(
      "/automations/debtor-email/review",
      sp("tab=https://evil.com"),
    );
    expect(result).toBe("/automations/debtor-email/stage-1");
    expect(result).not.toContain("evil.com");
  });
});
