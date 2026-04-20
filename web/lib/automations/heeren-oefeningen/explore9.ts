/**
 * NXT Exploration Script 9 — Order line hover + delete HTML
 */

import { chromium } from "playwright-core";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;

const NXT_URL = "https://acc.sb.n-xt.org/#/home";
const USERNAME = "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";
const ORDER_DETAIL_URL = `https://acc.sb.n-xt.org/#/orders/filter/list/detail/3631b94e-0623-47d8-abdf-ef6ce1facc51`;

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

    await page.goto(ORDER_DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Log de HTML van de order lines sectie
    const orderLinesHtml = await page.evaluate((): string => {
      // Zoek de "Order lines" sectie
      const headers = Array.from((document as Document).querySelectorAll("h3, h4, [class*='order-line'], [class*='orderline']"));
      for (const h of headers) {
        if ((h as HTMLElement).textContent?.includes("Order lines")) {
          const parent = h.parentElement;
          return parent ? parent.outerHTML.substring(0, 5000) : "no parent";
        }
      }
      // Fallback: zoek op tekst
      const allEls = Array.from((document as Document).querySelectorAll("*"));
      for (const el of allEls) {
        if (el.textContent?.trim() === "Order lines" && el.tagName !== "BODY") {
          const parent = el.parentElement;
          return parent ? parent.outerHTML.substring(0, 5000) : "no parent";
        }
      }
      return "not found";
    });
    console.log("Order lines section HTML:\n", orderLinesHtml);

    // Zoek order line rijen
    const orderLineRows = page.locator("[ng-repeat*='orderLine'], [ng-repeat*='line'], .order-line-row");
    console.log("Order line rows (ng-repeat):", await orderLineRows.count());

    // Alternatief: zoek elementen die "Herhaling" bevatten
    const lineWithText = page.locator(":has-text('Herhaling BHV')").last();
    if (await lineWithText.count() > 0) {
      // Scroll naar dit element
      await lineWithText.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await screenshot(page, "90-order-line-visible");

      // Hover over het element
      await lineWithText.hover();
      await page.waitForTimeout(1000);
      await screenshot(page, "91-order-line-hover");

      // Log HTML na hover
      const hoverHtml = await page.evaluate((): string => {
        const allEls = Array.from((document as Document).querySelectorAll("*"));
        for (const el of allEls) {
          if (el.textContent?.includes("Herhaling BHV") && el.tagName !== "BODY" && el.tagName !== "HTML") {
            return el.outerHTML.substring(0, 3000);
          }
        }
        return "not found";
      });
      console.log("Order line HTML after hover:\n", hoverHtml);

      // Zoek delete/remove knoppen in de buurt
      const deleteButtons = await page.evaluate((): Array<{ text: string; html: string }> => {
        const btns: Array<{ text: string; html: string }> = [];
        (document as Document).querySelectorAll("[ng-click*='delete'], [ng-click*='remove'], [ng-click*='Delete'], [ng-click*='Remove'], .fa-trash, .fa-remove, .fa-times, [class*='delete'], [class*='remove']").forEach((el: Element) => {
          btns.push({
            text: (el as HTMLElement).textContent?.trim().substring(0, 60) ?? "",
            html: el.outerHTML.substring(0, 300)
          });
        });
        return btns;
      });
      console.log("Delete/remove buttons:", JSON.stringify(deleteButtons, null, 2));

      // Klik op de order line zelf om te zien of het uitklapt
      await lineWithText.click();
      await page.waitForTimeout(1000);
      await screenshot(page, "92-order-line-clicked");
      console.log("URL after line click:", page.url());
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
