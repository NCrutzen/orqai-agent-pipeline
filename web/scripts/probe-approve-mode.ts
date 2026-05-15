/**
 * Verify Phase 82.5 dirty-init fix (commit 7112c78):
 *   - On row open, footer should default to "✓ Approve verdicts that ran"
 *   - Clicking "override stage" inline link should morph to "Submit override"
 *   - Clicking Approve should POST /api/automations/debtor-email/feedback
 *     with verdict=confirm per ok stage
 */
import { chromium } from "playwright-core";

async function main() {
  const token = process.env.BROWSERLESS_API_TOKEN!;
  const email = process.env.UAT_EMAIL!;
  const password = process.env.UAT_PASSWORD!;
  const baseUrl = process.env.UAT_BASE_URL!;

  const wss = `wss://production-ams.browserless.io?token=${token}&timeout=300000`;
  const browser = await chromium.connectOverCDP(wss, { timeout: 30_000 });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await page.goto(`${baseUrl}/login?next=${encodeURIComponent("/automations/debtor-email/stage-1")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  await page.locator('ul li[role="button"]').first().click();
  await page.waitForTimeout(1500);

  const primary = page.locator('footer[data-testid="action-footer"] button').first();
  const labelOnOpen = (await primary.textContent())?.trim() ?? "(none)";
  console.log(`Footer label on row open: "${labelOnOpen}"`);
  await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe3-row-open.png", fullPage: true });

  // Verify approve-mode rendering: should NOT include "Submit override".
  const isApproveMode = labelOnOpen.toLowerCase().includes("approve");
  const isOverrideMode = labelOnOpen.toLowerCase().includes("submit override");
  console.log(`Approve mode: ${isApproveMode} / Override mode: ${isOverrideMode}`);

  // Click the inline "override stage" link on Stage 1 (or any visible one).
  const overrideLinks = page.locator('button:has-text("override stage")');
  const overrideCount = await overrideLinks.count();
  console.log(`Inline "override stage" links found: ${overrideCount}`);
  if (overrideCount > 0) {
    await overrideLinks.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    const labelAfter = (await primary.textContent())?.trim() ?? "(none)";
    console.log(`Footer label after override-stage click: "${labelAfter}"`);
    await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe3-override-clicked.png", fullPage: true });
  }

  // Capture network on approve-mode click. First, re-select the row to reset state.
  await page.locator('ul li[role="button"]').nth(1).click();
  await page.waitForTimeout(1200);
  const labelOnRow2 = (await primary.textContent())?.trim() ?? "(none)";
  console.log(`Row 2 footer label: "${labelOnRow2}"`);

  const reqs: Array<{ url: string; method: string; body: string | null }> = [];
  const ress: Array<{ url: string; status: number; body: string }> = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) reqs.push({ url: r.url(), method: r.method(), body: r.postData() });
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/")) {
      let body = "(unread)";
      try { body = (await r.text()).slice(0, 300); } catch {}
      ress.push({ url: r.url(), status: r.status(), body });
    }
  });

  if (labelOnRow2.toLowerCase().includes("approve")) {
    await primary.click({ force: true });
    await page.waitForTimeout(4000);
    console.log(`\n=== APPROVE CLICK NETWORK (${reqs.length} req / ${ress.length} res) ===`);
    for (const r of reqs) {
      console.log(`  → ${r.method} ${r.url}`);
      if (r.body) console.log(`     body: ${r.body.slice(0, 250)}`);
    }
    for (const r of ress) {
      console.log(`  ← ${r.status} ${r.url} :: ${r.body.slice(0, 150)}`);
    }
  } else {
    console.log(`Cannot test approve flow — label not in approve mode: "${labelOnRow2}"`);
  }

  await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe3-after-approve.png", fullPage: true });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
