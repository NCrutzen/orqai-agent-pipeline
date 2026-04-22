/**
 * DOM probe for iController email-detail popup.
 *
 * Purpose: prep-work for the debtor-email drafter sub-agent. We need to know
 * what the DOM looks like when you click an email row's subject — what
 * reply-composer lives inside, which buttons are available, how attachments
 * are added, what selectors we'll rely on.
 *
 * Read-only. Runs against ACCEPTANCE. No data modified.
 *
 * Usage:
 *   npx tsx web/lib/automations/debtor-email-cleanup/probe-email-popup.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";

config({ path: resolve(__dirname, "../../../.env.local") });

import { connectWithSession, saveSession, captureScreenshot } from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";

const ENV = "acceptance" as const;
const URL_BASE = "https://test-walkerfire-testing.icontroller.billtrust.com";
const CREDENTIAL_ID = "e9a9570e-5f0d-4d50-8b41-212fc6bdb78a";
const SESSION_KEY = "icontroller_session";

const OUT_DIR = resolve(__dirname, "../../../../.planning/briefs/artifacts");
const AUTOMATION = "debtor-email-drafter-probe";

async function main() {
  console.log(`\n=== ENVIRONMENT: ${ENV.toUpperCase()} -- Credentials: iController acceptance ===\n`);
  mkdirSync(OUT_DIR, { recursive: true });

  const { browser, context, page } = await connectWithSession(SESSION_KEY);
  try {
    // Login (skips if session still valid)
    await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const needsLogin = await page.locator("#login-username").isVisible({ timeout: 3000 }).catch(() => false);
    if (needsLogin) {
      const creds = await resolveCredentials(CREDENTIAL_ID);
      await page.fill("#login-username", creds.username);
      await page.fill("#login-password", creds.password);
      await page.click("#login-submit");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      console.log("✓ logged in");
    } else {
      console.log("✓ session reused");
    }

    // Navigate to dashboard first, then try messages. Acceptance sometimes 500s on
    // direct /messages without dashboard context established.
    await page.goto(`${URL_BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await captureScreenshot(page, { automation: AUTOMATION, label: "00-dashboard" });

    // Try /messages, retry via sidebar company-link if it errors.
    await page.goto(`${URL_BASE}/messages`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    let listHtml = await page.content();
    if (/page is temporarily unavailable|Sorry!/.test(listHtml)) {
      console.log("! /messages returned error page, trying sidebar mailbox link from dashboard...");
      await page.goto(`${URL_BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const mailboxHref = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/messages/']"));
        return links[0]?.getAttribute("href") ?? null;
      });
      if (mailboxHref) {
        console.log(`  sidebar link found: ${mailboxHref}`);
        await page.goto(`${URL_BASE}${mailboxHref}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        listHtml = await page.content();
      } else {
        console.log("  no sidebar /messages link found");
      }
    }

    const listShot = await captureScreenshot(page, { automation: AUTOMATION, label: "01-messages-list" });
    console.log(`✓ messages list screenshot: ${listShot.url ?? listShot.path}`);
    console.log(`  page size: ${listHtml.length.toLocaleString()} bytes`);

    // Capture the FIRST email row's raw HTML so we know how subject cells render
    const firstRowHtml = await page.evaluate(() => {
      const row = document.querySelector<HTMLTableRowElement>("#messages-list tbody tr");
      if (!row) return null;
      return {
        outerHtml: row.outerHTML.slice(0, 4000),
        cellTexts: Array.from(row.querySelectorAll("td")).map((td) => (td.textContent || "").trim().slice(0, 120)),
      };
    });
    writeFileSync(resolve(OUT_DIR, "01-first-row.json"), JSON.stringify(firstRowHtml, null, 2));
    console.log(`✓ first-row snapshot written`);

    // Click the most clickable element in the first row (likely a link in subject cell)
    const clickOutcome = await page.evaluate(() => {
      const row = document.querySelector<HTMLTableRowElement>("#messages-list tbody tr");
      if (!row) return { clicked: false, reason: "no row" };
      // Priority: <a> inside row → clickable cell with onclick → row itself
      const link = row.querySelector<HTMLAnchorElement>("a[href]");
      if (link) {
        link.click();
        return { clicked: true, via: "anchor", href: link.getAttribute("href") };
      }
      const clickable = row.querySelector<HTMLElement>("[onclick], [data-toggle], .clickable");
      if (clickable) {
        clickable.click();
        return { clicked: true, via: "onclick-element" };
      }
      // Fallback: click the cell with the longest text (usually subject)
      let best: HTMLElement | null = null;
      let bestLen = 0;
      for (const td of Array.from(row.querySelectorAll<HTMLElement>("td"))) {
        const len = (td.textContent || "").trim().length;
        if (len > bestLen) { best = td; bestLen = len; }
      }
      if (best) { best.click(); return { clicked: true, via: "longest-cell" }; }
      return { clicked: false, reason: "nothing clickable" };
    });
    console.log(`✓ click outcome:`, clickOutcome);

    await page.waitForTimeout(3500); // popup animation + content load

    const afterClickShot = await captureScreenshot(page, { automation: AUTOMATION, label: "02-after-click" });
    console.log(`✓ post-click screenshot: ${afterClickShot.url ?? afterClickShot.path}`);

    // Capture: URL (maybe SPA route changed), any modal element, and the full-page DOM slice around message/email keywords
    const snapshot = await page.evaluate(() => {
      const modalSelectors = [
        ".modal.show",
        ".modal.in",
        ".modal[style*='display: block']",
        "[role='dialog']",
        ".email-detail",
        ".message-detail",
        ".preview-pane",
        "#message-modal",
        "#email-modal",
      ];
      const foundModals = modalSelectors
        .map((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          return el ? { selector: sel, outerHtml: el.outerHTML.slice(0, 20_000), visible: el.offsetParent !== null } : null;
        })
        .filter(Boolean);

      // Buttons/actions anywhere on the page that look like reply/draft/attach
      const actionKeywords = /reply|answer|antwoord|beantwoord|draft|concept|compose|attach|bijlage|send|verstuur|forward|doorsturen/i;
      const actions = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button'], input[type='submit']"))
        .map((el) => ({
          tag: el.tagName,
          text: (el.textContent || "").trim().slice(0, 80),
          id: el.id || null,
          cls: el.className?.toString().slice(0, 120) || null,
          href: (el as HTMLAnchorElement).href || null,
        }))
        .filter((a) => a.text && actionKeywords.test(a.text));

      return {
        url: window.location.href,
        title: document.title,
        modals: foundModals,
        bodyTextSlice: document.body.innerText.slice(0, 2000),
        candidateActions: actions.slice(0, 50),
      };
    });

    writeFileSync(resolve(OUT_DIR, "02-after-click-snapshot.json"), JSON.stringify(snapshot, null, 2));
    console.log(`✓ snapshot JSON written`);

    // Full page HTML dump (may be large — truncated per serializer)
    const fullHtml = await page.content();
    writeFileSync(resolve(OUT_DIR, "03-full-page.html"), fullHtml);
    console.log(`✓ full page HTML written (${fullHtml.length.toLocaleString()} bytes)`);

    // Summary print
    console.log("\n--- SUMMARY ---");
    console.log(`URL:      ${snapshot.url}`);
    console.log(`Title:    ${snapshot.title}`);
    console.log(`Modals:   ${snapshot.modals.length} found`);
    for (const m of snapshot.modals) {
      console.log(`  · ${m!.selector}  visible=${m!.visible}  (${m!.outerHtml.length} bytes)`);
    }
    console.log(`Actions:  ${snapshot.candidateActions.length} reply/draft/attach candidates`);
    for (const a of snapshot.candidateActions.slice(0, 15)) {
      console.log(`  · [${a.tag}]  "${a.text}"  id=${a.id}  cls="${(a.cls || "").slice(0, 60)}"`);
    }
    console.log(`\nArtifacts in: ${OUT_DIR}`);

    await saveSession(context, SESSION_KEY);
  } catch (err) {
    console.error("Fatal:", err);
    await captureScreenshot(page, { automation: AUTOMATION, label: "error" }).catch(() => null);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
