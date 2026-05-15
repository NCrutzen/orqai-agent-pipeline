/**
 * Diagnostic probe: click "Submit override (Stage 1)" and capture all network
 * requests + responses + console messages + any UI mutation. Tells us whether
 * the click is silently working (network round-trip OK, no UI feedback) or
 * actually broken.
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

  // Login
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent("/automations/debtor-email/stage-1")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Click first row to open detail pane
  await page.locator('ul li[role="button"]').first().click();
  await page.waitForTimeout(1500);

  // Wire up listeners BEFORE click
  const requests: Array<{ url: string; method: string; postBody: string | null }> = [];
  const responses: Array<{ url: string; status: number; body: string }> = [];
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];

  page.on("request", (req) => {
    if (req.url().includes("/api/") || req.url().includes("/feedback") || req.url().includes("inngest")) {
      requests.push({ url: req.url(), method: req.method(), postBody: req.postData() });
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("/api/") || res.url().includes("/feedback") || res.url().includes("inngest")) {
      let body = "(unread)";
      try {
        body = (await res.text()).slice(0, 500);
      } catch {}
      responses.push({ url: res.url(), status: res.status(), body });
    }
  });
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // Capture pre-click state
  const primary = page.locator('footer[data-testid="action-footer"] button').first();
  const preLabel = (await primary.textContent())?.trim() ?? "(none)";
  const preRowCount = await page.locator('ul li[role="button"]').count();
  const preSelectedId = await page.evaluate(() => new URL(window.location.href).searchParams.get("selected"));

  // eslint-disable-next-line no-console
  console.log(`Pre-click: label="${preLabel}", rows=${preRowCount}, selected=${preSelectedId}`);

  // CLICK the override button
  await primary.click({ force: true });
  await page.waitForTimeout(3000); // allow network + state updates

  // Capture post-click state
  const postLabel = (await primary.textContent())?.trim() ?? "(none)";
  const postRowCount = await page.locator('ul li[role="button"]').count();
  const postSelectedId = await page.evaluate(() => new URL(window.location.href).searchParams.get("selected"));

  // eslint-disable-next-line no-console
  console.log(`Post-click: label="${postLabel}", rows=${postRowCount}, selected=${postSelectedId}`);
  // eslint-disable-next-line no-console
  console.log(`\n=== NETWORK (${requests.length} req / ${responses.length} res) ===`);
  for (const r of requests) {
    console.log(`  → ${r.method} ${r.url}`);
    if (r.postBody) console.log(`     body: ${r.postBody.slice(0, 200)}`);
  }
  for (const r of responses) {
    console.log(`  ← ${r.status} ${r.url}`);
    console.log(`     body: ${r.body.slice(0, 200)}`);
  }
  console.log(`\n=== CONSOLE (${consoleLogs.length}) ===`);
  for (const l of consoleLogs.slice(-20)) console.log(`  ${l}`);
  console.log(`\n=== PAGE ERRORS (${pageErrors.length}) ===`);
  for (const e of pageErrors) console.log(`  ${e}`);

  await page.screenshot({ path: "/tmp/uat-82.5-screenshots/probe-post-click.png", fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
