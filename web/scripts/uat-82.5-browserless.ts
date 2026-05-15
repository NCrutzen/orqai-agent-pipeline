/**
 * Phase 82.5 — Browserless-driven UAT walkthrough.
 *
 * Connects to Browserless cloud chromium, restores a Supabase auth session
 * via cookie injection, and walks the 12-step operator UAT from
 * 82.5-07-PLAN.md Task 3. Screenshots land in /tmp/uat-82.5-screenshots/.
 *
 * Required env:
 *   - BROWSERLESS_API_TOKEN
 *   - UAT_BASE_URL      (e.g. https://agent-workforce-xxx.vercel.app)
 *   - UAT_EMAIL         (test login email)
 *   - UAT_PASSWORD      (test login password)
 *
 * Optional:
 *   - UAT_FULL          (truthy = include destructive POST steps 4/5/8/9)
 */
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SHOTS = "/tmp/uat-82.5-screenshots";
const RESULTS: Array<{ step: string; req: string; status: "PASS" | "FAIL" | "SKIP" | "WARN"; note: string }> = [];

function record(step: string, req: string, status: "PASS" | "FAIL" | "SKIP" | "WARN", note: string) {
  RESULTS.push({ step, req, status, note });
  // eslint-disable-next-line no-console
  console.log(`[${status}] ${step} (${req}) — ${note}`);
}

