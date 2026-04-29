// Phase 56-00 (D-17, D-19). Read-only iController account-assignment-DOM probe.
//
// ITERATION 2 — informed by operator walkthrough 2026-04-29:
//   - Detail view at /messages/show?msg=<id>; opened via title-link click
//   - Typeahead picker accepts customer_id directly (preferred over name)
//   - No iController API for account assignment — Browserless required
//
// Usage:
//   ICONTROLLER_ENV=production pnpm tsx web/lib/automations/debtor-email/probe-label-ui.ts
//
// Output: .planning/briefs/artifacts/debtor-email-label-probe/
//   - 00-mailbox-list-*.png       (Smeba mailbox row list)
//   - 01-detail-fresh-*.png       (detail view as it loads — Accounts widget)
//   - 02-detail-typeahead-*.png   (typeahead opened with sample customer_id input)
//   - candidates.json              (DOM elements matching account/customer keywords on detail)
//   - selectors.json               (curated selectors for the Browserless module)
//
// STRICTLY READ-ONLY. Never click Save/Apply/Opslaan/Confirm. The probe
// types into the input but reverts before closing (escape).

import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";

config({ path: resolve(__dirname, "../../../.env.local") });

import {
  openIControllerSession,
  closeIControllerSession,
} from "@/lib/automations/icontroller/session";
import { captureScreenshot } from "@/lib/browser";

const ENV = (process.env.ICONTROLLER_ENV === "production"
  ? "production"
  : "acceptance") as "acceptance" | "production";

const PROBE_MAILBOX_ID = 4; // Smeba canary
const AUTOMATION = "debtor-email-label-probe";
const OUT_DIR = resolve(__dirname, "../../../../.planning/briefs/artifacts");

// Sample customer_id we'll type into the typeahead. From the contact_person
// sample data the operator pasted: 506909 (Harold van Schaijk @ voslogistics).
// We type it but DO NOT confirm — escape closes the picker without saving.
const SAMPLE_CUSTOMER_ID = "506909";

const ACCOUNT_KEYWORDS = /account|customer|debtor|klant|debiteur/i;

