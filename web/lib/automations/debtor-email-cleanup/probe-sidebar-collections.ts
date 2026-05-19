/**
 * Live DOM probe — iController production sidebar with activeAccount="Collections".
 *
 * Goal: capture the real markup of the "clear Account filter" affordance so we
 * can patch `resetSidebarAccountFilter` in browser.ts. The current selectors
 * (text /^(alle|all|all accounts|alle accounts|reset)/i, href /\/account(\/0)?$/)
 * produce zero candidates against the live DOM, causing 54/148 (36%) iController
 * delete failures with fingerprint activeAccount="Collections", resetClicked=false.
 *
 * READ-ONLY. No clicks on delete/bulk-action affordances. The Collections sidebar
 * link IS clicked (to set the filter state we want to inspect) — this is a
 * benign navigation, identical to what an operator does.
 *
 * Run: BROWSERLESS_API_TOKEN=... npx tsx web/lib/automations/debtor-email-cleanup/probe-sidebar-collections.ts
 *
 * Environment banner: PRODUCTION — iController walkerfire.icontroller.eu —
 * Action: read-only sidebar DOM dump on debiteuren@smeba.nl + Collections filter
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  openIControllerSession,
  closeIControllerSession,
} from "@/lib/automations/icontroller/session";

const MAILBOX_ID = 4; // debiteuren@smeba.nl
const OUT_DIR = resolve(__dirname, "screenshots", "probe-collections");

interface SidebarSnapshot {
  label: string;
  url: string;
  activeAccount: string | null;
  anchors: Array<{
    text: string;
    href: string;
    className: string;
    dataAttrs: Record<string, string>;
    parentTag: string;
    parentClass: string;
    visible: boolean;
  }>;
  buttons: Array<{
    tag: string;
    text: string;
    className: string;
    title: string | null;
    ariaLabel: string | null;
    dataAttrs: Record<string, string>;
  }>;
  rootHtmlSnippet: string;
  rowCount: number;
}

async function snapshotSidebar(
  page: import("playwright-core").Page,
  label: string,
): Promise<SidebarSnapshot> {
  const url = page.url();
  return page.evaluate(
    ({ label, url }) => {
      const root =
        document.querySelector("#messages-nav") ||
        document.querySelector(".sidebar") ||
        document.body;

      const activeEl = root.querySelector<HTMLElement>(
        "a.active, li.active > a, a.selected, li.selected > a, a[aria-current='page'], a[aria-current='true']",
      );
      const activeAccount =
        activeEl && (activeEl.textContent || "").trim().length > 0
          ? (activeEl.textContent || "").trim().replace(/^»\s*/, "").slice(0, 120)
          : null;

      const collectDataAttrs = (el: Element): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.startsWith("data-") || attr.name === "ic-") {
            out[attr.name] = attr.value.slice(0, 200);
          }
        }
        return out;
      };

      const anchors = Array.from(
        root.querySelectorAll<HTMLAnchorElement>("a[href], a"),
      ).map((a) => {
        const rect = a.getBoundingClientRect();
        return {
          text: (a.textContent || "").trim().slice(0, 120),
          href: a.getAttribute("href") || "",
          className: a.className || "",
          dataAttrs: collectDataAttrs(a),
          parentTag: a.parentElement?.tagName || "",
          parentClass: a.parentElement?.className || "",
          visible: rect.width > 0 && rect.height > 0,
        };
      });

      const buttons = Array.from(
        root.querySelectorAll<HTMLElement>("button, [role='button'], .btn"),
      ).map((b) => ({
        tag: b.tagName,
        text: (b.textContent || "").trim().slice(0, 80),
        className: b.className || "",
        title: b.getAttribute("title"),
        ariaLabel: b.getAttribute("aria-label"),
        dataAttrs: collectDataAttrs(b),
      }));

      const rootHtmlSnippet = (root as HTMLElement).outerHTML.slice(0, 20000);
      const rowCount = document.querySelectorAll("#messages-list tbody tr").length;

      return {
        label,
        url,
        activeAccount,
        anchors,
        buttons,
        rootHtmlSnippet,
        rowCount,
      };
    },
    { label, url },
  );
}

function saveJson(name: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`📝 Saved: ${path}`);
}

function saveText(name: string, body: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, `${name}.html`);
  writeFileSync(path, body);
  console.log(`📝 Saved: ${path}`);
}

