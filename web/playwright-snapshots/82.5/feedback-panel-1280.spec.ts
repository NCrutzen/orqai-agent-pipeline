import { test, expect } from "@playwright/test";

/**
 * Phase 82.5 R8 — feedback panel renders without horizontal overflow at
 * 1280×800. Both Save and Confirm buttons remain visible (the subtitle row
 * may collapse via the @media (max-width: 1365px) rule, but the icons +
 * primary label persist — see Plan 03 Task 2 step 10).
 *
 * Run locally:
 *   PHASE_82_5_SMOKE_URL=https://<preview-or-dev-url>/automations/debtor-email/stage-1?selected=<email-uuid-with-feedback> \
 *   npm run test:e2e -- playwright-snapshots/82.5/feedback-panel-1280.spec.ts
 *
 * The spec is `test.skip`ped when PHASE_82_5_SMOKE_URL is unset so CI
 * remains green without external infrastructure.
 */
test.describe("82.5 feedback panel — 1280×800 viewport (R8)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("save + confirm visible, no horizontal overflow", async ({ page }) => {
    const url = process.env.PHASE_82_5_SMOKE_URL;
    test.skip(
      !url,
      "Set PHASE_82_5_SMOKE_URL to a Stage 1 row with feedback to run this snapshot.",
    );
    await page.goto(url!);

    // Wait for the StageFeedbackPanel buttons to mount.
    await page
      .locator('[data-testid="stage-feedback-save"]')
      .waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator('[data-testid="stage-feedback-save"]')).toBeVisible();
    await expect(page.locator('[data-testid="stage-feedback-confirm"]')).toBeVisible();

    // Detail pane container — use a stable selector. If detail-pane-root
    // doesn't exist as a testid, fall back to the right-column grid track.
    const overflow = await page.evaluate(() => {
      const candidates: HTMLElement[] = [];
      const byTestId = document.querySelector(
        '[data-testid="detail-pane-root"]',
      ) as HTMLElement | null;
      if (byTestId) candidates.push(byTestId);
      // Fallback: the right column of the page-level grid (460px column).
      const grid = document.querySelector(
        'div[style*="minmax(0, 1fr) 460px"]',
      ) as HTMLElement | null;
      if (grid?.lastElementChild instanceof HTMLElement) {
        candidates.push(grid.lastElementChild);
      }
      return candidates.map((el) => el.scrollWidth - el.clientWidth);
    });

    for (const delta of overflow) {
      expect(delta).toBeLessThanOrEqual(0);
    }

    await page.screenshot({
      path: "playwright-snapshots/82.5/feedback-panel-1280.png",
      fullPage: false,
    });
  });
});
