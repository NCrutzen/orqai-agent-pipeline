// Phase 3 Plan 03 Task 3 — Stage 0 legacy page is now a redirect to
// `/automations/[swarm]/review` (P3-D-10 + P3-D-12). The prior unified-shell
// render assertions are retired; the new contract is: this page MUST call
// next/navigation `redirect()` and MUST NOT import option-z-detail-pane.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Use vi.hoisted so the factory can reference a top-level binding that exists
// at hoist time. Plain top-level `const redirectMock = vi.fn(...)` is hoisted
// AFTER `vi.mock()` and triggers a TDZ ReferenceError.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import Stage0Page from "../page";

beforeEach(() => {
  redirectMock.mockClear();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Stage 0 legacy page → Bulk Review redirect (Plan 03 Task 3)", () => {
  it("redirects to /automations/{swarm}/review", async () => {
    await expect(
      Stage0Page({ params: Promise.resolve({ swarm: "debtor-email" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/automations/debtor-email/review");
    expect(redirectMock).toHaveBeenCalledWith(
      "/automations/debtor-email/review",
    );
  });

  it("source MUST NOT import option-z-detail-pane (anti-drift #4)", () => {
    const src = readFileSync(join(__dirname, "..", "page.tsx"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*option-z-detail-pane["']/);
    expect(src).not.toMatch(/OptionZDetailPane/);
  });

  it("source MUST NOT import Stage3Widget or Stage2OverrideWidget (P3-D-10 — operator routes scrubbed)", () => {
    const src = readFileSync(join(__dirname, "..", "page.tsx"), "utf8");
    expect(src).not.toMatch(/\bStage3Widget\b/);
    expect(src).not.toMatch(/Stage2OverrideWidget/);
  });
});