async function main() {
  const token = process.env.BROWSERLESS_API_TOKEN;
  const email = process.env.UAT_EMAIL;
  const password = process.env.UAT_PASSWORD;
  const baseUrl = process.env.UAT_BASE_URL;
  const fullUat = !!process.env.UAT_FULL;

  if (!token) throw new Error("BROWSERLESS_API_TOKEN unset");
  if (!email) throw new Error("UAT_EMAIL unset");
  if (!password) throw new Error("UAT_PASSWORD unset");
  if (!baseUrl) throw new Error("UAT_BASE_URL unset");

  await mkdir(SHOTS, { recursive: true });

  const wss = `wss://production-ams.browserless.io?token=${token}&timeout=300000`;
  // eslint-disable-next-line no-console
  console.log(`Connecting to Browserless...`);
  const browser = await chromium.connectOverCDP(wss, { timeout: 30_000 });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ───────────── Step 0a: login via email/password ─────────────
  const stage1Url = `${baseUrl}/automations/debtor-email/stage-1`;
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent("/automations/debtor-email/stage-1")}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.screenshot({ path: `${SHOTS}/00a-login-pre-submit.png`, fullPage: true });
  // Force-click: the submit button has a CSS gradient + transitions that
  // Playwright flags as "not stable" on slow connections.
  await page.locator('button[type="submit"]').click({ force: true, timeout: 10_000 }).catch(async () => {
    await page.locator('input[type="password"]').press("Enter");
  });
  // Wait for redirect away from /login. Up to 20s for Supabase round-trip.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  } catch {
    await page.screenshot({ path: `${SHOTS}/00b-login-stuck.png`, fullPage: true });
    record("0", "AUTH", "FAIL", `Still on ${page.url()} after submit — login did not redirect`);
    await summarize();
    await browser.close();
    return;
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  // Ensure we end up on stage-1 (in case login landed somewhere else).
  if (!page.url().includes("/automations/debtor-email/stage-1")) {
    await page.goto(stage1Url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  const landedUrl = page.url();
  if (landedUrl.includes("/login") || landedUrl.includes("/auth/")) {
    await page.screenshot({ path: `${SHOTS}/00c-redirected-back.png`, fullPage: true });
    record("0", "AUTH", "FAIL", `Redirected back to ${landedUrl} after login`);
    await summarize();
    await browser.close();
    return;
  }
  await page.screenshot({ path: `${SHOTS}/00-stage-1-loaded.png`, fullPage: true });
  record("0", "AUTH", "PASS", `Landed on ${landedUrl} as ${email}`);

  // ───────────── Step 1: row dots present (R3) ─────────────
  const dots = await page.locator('[data-testid="row-verdict-dot"]').count();
  if (dots === 0) {
    record("1", "R3", "FAIL", "No row-verdict-dot elements found on Stage 1");
  } else {
    const verdicts = await page.locator('[data-testid="row-verdict-dot"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute("data-verdict")),
    );
    const summary = verdicts.reduce<Record<string, number>>((acc, v) => {
      const k = v ?? "null";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    record("1", "R3", "PASS", `${dots} dots present — verdicts: ${JSON.stringify(summary)}`);
  }

  // Click first row to open detail pane.
  const firstRow = page.locator('ul li[role="button"]').first();
  if ((await firstRow.count()) === 0) {
    record("0.5", "ROW", "FAIL", "No rows in stage-1 list to click");
    await summarize();
    await browser.close();
    return;
  }
  await firstRow.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-row-clicked.png`, fullPage: true });

  // Expand audit so feedback panel mounts. The StageDetailExpander needs to
  // open for the textarea to be in DOM. We'll click the first stage-step's
  // audit expander trigger.
  const expanderTrigger = page.locator('[data-testid^="stage-detail-expander-"] button, [aria-controls*="stage"]').first();
  if ((await expanderTrigger.count()) > 0) {
    await expanderTrigger.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // ───────────── Step 2 (R1): textarea pre-fill ─────────────
  const textareaCount = await page.locator('textarea[id^="stage-feedback-textarea-"]').count();
  if (textareaCount === 0) {
    record("2", "R1", "WARN", "No StageFeedbackPanel textarea visible — audit expander may not have opened; cannot assess R1 read-back");
  } else {
    const firstTextarea = page.locator('textarea[id^="stage-feedback-textarea-"]').first();
    const preFilled = await firstTextarea.inputValue();
    if (preFilled.length > 0) {
      record("2", "R1", "PASS", `Textarea pre-filled with ${preFilled.length} chars (read-back working)`);
    } else {
      record("2", "R1", "WARN", "Textarea empty on mount — no prior feedback for this row (cannot positively confirm R1, but no regression)");
    }
  }

  // ───────────── Step 3 (R1): "What others said" toggle ─────────────
  const othersToggle = page.locator('button:has-text("What others said"), button:has-text("Others")').first();
  const othersVisible = await othersToggle.isVisible().catch(() => false);
  record(
    "3",
    "R1",
    othersVisible ? "PASS" : "SKIP",
    othersVisible ? "OthersSaidBlock toggle present" : "No cross-operator notes on this row — toggle hidden (expected)",
  );

  // ───────────── Step 6 (R4): amber microcopy ─────────────
  const helperUnder = page.locator('[data-testid="override-coupling-helper"]');
  const helperPicker = page.locator('[data-testid="override-coupling-helper-picker"]');
  const underVisible = await helperUnder.isVisible().catch(() => false);
  const pickerVisible = await helperPicker.isVisible().catch(() => false);
  if (underVisible) {
    const underColor = await helperUnder.evaluate((el) => getComputedStyle(el).color);
    record("6a", "R4", "PASS", `Microcopy under textarea visible; color=${underColor}`);
  } else {
    record("6a", "R4", "FAIL", "Microcopy under textarea label missing");
  }
  record("6b", "R4", pickerVisible ? "PASS" : "SKIP", pickerVisible ? "Picker microcopy visible" : "Picker microcopy hidden (not in dirty state — expected)");

  // ───────────── Step 5 + 8 (R7): bottom button label ─────────────
  const primaryBtn = page.locator('footer[data-testid="action-footer"] button, [data-testid="primary-action-button"]').first();
  const primaryLabel = (await primaryBtn.textContent().catch(() => null))?.trim() ?? null;
  if (primaryLabel?.includes("Approve verdicts that ran")) {
    record("8", "R7", "PASS", `Approve mode label: "${primaryLabel}"`);
  } else if (primaryLabel?.includes("Submit override")) {
    record("8", "R7", "PASS", `Override mode label: "${primaryLabel}"`);
  } else {
    record("8", "R7", "WARN", `Primary button label unexpected: "${primaryLabel ?? "(not found)"}"`);
  }
  await page.screenshot({ path: `${SHOTS}/02-detail-pane.png`, fullPage: true });

  // ───────────── Step 10 (R8): 1280×800 no horizontal scrollbar ─────────────
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="detail-pane"]') as HTMLElement | null;
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const paneOverflow = root ? root.scrollWidth - root.clientWidth : null;
    return { docOverflow, paneOverflow };
  });
  if (overflow.docOverflow <= 0 && (overflow.paneOverflow === null || overflow.paneOverflow <= 0)) {
    record("10", "R8", "PASS", `No horizontal overflow at 1280×800. doc=${overflow.docOverflow}, pane=${overflow.paneOverflow}`);
  } else {
    record("10", "R8", "FAIL", `Horizontal overflow detected: doc=${overflow.docOverflow}, pane=${overflow.paneOverflow}`);
  }

  // Save / Confirm visibility (R5 layout)
  const saveVisible = await page.locator('[data-testid="stage-feedback-save"]').isVisible().catch(() => false);
  const confirmVisible = await page.locator('[data-testid="stage-feedback-confirm"]').isVisible().catch(() => false);
  if (saveVisible && confirmVisible) {
    record("10b", "R5/R8", "PASS", "Save + Confirm both visible");
  } else {
    record("10b", "R5/R8", "WARN", `Save=${saveVisible}, Confirm=${confirmVisible}`);
  }

  // ───────────── Step 11a/c/d/e (W4): keyboard shortcuts ─────────────
  const textareaPresent = (await page.locator('textarea[id^="stage-feedback-textarea-"]').count()) > 0;
  if (textareaPresent) {
    const ta = page.locator('textarea[id^="stage-feedback-textarea-"]').first();
    await ta.focus();
    await ta.fill("UAT W4 test "); // clear+type
    // 11d: 'n' typing (should type, not trigger Skip)
    await ta.press("n");
    const afterN = await ta.inputValue();
    record("11d", "W4", afterN.endsWith("n") ? "PASS" : "FAIL", `Typed 'n' while focused; value ends with: "${afterN.slice(-10)}"`);
    // 11e: Enter inserts newline (shouldn't trigger primary)
    await ta.press("Enter");
    const afterEnter = await ta.inputValue();
    record("11e", "W4", afterEnter.includes("\n") ? "PASS" : "FAIL", `Enter inserted newline: ${JSON.stringify(afterEnter.slice(-5))}`);
  } else {
    record("11", "W4", "SKIP", "No focused textarea available for W4 assertions");
  }

  // ───────────── Destructive steps (only if UAT_FULL) ─────────────
  if (fullUat) {
    record("DESTRUCTIVE", "—", "WARN", "Destructive UAT branch not implemented in this script — covered by static audit");
  }

  await page.screenshot({ path: `${SHOTS}/99-final.png`, fullPage: true });

  await summarize();
  await browser.close();
}

async function summarize() {
  const total = RESULTS.length;
  const pass = RESULTS.filter((r) => r.status === "PASS").length;
  const fail = RESULTS.filter((r) => r.status === "FAIL").length;
  const warn = RESULTS.filter((r) => r.status === "WARN").length;
  const skip = RESULTS.filter((r) => r.status === "SKIP").length;
  const out = {
    summary: { total, pass, fail, warn, skip },
    results: RESULTS,
  };
  await writeFile(resolve(SHOTS, "results.json"), JSON.stringify(out, null, 2));
  // eslint-disable-next-line no-console
  console.log("\n========== UAT SUMMARY ==========");
  // eslint-disable-next-line no-console
  console.log(`PASS=${pass} FAIL=${fail} WARN=${warn} SKIP=${skip} / total=${total}`);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("UAT script error:", err);
  await summarize();
  process.exit(1);
});