async function main(): Promise<void> {
  console.log(`[probe-label-ui v2] env=${ENV} mailbox=${PROBE_MAILBOX_ID}`);
  const session = await openIControllerSession(ENV);
  try {
    const { page, cfg } = session;

    // 1. Land on Smeba mailbox list.
    await page.goto(`${cfg.url}/messages/index/mailbox/${PROBE_MAILBOX_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForSelector("#messages-list", { timeout: 8000 })
      .catch(() => null);
    await captureScreenshot(page, {
      automation: AUTOMATION,
      label: "00-mailbox-list",
    });

    // 2. Find a message ID. Per operator: detail URL pattern is
    //    /messages/show?msg=<id>. We try multiple strategies because
    //    iController's link rendering may use relative href, data-attrs,
    //    or row click handlers.
    const linkScan = await page.evaluate(() => {
      // Strategy A: any anchor whose href contains msg=
      const allLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href]"),
      );
      const withMsg = allLinks
        .map((a) => ({
          href: a.getAttribute("href") || "",
          text: (a.textContent || "").trim().slice(0, 80),
        }))
        .filter((l) => /msg=\d+|messages\/show/i.test(l.href));

      // Strategy B: any element with data-msg / data-message-id / similar
      const dataEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-msg], [data-message-id], [data-id]",
        ),
      ).map((el) => ({
        tag: el.tagName,
        attrs: {
          msg: el.getAttribute("data-msg"),
          messageId: el.getAttribute("data-message-id"),
          id: el.getAttribute("data-id"),
        },
        text: (el.textContent || "").trim().slice(0, 80),
      }));

      // Strategy C: enumerate first 30 links generally for diagnosis
      const sampleAllLinks = allLinks.slice(0, 30).map((a) => ({
        href: a.getAttribute("href") || "",
        text: (a.textContent || "").trim().slice(0, 80),
      }));

      return {
        totalLinks: allLinks.length,
        withMsg,
        dataEls,
        sampleAllLinks,
      };
    });

    // Dump diagnosis BEFORE failing so we can see the page shape.
    mkdirSync(`${OUT_DIR}/${AUTOMATION}`, { recursive: true });
    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/link-scan.json`,
      JSON.stringify(linkScan, null, 2),
    );

    let msgId: string | null = null;
    for (const l of linkScan.withMsg) {
      const m = l.href.match(/msg=(\d+)/);
      if (m) {
        msgId = m[1];
        break;
      }
    }
    if (!msgId) {
      for (const d of linkScan.dataEls) {
        const cand = d.attrs.msg || d.attrs.messageId || d.attrs.id;
        if (cand && /^\d+$/.test(cand)) {
          msgId = cand;
          break;
        }
      }
    }
    if (!msgId) {
      throw new Error(
        `no msg id found (totalLinks=${linkScan.totalLinks}, withMsg=${linkScan.withMsg.length}, dataEls=${linkScan.dataEls.length}). See link-scan.json for raw page shape.`,
      );
    }
    console.log(`[probe-label-ui v2] selected message msg=${msgId}`);

    // 3. Navigate to detail view.
    const detailUrl = `${cfg.url}/messages/show?msg=${msgId}`;
    await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await captureScreenshot(page, {
      automation: AUTOMATION,
      label: "01-detail-fresh",
    });

    // 4. Scan detail-view for account/customer-related controls.
    const candidates = await page.evaluate(
      (pattern: { source: string; flags: string }) => {
        const re = new RegExp(pattern.source, pattern.flags);
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button, a, [role='button'], select, input, textarea, .btn, [data-action], [title], label, [class*='account'], [class*='customer'], [id*='account'], [id*='customer']",
          ),
        );
        return els
          .map((el) => ({
            tag: el.tagName,
            text: (el.textContent || "").trim().slice(0, 100),
            placeholder: el.getAttribute("placeholder") || "",
            title: el.getAttribute("title") || "",
            aria: el.getAttribute("aria-label") || "",
            action: el.getAttribute("data-action") || "",
            id: el.id || null,
            cls: (el.className?.toString() || "").slice(0, 200),
            name: el.getAttribute("name") || null,
            type: (el as HTMLInputElement).type || null,
            visible: el.offsetParent !== null,
          }))
          .filter((c) =>
            re.test(
              `${c.text} ${c.placeholder} ${c.title} ${c.aria} ${c.action} ${c.cls} ${c.id ?? ""} ${c.name ?? ""}`,
            ),
          );
      },
      { source: ACCOUNT_KEYWORDS.source, flags: ACCOUNT_KEYWORDS.flags },
    );

    mkdirSync(`${OUT_DIR}/${AUTOMATION}`, { recursive: true });
    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/candidates.json`,
      JSON.stringify(
        { url: page.url(), msgId, candidates, total: candidates.length },
        null,
        2,
      ),
    );
    console.log(
      `[probe-label-ui v2] ${candidates.length} account-related candidates on detail view`,
    );

    // 5. The Accounts widget is a custom element ("None selected" placeholder),
    //    not a standard <input>. We need to:
    //    (a) find the row containing the <label>Accounts</label>
    //    (b) click the widget area adjacent to it (the "None selected" pill)
    //    (c) capture the picker DOM that opens (input + dropdown)
    const accountsWidgetInfo = await page.evaluate(() => {
      // Find the <label> with text "Accounts" (case-insensitive, exact word).
      const labels = Array.from(document.querySelectorAll<HTMLElement>("label"));
      const accountsLabel = labels.find(
        (l) => /^\s*accounts\s*$/i.test(l.textContent || ""),
      );
      if (!accountsLabel) return { found: false } as const;

      // Walk siblings/parents to find the widget. Common iController patterns:
      // - <tr><td><label>Accounts</label></td><td>WIDGET</td></tr>
      // - <div class="form-row"><label>Accounts</label><div class="widget">...</div></div>
      const widgetCandidates: Array<{
        path: string;
        tag: string;
        cls: string;
        id: string | null;
        text: string;
        rect: { x: number; y: number; w: number; h: number };
      }> = [];

      // 1) Direct following sibling
      let sib = accountsLabel.nextElementSibling as HTMLElement | null;
      let depth = 0;
      while (sib && depth < 5) {
        const r = sib.getBoundingClientRect();
        widgetCandidates.push({
          path: `sibling[${depth}]`,
          tag: sib.tagName,
          cls: (sib.className?.toString() || "").slice(0, 200),
          id: sib.id || null,
          text: (sib.textContent || "").trim().slice(0, 100),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        });
        sib = sib.nextElementSibling as HTMLElement | null;
        depth++;
      }

      // 2) Parent container's children (sometimes layout uses td/td)
      let parent = accountsLabel.parentElement;
      let pdepth = 0;
      while (parent && pdepth < 3) {
        const next = parent.nextElementSibling as HTMLElement | null;
        if (next) {
          const r = next.getBoundingClientRect();
          widgetCandidates.push({
            path: `parent[${pdepth}].next`,
            tag: next.tagName,
            cls: (next.className?.toString() || "").slice(0, 200),
            id: next.id || null,
            text: (next.textContent || "").trim().slice(0, 100),
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          });
        }
        parent = parent.parentElement;
        pdepth++;
      }

      // Pick the most-likely widget: closest sibling whose text contains
      // "None selected" (placeholder we saw in screenshot 01) or has
      // form-control / select / typeahead in classes.
      const placeholderRe = /none\s+selected|geen|niets/i;
      const styleRe = /select|typeahead|form-control|dropdown|chosen|tag/i;
      const ranked = widgetCandidates
        .map((c) => ({
          ...c,
          score:
            (placeholderRe.test(c.text) ? 10 : 0) +
            (styleRe.test(c.cls) ? 5 : 0) +
            (c.rect.w > 100 ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score);

      const chosen = ranked[0];
      return {
        found: true,
        labelRect: (() => {
          const r = accountsLabel.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })(),
        candidates: ranked,
        chosenSelector: chosen
          ? chosen.id
            ? `#${chosen.id}`
            : chosen.cls
              ? `${chosen.tag.toLowerCase()}.${chosen.cls
                  .split(/\s+/)
                  .filter((c) => c)[0] ?? ""}`
              : chosen.tag.toLowerCase()
          : null,
      } as const;
    });

    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/accounts-widget-scan.json`,
      JSON.stringify(accountsWidgetInfo, null, 2),
    );

    let openedInputSelector: string | null = null;
    let pickerDom: unknown = null;
    if (accountsWidgetInfo.found && accountsWidgetInfo.chosenSelector) {
      try {
        // Click the widget to open the picker.
        await page.click(accountsWidgetInfo.chosenSelector, { timeout: 3000 });
        await page.waitForTimeout(800);
        await captureScreenshot(page, {
          automation: AUTOMATION,
          label: "02-accounts-picker-open",
        });

        // Now look for an INPUT that became visible AFTER the click.
        const pickerScan = await page.evaluate((sampleId: string) => {
          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement>("input"),
          )
            .filter((i) => i.offsetParent !== null)
            .map((i) => ({
              id: i.id || null,
              name: i.getAttribute("name"),
              placeholder: i.getAttribute("placeholder"),
              type: i.type,
              cls: i.className.slice(0, 200),
              value: i.value,
              autofocus: document.activeElement === i,
            }));
          // Also: dropdowns/listboxes that appeared
          const dropdowns = Array.from(
            document.querySelectorAll<HTMLElement>(
              "[role='listbox'], .ui-autocomplete, .typeahead, .select2-results, [class*='dropdown'], [class*='popover'], [class*='popup']",
            ),
          )
            .filter((d) => d.offsetParent !== null)
            .map((d) => ({
              tag: d.tagName,
              id: d.id || null,
              cls: d.className.slice(0, 200),
              text: (d.textContent || "").trim().slice(0, 200),
            }));
          return { sampleId, inputs, dropdowns };
        }, SAMPLE_CUSTOMER_ID);

        pickerDom = pickerScan;
        writeFileSync(
          `${OUT_DIR}/${AUTOMATION}/picker-dom.json`,
          JSON.stringify(pickerScan, null, 2),
        );

        // Type SAMPLE_CUSTOMER_ID into the autofocused (or first visible) input.
        const focused = pickerScan.inputs.find((i) => i.autofocus);
        const target = focused ?? pickerScan.inputs[0];
        if (target) {
          const sel = target.id
            ? `#${target.id}`
            : target.name
              ? `input[name="${target.name}"]`
              : target.cls
                ? `input.${target.cls.split(/\s+/).filter(Boolean)[0]}`
                : "input:focus";
          openedInputSelector = sel;
          await page.fill(sel, "");
          await page.type(sel, SAMPLE_CUSTOMER_ID, { delay: 60 });
          await page.waitForTimeout(1500);
          await captureScreenshot(page, {
            automation: AUTOMATION,
            label: "03-typeahead-filled",
          });

          // Capture results dropdown DOM
          const dropdownAfterType = await page.evaluate(() => {
            const drops = Array.from(
              document.querySelectorAll<HTMLElement>(
                "[role='listbox'], .ui-autocomplete, .typeahead, .select2-results, [class*='dropdown'], [class*='popover']",
              ),
            )
              .filter((d) => d.offsetParent !== null)
              .map((d) => ({
                tag: d.tagName,
                id: d.id || null,
                cls: d.className.slice(0, 200),
                html: d.innerHTML.slice(0, 1500),
                visible_items: Array.from(
                  d.querySelectorAll<HTMLElement>("[role='option'], li, .item"),
                )
                  .slice(0, 10)
                  .map((it) => ({
                    cls: it.className.slice(0, 120),
                    text: (it.textContent || "").trim().slice(0, 120),
                  })),
              }));
            return drops;
          });
          writeFileSync(
            `${OUT_DIR}/${AUTOMATION}/dropdown-after-type.json`,
            JSON.stringify(dropdownAfterType, null, 2),
          );
        }

        // ESCAPE — never commit the typed value.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        await page.keyboard.press("Escape");
      } catch (err) {
        console.error(`[probe-label-ui v2] picker interaction failed:`, err);
      }
    }

    // 6. Curate selectors for the Browserless module.
    const selectors = {
      list_url: `${cfg.url}/messages/index/mailbox/{mailbox_id}`,
      detail_url_template: `${cfg.url}/messages/show?msg={msg_id}`,
      sample_msg_id: msgId,
      account_input_selector: openedInputSelector,
      customer_id_typeahead_works: openedInputSelector !== null,
      candidate_count: candidates.length,
      notes:
        "Operator confirmed: typeahead accepts customer_id directly. Browserless module: navigate to detail_url_template, focus account_input_selector, type customer_id, wait 1.5s, click first dropdown result, click Save/Confirm.",
    };
    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/selectors.json`,
      JSON.stringify(selectors, null, 2),
    );
  } finally {
    await closeIControllerSession(session);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
