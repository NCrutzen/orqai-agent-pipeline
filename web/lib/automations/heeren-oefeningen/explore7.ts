/**
 * NXT Exploration Script 7 — Order rij HTML inspecteren + detail openen
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

    // Direct naar de orders list navigeren (we weten al de URL)
    await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1500);
    const orderIdInput = page.locator('input[name="orderId"]');
    await orderIdInput.click();
    await orderIdInput.fill(TEST_ORDER_CODE);
    await page.waitForTimeout(500);

    // Klik Show list via de href
    await page.locator('a[href="#/orders/filter/list"]').click();
    await page.waitForTimeout(2500);
    await screenshot(page, "70-orders-list");

    // Log de table HTML om te begrijpen hoe de rij werkt
    const tableHtml = await page.evaluate((): string => {
      const table = (document as Document).querySelector("table");
      return table ? table.outerHTML.substring(0, 3000) : "no table";
    });
    console.log("Table HTML:\n", tableHtml);

    // Zoek alle links in de tabel
    const tableLinks = await page.evaluate((): Array<{ text: string; href: string; ngClick: string }> => {
      const links: Array<{ text: string; href: string; ngClick: string }> = [];
      (document as Document).querySelectorAll("table a, table [ng-click], table [ui-sref]").forEach((el: Element) => {
        links.push({
          text: (el as HTMLElement).textContent?.trim().substring(0, 50) ?? "",
          href: (el as HTMLAnchorElement).href ?? "",
          ngClick: el.getAttribute("ng-click") ?? ""
        });
      });
      return links;
    });
    console.log("Table links:", JSON.stringify(tableLinks, null, 2));

    // Klik op de first td (ID cel) van de eerste data rij
    const firstDataCell = page.locator("table tbody tr td").first();
    if (await firstDataCell.count() > 0) {
      console.log("Clicking first table cell...");
      await firstDataCell.click();
      await page.waitForTimeout(3000);
      const newUrl = page.url();
      console.log("URL after cell click:", newUrl);
      await screenshot(page, "71-after-cell-click");
    }

    // Als URL veranderd is, log de detail content
    const currentUrl = page.url();
    if (currentUrl.includes("orders/") && !currentUrl.includes("filter")) {
      console.log("Navigated to order detail!");
      const detailText = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 5000));
      console.log("Order detail:\n", detailText);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `72-order-detail-full-${Date.now()}.png`),
        fullPage: true
      });
    } else {
      // Probeer direct URL navigatie met het ID
      console.log("Trying direct URL navigation patterns...");
      const patterns = [
        `https://acc.sb.n-xt.org/#/orders/${TEST_ORDER_CODE}`,
        `https://acc.sb.n-xt.org/#/orders/detail/${TEST_ORDER_CODE}`,
        `https://acc.sb.n-xt.org/#/orders/view/${TEST_ORDER_CODE}`,
      ];

      for (const url of patterns) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await page.waitForTimeout(2000);
        const resultUrl = page.url();
        const content = await page.evaluate((): string => (document as Document).body.innerText.substring(0, 500));
        console.log(`Pattern: ${url} → ${resultUrl}`);
        console.log("Content preview:", content.substring(0, 200));
        await screenshot(page, `73-pattern-${url.split("/").pop()}`);
        if (!resultUrl.includes("home") && !resultUrl.includes("filter")) {
          console.log("Found valid pattern!");
          break;
        }
      }
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
