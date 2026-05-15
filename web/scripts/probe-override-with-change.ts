/**
 * Probe: open Stage 1 row, change the category dropdown to a non-current
 * value, fill notes if visible, click Submit override (Stage 1). Capture
 * network so we can prove the Inngest + email_feedback path fires.
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

  // Wire listeners
  const reqs: Array<{ url: string; method: string; body: string | null }> = [];
  const ress: Array<{ url: string; status: number; body: string }> = [];
  const toasts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/") || r.url().includes("inngest")) {
      reqs.push({ url: r.url(), method: r.method(), body: r.postData() });
    }
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/") || r.url().includes("inngest")) {
      let body = "(unread)";
      try { body = (await r.text()).slice(0, 300); } catch {}
      ress.push({ url: r.url(), status: r.status(), body });
    }
  });

  // 1) Click footer override WITHOUT changing dropdown — should toast now.
  const primary = page.locator('footer[data-testid="action-footer"] button').first();
  await primary.click({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe2-after-no-change-click.png", fullPage: true });
  // Capture toast text if any
  const toastTxt = await page.locator('[data-sonner-toast], [role="status"]').allTextContents().catch(() => []);
  console.log(`After no-change click: ${reqs.length} req, toasts=${JSON.stringify(toastTxt)}`);
  toasts.push(...toastTxt);

  // 2) Open the Stage 1 dropdown and pick a different option.
  // Stage1CategorySelect uses shadcn Select — trigger is a button, options are role=option.
  // Search for it within the detail pane.
  const trigger = page.locator('aside[data-testid="detail-pane"] [role="combobox"], aside[data-testid="detail-pane"] button[aria-haspopup="listbox"]').first();
  const triggerCount = await trigger.count();
  console.log(`Dropdown trigger count: ${triggerCount}`);
  if (triggerCount > 0) {
    await trigger.click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe2-dropdown-open.png", fullPage: true });
    // Pick any option that isn't "unknown"
    const options = page.locator('[role="option"]');
    const optTexts = await options.allTextContents();
    console.log(`Dropdown options: ${JSON.stringify(optTexts.slice(0, 10))}`);
    let picked = false;
    for (let i = 0; i < (await options.count()); i++) {
      const t = (await options.nth(i).textContent())?.trim().toLowerCase() ?? "";
      if (t && !t.includes("unknown")) {
        await options.nth(i).click({ force: true });
        console.log(`Picked: ${t}`);
        picked = true;
        break;
      }
    }
    if (!picked) console.log("Could not find a non-'unknown' option");
    await page.waitForTimeout(800);
  }

  // Fill notes if textarea appeared (for unknown-bucket the widget requires ≥10 chars)
  const notesBox = page.locator('aside[data-testid="detail-pane"] textarea').first();
  if (await notesBox.count() > 0) {
    await notesBox.fill("UAT probe: validating override dispatch path");
    console.log("Notes filled");
  }

  // 3) Click footer override AGAIN — now widget-dirty should be set.
  const reqsBeforeFinal = reqs.length;
  await primary.click({ force: true });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe2-after-final-click.png", fullPage: true });

  console.log(`\nAfter dropdown-change + click: ${reqs.length - reqsBeforeFinal} new requests`);
  console.log(`=== NETWORK (total ${reqs.length} req / ${ress.length} res) ===`);
  for (const r of reqs) {
    console.log(`  → ${r.method} ${r.url}`);
    if (r.body) console.log(`     body: ${r.body.slice(0, 200)}`);
  }
  for (const r of ress) {
    console.log(`  ← ${r.status} ${r.url} :: ${r.body.slice(0, 200)}`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
