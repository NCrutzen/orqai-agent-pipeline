/**
 * Check NXT account roles via JWT token
 */

import { chromium } from "playwright-core";
import * as path from "path";

const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;
const NXT_URL = "https://acc.sb.n-xt.org/#/home";
const USERNAME = "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";

async function checkRoles() {
  const browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(NXT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
    await page.locator('input[type="email"], input[name="username"]').first().fill(USERNAME);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Inloggen")').first().click();
    await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Haal JWT token op uit localStorage
    const tokenData = await page.evaluate((): { token: string | null; allKeys: string[] } => {
      const allKeys = Object.keys(localStorage);
      let token = localStorage.getItem("jhi-authenticationtoken")
        || localStorage.getItem("authenticationtoken")
        || localStorage.getItem("token")
        || localStorage.getItem("jwt");
      // Zoek naar elke key die "token" bevat
      if (!token) {
        for (const key of allKeys) {
          if (key.toLowerCase().includes("token") || key.toLowerCase().includes("auth")) {
            token = localStorage.getItem(key);
            break;
          }
        }
      }
      return { token, allKeys };
    });

    console.log("LocalStorage keys:", tokenData.allKeys);
    console.log("Token found:", tokenData.token ? "YES" : "NO");

    if (tokenData.token) {
      // Decode JWT payload (base64)
      const parts = tokenData.token.split(".");
      if (parts.length === 3) {
        const payload = Buffer.from(parts[1], "base64").toString("utf8");
        console.log("JWT payload:", payload);
      }

      // API call met token
      const accountInfo = await page.evaluate(async (token: string): Promise<any> => {
        const res = await fetch("/api/account", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        return res.json();
      }, tokenData.token);

      console.log("Account info:", JSON.stringify(accountInfo, null, 2));
    }

    // Probeer ook de account info direct via de pagina te halen
    const accountFromPage = await page.evaluate(async (): Promise<any> => {
      const res = await fetch("/api/account");
      return res.json();
    });
    console.log("Account from page (no token):", JSON.stringify(accountFromPage, null, 2));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });
checkRoles().catch(console.error);
