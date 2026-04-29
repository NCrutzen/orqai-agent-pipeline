/**
 * Test script to validate iController selectors against Browserless.
 * Run: npx tsx lib/automations/debtor-email-cleanup/test-selectors.ts
 *
 * Takes screenshots at each step and saves them locally for review.
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_TOKEN!;
const ICONTROLLER_URL = "https://test-walkerfire-testing.icontroller.billtrust.com";

// Credentials — hardcoded for this one-off test only
const USERNAME = "ITsupport@moyneroberts.com";
const PASSWORD = "kR8$#Act8Y66";

const SCREENSHOT_DIR = resolve(__dirname, "screenshots");

async function saveScreenshot(buffer: Buffer, name: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  writeFileSync(path, buffer);
  console.log(`📸 Saved: ${path}`);
}

async function main() {
  console.log("Connecting to Browserless...");
  const wsEndpoint = `wss://production-ams.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=60000`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to iController
    console.log("\n--- Step 1: Navigate to iController ---");
    await page.goto(ICONTROLLER_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "01-landing-page");

    // Log what we see
    const pageTitle = await page.title();
    const currentUrl = page.url();
    console.log(`Title: ${pageTitle}`);
    console.log(`URL: ${currentUrl}`);

    // Step 2: Find login form elements
    console.log("\n--- Step 2: Inspect login form ---");
    const formInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({
        type: i.type,
        name: i.name,
        id: i.id,
        placeholder: i.placeholder,
        className: i.className,
      }));
    });
    console.log("Input fields found:", JSON.stringify(formInfo, null, 2));

    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
      return btns.map(b => ({
        tag: b.tagName,
        type: (b as HTMLButtonElement).type,
        text: b.textContent?.trim().substring(0, 50),
        id: b.id,
        className: b.className,
      }));
    });
    console.log("Buttons found:", JSON.stringify(buttons, null, 2));

    // Step 3: Login
    console.log("\n--- Step 3: Attempting login ---");
    // iController uses id="login-username" (type="text", not email)
    const usernameInput = page.locator('#login-username');
    if (await usernameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("  Username input found: #login-username");
      await usernameInput.fill(USERNAME);
    } else {
      console.log("  ⚠️ No username input found!");
    }

    const passwordInput = page.locator('#login-password');
    if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("  Password input found: #login-password");
      await passwordInput.fill(PASSWORD);
    } else {
      console.log("  ⚠️ No password input found!");
    }

    await saveScreenshot(await page.screenshot({ fullPage: true }), "02-login-filled");

    // Submit
    const submitButton = page.locator('#login-submit');
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("  Submit button found: #login-submit");
      await submitButton.click();
    } else {
      console.log("  ⚠️ No submit button found!");
    }

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "03-after-login");
    console.log(`  Post-login URL: ${page.url()}`);

    // Step 4: Navigate to Collections > Messages
    console.log("\n--- Step 4: Navigate to Collections > Messages ---");
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('nav a, .nav a, [role="navigation"] a, header a'));
      return links.map(l => ({
        text: l.textContent?.trim().substring(0, 30),
        href: (l as HTMLAnchorElement).href,
        className: l.className,
      }));
    });
    console.log("Nav links:", JSON.stringify(navLinks.slice(0, 20), null, 2));

    // Click Collections
    const collectionsLink = page.locator('text=Collections').first();
    if (await collectionsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Found 'Collections' link");
      await collectionsLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      await saveScreenshot(await page.screenshot({ fullPage: true }), "04-collections");
    } else {
      console.log("  ⚠️ 'Collections' not found in nav!");
    }

    // Click Messages
    const messagesLink = page.locator('text=Messages').first();
    if (await messagesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Found 'Messages' link");
      await messagesLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      await saveScreenshot(await page.screenshot({ fullPage: true }), "05-messages-inbox");
    } else {
      console.log("  ⚠️ 'Messages' not found!");
    }

    // Step 5: Inspect sidebar and table structure
    console.log("\n--- Step 5: Inspect sidebar ---");
    const sidebarLinks = await page.evaluate(() => {
      // Look for sidebar links that look like company names
      const links = Array.from(document.querySelectorAll('aside a, .sidebar a, nav.sidebar a, [class*="sidebar"] a, [class*="menu"] a'));
      return links.map(l => ({
        text: l.textContent?.trim(),
        href: (l as HTMLAnchorElement).href,
      })).filter(l => l.text && l.text.length > 1);
    });
    console.log(`Sidebar links (${sidebarLinks.length}):`, JSON.stringify(sidebarLinks.slice(0, 10), null, 2));

    // Click first company to see the table
    if (sidebarLinks.length > 2) {
      const firstCompany = sidebarLinks[2]; // Skip "Inbox" and first entry
      console.log(`\n--- Step 6: Clicking company: "${firstCompany.text}" ---`);
      await page.click(`text="${firstCompany.text}"`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      await saveScreenshot(await page.screenshot({ fullPage: true }), "06-company-inbox");

      // Inspect table structure
      const tableInfo = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        if (tables.length === 0) return { tables: 0, rows: 0, headers: [] as string[] };

        const table = tables[0];
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
        const rows = table.querySelectorAll('tbody tr');

        const firstRowCells = rows[0]
          ? Array.from(rows[0].querySelectorAll('td')).map(td => td.textContent?.trim().substring(0, 50) || '')
          : [];

        return {
          tables: tables.length,
          headers,
          rows: rows.length,
          firstRow: firstRowCells,
          tableId: table.id,
          tableClass: table.className,
        };
      });
      console.log("Table info:", JSON.stringify(tableInfo, null, 2));

      // Inspect delete/trash button
      const actionButtons = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a.btn, [role="button"]'));
        return btns.filter(b => {
          const text = b.textContent?.toLowerCase() || '';
          const cls = b.className?.toLowerCase() || '';
          const title = b.getAttribute('title')?.toLowerCase() || '';
          return text.includes('delete') || text.includes('trash') ||
                 cls.includes('delete') || cls.includes('trash') ||
                 title.includes('delete') || title.includes('trash') ||
                 b.querySelector('[class*="trash"]') !== null;
        }).map(b => ({
          tag: b.tagName,
          text: b.textContent?.trim().substring(0, 30),
          className: b.className,
          title: b.getAttribute('title'),
          id: b.id,
        }));
      });
      console.log("Delete/trash buttons:", JSON.stringify(actionButtons, null, 2));
    }

    console.log("\n✅ Test complete! Check screenshots in:", SCREENSHOT_DIR);

  } catch (error) {
    console.error("\n❌ Error:", error);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "error");
  } finally {
    await browser.close();
  }
}

main();
