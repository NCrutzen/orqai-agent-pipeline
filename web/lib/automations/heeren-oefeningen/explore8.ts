/**
 * NXT Exploration Script 8 — Order detail volledig verkennen
 * UUID: 3631b94e-0623-47d8-abdf-ef6ce1facc51
 */

import { chromium } from "playwright-core";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;

const NXT_URL = "https://acc.sb.n-xt.org/#/home";
const USERNAME = "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";
const ORDER_UUID = "3631b94e-0623-47d8-abdf-ef6ce1facc51";
const ORDER_DETAIL_URL = `https://acc.sb.n-xt.org/#/orders/filter/list/detail/${ORDER_UUID}`;

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

    // Navigeer direct naar order detail
    await page.goto(ORDER_DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "80-order-detail-top");
    console.log("URL:", page.url());

    // Full page screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `80-order-detail-fullpage-${Date.now()}.png`),
      fullPage: true
    });
    console.log("[screenshot] full page saved");

    // Log alle tekst
    const bodyText = await page.evaluate((): string => (document as Document).body.innerText);
    console.log("Full page text:\n", bodyText);

    // Scroll naar beneden om order lines te zien
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(500);
    await screenshot(page, "81-order-detail-scrolled");

    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(500);
    await screenshot(page, "82-order-detail-scrolled2");

    // Zoek tabs op de pagina
    const tabs = await page.evaluate((): string[] => {
      return Array.from((document as Document).querySelectorAll("[role='tab'], .nav-tab, md-tab, [md-tab-item]"))
        .map(t => (t as HTMLElement).textContent?.trim() ?? "");
    });
    console.log("Tabs:", tabs);

    // Log knoppen/acties op de pagina
    const actions = await page.evaluate((): Array<{ tag: string; text: string; html: string }> => {
      return Array.from((document as Document).querySelectorAll("button, a.md-button, a.btn"))
        .map(e => ({
          tag: e.tagName,
          text: (e as HTMLElement).textContent?.trim().substring(0, 60) ?? "",
          html: e.outerHTML.substring(0, 200)
        }))
        .filter(e => e.text.length > 0);
    });
    console.log("Actions on page:", JSON.stringify(actions, null, 2));

  } catch (err) {
    console.error("Error:", err);
    await screenshot(page, "error").catch(() => {});
  } finally {
    await browser.close();
  }
}

require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });
explore().catch(console.error);
