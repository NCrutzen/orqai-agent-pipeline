/**
 * NXT Exploration Script — Heeren Oefeningen
 * Logt in op NXT acceptatie en verkent order navigatie + regelverwijdering
 */

import { chromium } from "playwright-core";
import * as fs from "fs";
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
  return file;
}

async function explore() {
  console.log("Connecting to Browserless...");
  const browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    // --- Stap 1: Login ---
    console.log("Navigating to NXT...");
    await page.goto(NXT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await screenshot(page, "01-login-page");

    console.log("Logging in...");
    // Vul gebruikersnaam in
    await page.waitForSelector('input[type="email"], input[name="username"], input[placeholder*="mail"], input[placeholder*="gebruiker"]', { timeout: 15_000 });
    await screenshot(page, "02-login-form-visible");

    const emailField = page.locator('input[type="email"], input[name="username"], input[placeholder*="mail"]').first();
    await emailField.fill(USERNAME);

    const passwordField = page.locator('input[type="password"]').first();
    await passwordField.fill(PASSWORD);

    await screenshot(page, "03-credentials-filled");

    // Klik login knop
    const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Inloggen"), button:has-text("Aanmelden")').first();
    await loginBtn.click();

    // Wacht op dashboard
    await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await screenshot(page, "04-after-login");

    console.log("Current URL after login:", page.url());

    // --- Stap 2: Navigeer naar order ---
    console.log(`Searching for order ${TEST_ORDER_CODE}...`);

    // Probeer navigatie via URL direct
    await page.goto(`https://acc.sb.n-xt.org/#/billing/orders/${TEST_ORDER_CODE}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "05-order-direct-url");

    console.log("URL after direct navigation:", page.url());

    // Controleer of de order geladen is, anders zoek via menu
    const pageContent = await page.content();
    const hasOrderContent = pageContent.includes(TEST_ORDER_CODE) || pageContent.includes("orderregel") || pageContent.includes("order");

    if (!hasOrderContent) {
      console.log("Direct URL not working, trying search...");
      // Terug naar home en zoek via UI
      await page.goto(NXT_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await screenshot(page, "06-home-for-search");
    }

    // Screenshot van de huidige staat
    await screenshot(page, "07-order-page-state");

    // Log de volledige URL structuur
    console.log("Final URL:", page.url());

    // Haal page title en hoofdelementen op
    const title = await page.title();
    console.log("Page title:", title);

    // Zoek naar order-gerelateerde elementen
    const elements = await page.evaluate((): Array<{ tag: string; text: string; href: string | null }> => {
      const interesting: Array<{ tag: string; text: string; href: string | null }> = [];
      (document as Document).querySelectorAll("button, a[href]").forEach((el: Element) => {
        const htmlEl = el as HTMLElement & { href?: string };
        const text = htmlEl.textContent?.trim() ?? "";
        if (text.length > 0 && text.length < 50) {
          interesting.push({ tag: el.tagName, text, href: htmlEl.href ?? null });
        }
      });
      return interesting.slice(0, 30);
    });

    console.log("Buttons/links found:", JSON.stringify(elements, null, 2));

  } catch (err) {
    console.error("Error:", err);
    await screenshot(page, "error-state").catch(() => {});
  } finally {
    await browser.close();
    console.log("Done.");
  }
}

// Laad env vars
require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });

explore().catch(console.error);
