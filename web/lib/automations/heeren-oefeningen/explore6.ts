/**
 * NXT Exploration Script 6 — Show list via anchor, order detail + regelstructuur
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

    await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);

    const orderIdInput = page.locator('input[name="orderId"]');
    await orderIdInput.click();
    await orderIdInput.fill(TEST_ORDER_CODE);
    await page.waitForTimeout(800);

    // Debug: log alle clickable elementen
    const clickables = await page.evaluate((): Array<{ tag: string; text: string; html: string }> => {
      const elements: Array<{ tag: string; text: string; html: string }> = [];
      (document as Document).querySelectorAll("a, button, [ng-click], [ui-sref]").forEach((el: Element) => {
        const text = (el as HTMLElement).textContent?.trim() ?? "";
        if (text.length > 0 && text.length < 100) {
          elements.push({
            tag: el.tagName,
            text,
            html: el.outerHTML.substring(0, 300)
          });
        }
      });
      return elements;
    });
    console.log("Clickable elements:", JSON.stringify(clickables, null, 2));

    // Klik "Show list" anchor
    const showListEl = page.locator('a:has-text("Show"), [ng-click*="show"], [ng-click*="list"]').first();
    const showListCount = await showListEl.count();
    console.log("Show list elements found:", showListCount);

    if (showListCount > 0) {
      await showListEl.click();
    } else {
      // Klik via tekst zoeken in alle elementen
      await page.evaluate(() => {
        const all = Array.from((document as Document).querySelectorAll("*"));
        const el = all.find(e => e.textContent?.trim().startsWith("Show list"));
        if (el) (el as HTMLElement).click();
      });
    }

    await page.waitForTimeout(3000);
    await screenshot(page, "60-after-showlist");
    console.log("URL after show list:", page.url());

    const bodyText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 2000));
    console.log("Page content:\n", bodyText);

    // Zoek order rijen
    const rows = page.locator("tr, [class*='order-row'], [class*='list-item']");
    const rowCount = await rows.count();
    console.log("Rows found:", rowCount);

    if (rowCount > 1) {
      await screenshot(page, "61-orders-list");
      // Klik tweede row (eerste is header)
      await rows.nth(1).click();
      await page.waitForTimeout(3000);
      await screenshot(page, "62-order-detail");
      console.log("Order detail URL:", page.url());

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `62-order-detail-full-${Date.now()}.png`),
        fullPage: true
      });

      const detailText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 5000));
      console.log("Order detail:\n", detailText);

      const detailClickables = await page.evaluate((): Array<{ tag: string; text: string }> => {
        return Array.from((document as Document).querySelectorAll("a, button, [ng-click]"))
          .map(e => ({ tag: e.tagName, text: (e as HTMLElement).textContent?.trim().substring(0, 60) ?? "" }))
          .filter(e => e.text.length > 0);
      });
      console.log("Detail clickables:", JSON.stringify(detailClickables, null, 2));
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
