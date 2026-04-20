/**
 * NXT Exploration Script 3 — Order zoeken via Order ID veld
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

    // Vul Order ID veld in (name="orderId")
    console.log("Filling Order ID field...");
    const orderIdInput = page.locator('input[name="orderId"]');
    await orderIdInput.click();
    await orderIdInput.fill(TEST_ORDER_CODE);
    await page.waitForTimeout(500);
    await screenshot(page, "30-orderid-filled");

    // Klik "Show list"
    await page.locator('button:has-text("Show list")').click();
    await page.waitForTimeout(3000);
    await screenshot(page, "31-orderid-results");
    console.log("URL after search:", page.url());

    // Kijk of er resultaten zijn
    const resultText = await page.locator("text=results").first().textContent().catch(() => "");
    console.log("Result text:", resultText);

    // Klik op eerste order rij
    const firstRow = page.locator("table tbody tr").first();
    const firstRowCount = await firstRow.count();
    console.log("Table rows found:", firstRowCount);

    if (firstRowCount > 0) {
      console.log("Clicking first row...");
      await firstRow.click();
      await page.waitForTimeout(3000);
      await screenshot(page, "32-order-detail");
      console.log("Order detail URL:", page.url());

      // Log alle tekst op de pagina (beknopt)
      const bodyText = await page.evaluate((): string => {
        const body = (document as Document).body;
        return body.innerText.substring(0, 2000);
      });
      console.log("Page text (first 2000 chars):\n", bodyText);
    } else {
      // Probeer Reference veld
      console.log("No results via Order ID, trying Reference field...");
      await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      const refInput = page.locator('input[name="reference"]');
      await refInput.fill(TEST_ORDER_CODE);
      await page.waitForTimeout(500);
      await page.locator('button:has-text("Show list")').click();
      await page.waitForTimeout(3000);
      await screenshot(page, "33-reference-results");
      console.log("Reference search URL:", page.url());

      const refResultText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 1000));
      console.log("Reference search result:", refResultText);
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
