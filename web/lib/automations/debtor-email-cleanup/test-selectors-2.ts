/**
 * Test script round 2 — we're logged in to Messages page.
 * Now inspect sidebar structure, click a company, inspect table + action buttons.
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
    console.log("Logging in...");
    await page.goto(ICONTROLLER_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.fill('#login-username', USERNAME);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    console.log(`  URL: ${page.url()}`);

    // Navigate to Messages
    console.log("Navigating to Messages...");
    await page.goto(`${ICONTROLLER_URL}/messages`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "r2-01-messages");

    // Inspect sidebar DOM structure
    console.log("\n--- Sidebar structure ---");
    const sidebarHTML = await page.evaluate(() => {
      // Find the element containing "Inbox" text and get its parent container
      const inboxEl = Array.from(document.querySelectorAll('*')).find(
        el => el.textContent?.trim() === 'Inbox' && el.children.length === 0
      );
      if (!inboxEl) return "Inbox element not found";

      // Walk up to find the sidebar container
      let container = inboxEl.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        if (container.children.length > 5) break;
        container = container.parentElement;
      }
      return {
        containerTag: container?.tagName,
        containerClass: container?.className,
        containerId: container?.id,
        childCount: container?.children.length,
        // Get all links in this container
        links: Array.from(container?.querySelectorAll('a') || []).map(a => ({
          text: a.textContent?.trim(),
          href: a.getAttribute('href'),
          class: a.className,
        })),
      };
    });
    console.log(JSON.stringify(sidebarHTML, null, 2));

    // Click a company that likely has emails (Berki Brandbeveiliging was highlighted in the screenshot)
    console.log("\n--- Clicking company: Berki Brandbeveiliging ---");
    const companyLink = page.locator('a:has-text("Berki Brandbeveiliging")').first();
    const companyVisible = await companyLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (companyVisible) {
      await companyLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);
      await saveScreenshot(await page.screenshot({ fullPage: true }), "r2-02-company-inbox");
      console.log(`  URL: ${page.url()}`);

      // Inspect table
      console.log("\n--- Table structure ---");
      const tableInfo = await page.evaluate(() => {
        const table = document.querySelector('table');
        if (!table) return { found: false };

        return {
          found: true,
          id: table.id,
          className: table.className,
          headers: Array.from(table.querySelectorAll('thead th')).map(th => ({
            text: th.textContent?.trim(),
            class: th.className,
          })),
          rowCount: table.querySelectorAll('tbody tr').length,
          firstRows: Array.from(table.querySelectorAll('tbody tr')).slice(0, 3).map(tr => ({
            cells: Array.from(tr.querySelectorAll('td')).map(td => ({
              text: td.textContent?.trim().substring(0, 60),
              class: td.className,
              hasCheckbox: td.querySelector('input[type="checkbox"]') !== null,
            })),
            class: tr.className,
            id: tr.id,
          })),
        };
      });
      console.log(JSON.stringify(tableInfo, null, 2));

      // Inspect action toolbar (New message, Mark Done, trash icon area)
      console.log("\n--- Action toolbar ---");
      const toolbar = await page.evaluate(() => {
        // Look for the toolbar area near "New message" / "Mark Done"
        const allButtons = Array.from(document.querySelectorAll('button, a.btn, [role="button"], .btn'));
        return allButtons.map(b => ({
          tag: b.tagName,
          text: b.textContent?.trim().substring(0, 30),
          class: b.className,
          title: b.getAttribute('title'),
          id: b.id,
          href: (b as HTMLAnchorElement).href || null,
          dataAction: b.getAttribute('data-action'),
          onclick: b.getAttribute('onclick')?.substring(0, 80),
        })).filter(b => b.text || b.title || b.id);
      });
      console.log(JSON.stringify(toolbar, null, 2));

      // Also look for icon-based buttons (trash can might be an <i> or <span> inside a button)
      console.log("\n--- Icon buttons (fa-trash, delete icons) ---");
      const iconButtons = await page.evaluate(() => {
        const icons = Array.from(document.querySelectorAll('[class*="trash"], [class*="delete"], [class*="remove"], i.fa'));
        return icons.map(i => {
          const parent = i.parentElement;
          return {
            iconClass: i.className,
            parentTag: parent?.tagName,
            parentClass: parent?.className,
            parentTitle: parent?.getAttribute('title'),
            parentId: parent?.id,
            parentOnclick: parent?.getAttribute('onclick')?.substring(0, 80),
          };
        });
      });
      console.log(JSON.stringify(iconButtons, null, 2));

    } else {
      console.log("  Company not found! Trying to list all clickable items...");
      // Try broader selectors
      const allLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .filter(a => a.textContent?.includes('»'))
          .map(a => ({ text: a.textContent?.trim(), href: a.href }));
      });
      console.log("Links with »:", JSON.stringify(allLinks.slice(0, 10), null, 2));
    }

    console.log("\n Done!");

  } catch (error) {
    console.error("Error:", error);
    await saveScreenshot(await page.screenshot({ fullPage: true }), "r2-error");
  } finally {
    await browser.close();
  }
}

main();
