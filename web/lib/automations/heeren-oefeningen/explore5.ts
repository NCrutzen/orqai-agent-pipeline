/**
 * NXT Exploration Script 5 — DOM debuggen + order openen
 */

import { chromium } from "playwright-core";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;

const NXT_URL = "https://acc.sb.n-xt.org/#/home";
const USERNAME = "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";
const TEST_ORDER_CODE = "370146";

async function screenshot(page: any, name: string) {
  const ts = Date.now();
  const file = path.join(SCREENSHOTS_DIR, `${name}-${ts}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[screenshot] ${file}`);
}

async function login(page: any) {
  await page.goto(NXT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
  await page.locator('input[type="email"], input[name="username"]').first().fill(USERNAME);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Inloggen")').first().click();
  await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function explore() {
  const browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);
    console.log("Logged in.");

    await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Vul Order ID in
    const orderIdInput = page.locator('input[name="orderId"]');
    await orderIdInput.click();
    await orderIdInput.fill(TEST_ORDER_CODE);
    await page.waitForTimeout(800);

    // Debug: log alle buttons' outerHTML
    const buttonHtmls = await page.evaluate((): string[] => {
      return Array.from((document as Document).querySelectorAll("button"))
        .map(b => b.outerHTML.substring(0, 200));
    });
    console.log("All button HTML:", JSON.stringify(buttonHtmls, null, 2));

    // Probeer te klikken via Playwright locator met nth
    const allButtons = page.locator("button");
    const count = await allButtons.count();
    console.log("Button count:", count);

    // Klik de rode button (Show list)
    // Op basis van screenshot is het de laatste button rechtsonder
    for (let i = 0; i < count; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      console.log(`  Button ${i}: "${text?.trim()}"`);
    }

    // Klik knop met "list" in de tekst
    for (let i = 0; i < count; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent() ?? "";
      if (text.toLowerCase().includes("list") || text.toLowerCase().includes("show")) {
        console.log(`Clicking button ${i}: "${text.trim()}"`);
        await btn.click();
        break;
      }
    }

    await page.waitForTimeout(3000);
    await screenshot(page, "50-after-click");
    console.log("URL:", page.url());

    // Log de pagina content
    const bodyText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 2000));
    console.log("Page content:\n", bodyText);

    // Zoek naar order in de lijst en klik
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    console.log("Table rows:", rowCount);

    if (rowCount > 0) {
      await screenshot(page, "51-orders-list");
      await rows.first().click();
      await page.waitForTimeout(3000);
      await screenshot(page, "52-order-detail");
      console.log("Order detail URL:", page.url());

      // Full page screenshot
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `52-order-detail-full-${Date.now()}.png`),
        fullPage: true
      });

      const detailText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 4000));
      console.log("Order detail:\n", detailText);

      const detailButtons = await page.evaluate((): string[] => {
        return Array.from((document as Document).querySelectorAll("button"))
          .map(b => b.textContent?.trim() ?? "")
          .filter(t => t.length > 0 && t.length < 80);
      });
      console.log("Detail buttons:", detailButtons);
    }

  } catch (err) {
    console.error("Error:", err);
    await screenshot(page, "error").catch(() => {});
  } finally {
    await browser.close();
  }
}

require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });
explore().catch(console.error);
