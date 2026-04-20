/**
 * NXT Exploration Script 10 — Order 370147 verkennen
 */

import { chromium } from "playwright-core";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;
const NXT_URL = "https://acc.sb.n-xt.org/#/home";
const USERNAME = "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";
const TEST_ORDER_CODE = "370147";

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

    // Orders filter → zoek 370147
    await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.locator('input[name="orderId"]').fill(TEST_ORDER_CODE);
    await page.waitForTimeout(500);
    await page.locator('a[href="#/orders/filter/list"]').click();
    await page.waitForTimeout(2500);

    // Klik eerste tabel cel
    const firstCell = page.locator("table tbody tr td").first();
    if (await firstCell.count() > 0) {
      await firstCell.click();
      await page.waitForTimeout(3000);
      console.log("Order detail URL:", page.url());

      // Scroll naar Order lines sectie
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(500);
      await screenshot(page, "100-order-lines-section");

      // Log order lines HTML
      const orderLinesHtml = await page.evaluate((): string => {
        const allEls = Array.from((document as Document).querySelectorAll("*"));
        for (const el of allEls) {
          if (el.textContent?.trim() === "Order lines" && el.tagName !== "BODY") {
            return el.parentElement?.outerHTML.substring(0, 5000) ?? "no parent";
          }
        }
        return "not found";
      });
      console.log("Order lines HTML:\n", orderLinesHtml);

      // Zoek delete/remove knoppen
      const deleteEls = await page.evaluate((): Array<{ html: string; visible: boolean }> => {
        const results: Array<{ html: string; visible: boolean }> = [];
        (document as Document).querySelectorAll(".fa-trash, .fa-remove, .fa-times, [ng-click*='remove'], [ng-click*='delete'], [ng-click*='Remove'], [ng-click*='Delete']").forEach((el: Element) => {
          const htmlEl = el as HTMLElement;
          results.push({
            html: el.outerHTML.substring(0, 200),
            visible: htmlEl.offsetParent !== null
          });
        });
        return results;
      });
      console.log("Delete elements:", JSON.stringify(deleteEls, null, 2));

      // Hover over order line
      const orderLine = page.locator(":has-text('Order lines')").last();
      await orderLine.hover();
      await page.waitForTimeout(500);
      await screenshot(page, "101-order-lines-hover");

      // Full page
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `102-fullpage-${Date.now()}.png`),
        fullPage: true
      });
      console.log("[screenshot] full page saved");

    } else {
      console.log("No order found with ID", TEST_ORDER_CODE);
      const bodyText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 500));
      console.log(bodyText);
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