async function saveScreenshot(
  page: import("playwright-core").Page,
  name: string,
) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, `${name}.png`);
  const buf = await page.screenshot({ fullPage: true });
  writeFileSync(path, buf);
  console.log(`📸 Saved: ${path}`);
}

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" PRODUCTION — iController walkerfire.icontroller.eu");
  console.log(" Action: READ-ONLY sidebar DOM probe");
  console.log(" Mailbox: debiteuren@smeba.nl (id=4)");
  console.log(" Filter target: activeAccount='Collections'");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const session = await openIControllerSession("production");
  const { page, cfg } = session;

  try {
    // Step 1 — land on per-mailbox URL (matches production code path)
    const listUrl = `${cfg.url}/messages/index/mailbox/${MAILBOX_ID}`;
    console.log(`→ Navigating to ${listUrl}`);
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#messages-list, #messages-nav", { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(1500);

    // Step 2 — snapshot the sidebar in its baseline state
    console.log("→ Snapshot 1: baseline (no Account sub-filter)");
    const baseline = await snapshotSidebar(page, "baseline");
    saveJson("01-baseline-snapshot", baseline);
    saveText("01-baseline-sidebar", baseline.rootHtmlSnippet);
    await saveScreenshot(page, "01-baseline");
    console.log(`  activeAccount: ${baseline.activeAccount}`);
    console.log(`  rows in #messages-list: ${baseline.rowCount}`);
    console.log(`  anchors in sidebar: ${baseline.anchors.length}`);
    console.log(`  buttons in sidebar: ${baseline.buttons.length}`);

    // Step 3 — find a "Collections" anchor in the sidebar
    const collectionsAnchor = baseline.anchors.find(
      (a) => /^collections$/i.test(a.text) || /collections/i.test(a.text),
    );
    if (!collectionsAnchor) {
      console.log("");
      console.log("⚠️  No 'Collections' anchor in sidebar baseline.");
      console.log("    Dumping all visible anchor texts so we can spot the equivalent label:");
      for (const a of baseline.anchors.filter((x) => x.visible && x.text)) {
        console.log(`     - "${a.text}"  →  ${a.href}`);
      }
      console.log("");
      console.log("  Probe cannot escalate to Collections-active state without finding the link.");
      console.log("  Saved baseline anyway — inspect 01-baseline-* artifacts.");
      return;
    }

    console.log("");
    console.log("→ Found Collections anchor:");
    console.log(`    text: "${collectionsAnchor.text}"`);
    console.log(`    href: ${collectionsAnchor.href}`);
    console.log(`    className: ${collectionsAnchor.className}`);

    // Step 4 — click Collections to activate the sub-filter
    // BENIGN navigation only — same action an operator performs daily.
    console.log("→ Clicking Collections anchor to set sidebar Account filter…");
    const collectionsLocator = page.locator(`#messages-nav a:has-text("${collectionsAnchor.text}"), .sidebar a:has-text("${collectionsAnchor.text}")`).first();
    await collectionsLocator.click({ timeout: 5000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Step 5 — snapshot the sidebar with Collections active
    console.log("→ Snapshot 2: Collections-active state");
    const active = await snapshotSidebar(page, "collections-active");
    saveJson("02-collections-active-snapshot", active);
    saveText("02-collections-active-sidebar", active.rootHtmlSnippet);
    await saveScreenshot(page, "02-collections-active");
    console.log(`  activeAccount: ${active.activeAccount}`);
    console.log(`  rows in #messages-list: ${active.rowCount}`);
    console.log(`  URL: ${active.url}`);

    // Step 6 — diff: which anchors/buttons appeared or changed between baseline and active?
    const baselineHrefSet = new Set(baseline.anchors.map((a) => `${a.text}::${a.href}`));
    const newAnchors = active.anchors.filter(
      (a) => !baselineHrefSet.has(`${a.text}::${a.href}`),
    );
    saveJson("03-diff-new-anchors-after-activation", newAnchors);
    console.log("");
    console.log(`→ New anchors that appeared after Collections activation: ${newAnchors.length}`);
    for (const a of newAnchors.filter((x) => x.visible)) {
      console.log(`     - "${a.text}"  →  ${a.href}  [.${a.className}]`);
    }

    // Step 7 — highlight & screenshot the active element + any plausible clear-filter affordance
    console.log("");
    console.log("→ Highlighting candidates that LOOK like 'clear Account filter' affordances…");
    const highlighted = await page.evaluate(() => {
      const root =
        document.querySelector("#messages-nav") ||
        document.querySelector(".sidebar") ||
        document.body;

      // Current resetSidebarAccountFilter regexes:
      const txtRe = /^(alle\b|all\b|all accounts|alle accounts|reset)/i;
      const hrefRe = /\/account(\/0)?$|\?account=$|\?account=0$/;

      // Broader candidate net — anything that PLAUSIBLY clears a filter
      const broadTxtRe = /^(alle|all|all accounts|alle accounts|reset|clear|wis|remove|×|x\s*$|verwijder|toon alles|show all)/i;
      const broadHrefRe = /\/account(\/0)?\??$|\?account=$|\?account=0|reset|clear/i;

      const candidates: Array<{ text: string; href: string; matchedCurrent: boolean }> = [];

      root.querySelectorAll<HTMLAnchorElement>("a[href], a").forEach((a) => {
        const text = (a.textContent || "").trim();
        const href = a.getAttribute("href") || "";
        const matchedCurrent = txtRe.test(text) || hrefRe.test(href);
        const matchedBroad = broadTxtRe.test(text) || broadHrefRe.test(href);
        if (matchedCurrent || matchedBroad) {
          a.style.outline = matchedCurrent ? "3px solid #00cc55" : "3px solid #ff8800";
          a.style.outlineOffset = "2px";
          a.style.background = matchedCurrent ? "#d4f4dd" : "#ffe8cc";
          candidates.push({ text: text.slice(0, 120), href, matchedCurrent });
        }
      });

      // Also outline the active account element for visual reference
      const active = root.querySelector<HTMLElement>(
        "a.active, li.active > a, a.selected, li.selected > a, a[aria-current='page'], a[aria-current='true']",
      );
      if (active) {
        active.style.outline = "3px solid #cc0033";
        active.style.outlineOffset = "2px";
        active.style.background = "#ffe5ec";
      }
      active?.scrollIntoView({ block: "center" });

      return candidates;
    });
    saveJson("04-clear-filter-candidates", highlighted);
    await saveScreenshot(page, "03-highlighted-candidates");

    console.log(`  Candidates highlighted: ${highlighted.length}`);
    console.log("  GREEN outline = matched current regex (resetTextRe / resetHrefRe)");
    console.log("  ORANGE outline = matched broader candidate regex (potential fix targets)");
    console.log("  RED outline = currently-active Account element");
    for (const c of highlighted) {
      console.log(`     [${c.matchedCurrent ? "CURRENT" : "BROAD "}] "${c.text}" → ${c.href}`);
    }

    // Step 8 — also dump the active-element parent block in full so we can see
    // sibling close-icons that aren't <a> tags
    console.log("");
    console.log("→ Dumping the parent block of the active Account element (for close-icon discovery)…");
    const activeParentHtml = await page.evaluate(() => {
      const root =
        document.querySelector("#messages-nav") ||
        document.querySelector(".sidebar") ||
        document.body;
      const active = root.querySelector<HTMLElement>(
        "a.active, li.active > a, a.selected, li.selected > a, a[aria-current='page'], a[aria-current='true']",
      );
      if (!active) return null;
      // Walk up 2 levels to capture the row + any sibling icons
      const parent = active.parentElement?.parentElement || active.parentElement || active;
      return (parent as HTMLElement).outerHTML.slice(0, 8000);
    });
    if (activeParentHtml) {
      saveText("05-active-account-parent-block", activeParentHtml);
    }

    console.log("");
    console.log("✅ Probe complete.");
    console.log(`   Artifacts in: ${OUT_DIR}`);
    console.log("   Review:");
    console.log("    - 01-baseline-*           (sidebar before Collections click)");
    console.log("    - 02-collections-active-* (sidebar after Collections click)");
    console.log("    - 03-diff-new-anchors-*   (anchors that appeared on activation)");
    console.log("    - 04-clear-filter-candidates.json (anchors matching current vs broad regex)");
    console.log("    - 05-active-account-parent-block.html (markup around active label — look for × icons)");
    console.log("    - *.png screenshots (full page)");
  } catch (err) {
    console.error("");
    console.error("❌ Probe failed:", err);
    await saveScreenshot(page, "error-state").catch(() => null);
    throw err;
  } finally {
    await closeIControllerSession(session);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
