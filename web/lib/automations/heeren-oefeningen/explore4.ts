/**
 * NXT Exploration Script 4 — Order openen en regels bekijken
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

async function clickShowList(page: any) {
  // Klik via JS op de eerste knop die "Show" bevat
  await page.evaluate(() => {
    const buttons = Array.from((document as Document).querySelectorAll("button"));
    const btn = buttons.find(b => b.textContent?.includes("Show"));
    if (btn) (btn as HTMLButtonElement).click();
    else throw new Error("Show list button not found");
  });
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

    // Klik Show list via JS
    await clickShowList(page);
    await page.waitForTimeout(3000);
    await screenshot(page, "40-after-showlist");
    console.log("URL after showlist:", page.url());

    // Log knoppen op de pagina
    const buttons = await page.evaluate((): string[] => {
      return Array.from((document as Document).querySelectorAll("button"))
        .map(b => b.textContent?.trim() ?? "")
        .filter(t => t.length > 0);
    });
    console.log("Buttons on page:", buttons);

    // Klik op eerste rij in de lijst
    const firstRow = page.locator("table tbody tr, tr[class*='order'], tr[ng-repeat], .list-item").first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForTimeout(3000);
      await screenshot(page, "41-order-detail");
      console.log("Order detail URL:", page.url());

      // Log de pagina content
      const bodyText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 3000));
      console.log("Order detail content:\n", bodyText);

      // Kijk naar knoppen op de detail pagina
      const detailButtons = await page.evaluate((): string[] => {
        return Array.from((document as Document).querySelectorAll("button"))
          .map(b => b.textContent?.trim() ?? "")
          .filter(t => t.length > 0 && t.length < 60);
      });
      console.log("Detail page buttons:", detailButtons);

      // Screenshot fullpage voor detail
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `41-order-detail-full-${Date.now()}.png`),
        fullPage: true
      });
      console.log("[screenshot] fullpage order detail saved");

    } else {
      console.log("No rows found in results list");
      const bodyText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 1000));
      console.log("Page content:", bodyText);
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
