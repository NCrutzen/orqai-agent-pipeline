/**
 * Test round 3 — find a company with actual emails to validate the full flow.
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_TOKEN!;
const ICONTROLLER_URL = "https://test-walkerfire-testing.icontroller.billtrust.com";
const USERNAME = "ITsupport@moyneroberts.com";
const PASSWORD = "kR8$#Act8Y66";
const SCREENSHOT_DIR = resolve(__dirname, "screenshots");

async function saveScreenshot(buffer: Buffer, name: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  writeFileSync(path, buffer);
  console.log(`  screenshot: ${name}.png`);
}

async function main() {
  console.log("Connecting to Browserless...");
  const browser = await chromium.connectOverCDP(
    `wss://production-ams.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=60000`,
    { timeout: 30_000 },
  );
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    await page.goto(ICONTROLLER_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.fill('#login-username', USERNAME);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    console.log(`Logged in: ${page.url()}`);

    // Go to messages
    await page.goto(`${ICONTROLLER_URL}/messages`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Get all company mailbox links
    const mailboxes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .filter(a => a.getAttribute('href')?.includes('/messages/index/mailbox/'))
        .map(a => ({
          name: a.textContent?.trim().replace(/^»\s*/, '') || '',
          href: a.getAttribute('href')!,
        }));
    });
    console.log(`Found ${mailboxes.length} company mailboxes`);

    // Check each mailbox for emails
    for (const mb of mailboxes) {
      await page.goto(`${ICONTROLLER_URL}${mb.href}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      const isEmpty = await page.locator('.dataTables_empty').isVisible({ timeout: 1500 }).catch(() => false);
      if (isEmpty) {
        console.log(`  ${mb.name}: empty`);
        continue;
      }

      // Count rows
      const rowCount = await page.evaluate(() => {
        return document.querySelectorAll('#messages-list tbody tr').length;
      });

      console.log(`  ${mb.name}: ${rowCount} email(s) ✉️`);

      if (rowCount > 0) {
        // Get first few email details
        const emails = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('#messages-list tbody tr')).slice(0, 3);
          return rows.map(tr => {
            const cells = Array.from(tr.querySelectorAll('td'));
            return cells.map(td => td.textContent?.trim().substring(0, 50) || '');
          });
        });
        console.log(`    First emails:`, JSON.stringify(emails));

        // Take screenshot of first inbox with emails
        await saveScreenshot(await page.screenshot({ fullPage: true }), `r3-${mb.name.replace(/[^a-z0-9]/gi, '-')}-inbox`);

        // Inspect the row structure closer (checkbox, select behavior)
        const rowDetail = await page.evaluate(() => {
          const firstRow = document.querySelector('#messages-list tbody tr');
          if (!firstRow) return null;
          return {
            id: firstRow.id,
            class: firstRow.className,
            cells: Array.from(firstRow.querySelectorAll('td')).map((td, i) => ({
              index: i,
              class: td.className,
              hasCheckbox: td.querySelector('input[type="checkbox"]') !== null,
              hasLink: td.querySelector('a') !== null,
              innerHtml: td.innerHTML.substring(0, 100),
            })),
          };
        });
        console.log(`    Row detail:`, JSON.stringify(rowDetail, null, 2));
        break; // Found one with emails, stop
      }
    }

    console.log("\nDone!");

  } catch (error) {
    console.error("Error:", error);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "r3-error");
  } finally {
    await browser.close();
  }
}

main();
