/**
 * NXT Exploration Script 2 — Order zoeken en openen
 */

import { chromium } from "playwright-core";
import * as path from "path";
import * as fs from "fs";

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
  return file;
}

async function login(page: any) {
  await page.goto(NXT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
  await page.locator('input[type="email"], input[name="username"]').first().fill(USERNAME);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Inloggen")').first().click();
  await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("Logged in. URL:", page.url());
}

async function explore() {
  console.log("Connecting to Browserless...");
  const browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);

    // --- Probeer Orders filter pagina ---
    console.log("Navigating to orders filter...");
    await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "10-orders-filter");
    console.log("Orders filter URL:", page.url());

    // Zoek naar een zoekveld
    const inputs = await page.evaluate((): Array<{ type: string; placeholder: string; name: string; id: string }> => {
      return Array.from((document as Document).querySelectorAll("input")).map((el: HTMLInputElement) => ({
        type: el.type,
        placeholder: el.placeholder,
        name: el.name,
        id: el.id,
      }));
    });
    console.log("Inputs on orders filter:", JSON.stringify(inputs, null, 2));

    // Probeer te zoeken op ordernummer
    const searchInput = page.locator('input[placeholder*="order"], input[placeholder*="Order"], input[placeholder*="zoek"], input[placeholder*="search"], input[type="search"], input[type="text"]').first();
    const searchExists = await searchInput.count();

    if (searchExists > 0) {
      console.log("Search input found, filling with order code...");
      await searchInput.fill(TEST_ORDER_CODE);
      await page.waitForTimeout(1000);
      await screenshot(page, "11-orders-search-filled");

      // Klik zoeken of druk Enter
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      await screenshot(page, "12-orders-search-result");

      // Klik op eerste resultaat
      const firstRow = page.locator("table tbody tr, .order-row, [class*='order']").first();
      if (await firstRow.count() > 0) {
        await firstRow.click();
        await page.waitForTimeout(2000);
        await screenshot(page, "13-order-detail");
        console.log("Order detail URL:", page.url());
      }
    } else {
      console.log("No search input found on orders filter page");
      await screenshot(page, "11-orders-no-search");
    }

    // Log alle links op de huidige pagina
    const links = await page.evaluate((): Array<{ text: string; href: string }> => {
      return Array.from((document as Document).querySelectorAll("a[href]"))
        .map((el: Element) => ({ text: (el as HTMLElement).textContent?.trim() ?? "", href: (el as HTMLAnchorElement).href }))
        .filter(l => l.text.length > 0 && l.text.length < 80)
        .slice(0, 20);
    });
    console.log("Links on page:", JSON.stringify(links, null, 2));

    // --- Probeer ook invoices ---
    console.log("\nNavigating to invoices...");
    await page.goto("https://acc.sb.n-xt.org/#/invoices", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "20-invoices");
    console.log("Invoices URL:", page.url());

  } catch (err) {
    console.error("Error:", err);
    await screenshot(page, "error-state").catch(() => {});
  } finally {
    await browser.close();
    console.log("Done.");
  }
}

require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });
explore().catch(console.error);
