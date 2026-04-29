// Phase 56-00 (D-17, D-19). Read-only iController label-DOM probe.
//
// Usage:
//   ICONTROLLER_ENV=production pnpm tsx web/lib/automations/debtor-email/probe-label-ui.ts
//
// Output: .planning/briefs/artifacts/debtor-email-label-probe/
//   - 00-mailbox-list-*.png       (Smeba mailbox row list)
//   - 01-message-detail-*.png     (clicked first row, detail view)
//   - 02-label-picker-open-*.png  (likeliest candidate clicked)
//   - candidates.json              (DOM elements matching label/assign/toewijz)
//
// STRICTLY READ-ONLY. Never click Save/Apply (per D-17). Uses the default
// openIControllerSession (per D-19) so cookies are shared with the cleanup
// flow — no fresh login each probe run.

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

const LABEL_KEYWORDS =
  /label|assign|toewijz|debtor|customer|account|klant/i;

async function main(): Promise<void> {
  console.log(`[probe-label-ui] env=${ENV} mailbox=${PROBE_MAILBOX_ID}`);
  const session = await openIControllerSession(ENV);
  try {
    const { page, cfg } = session;

    // Land on the Smeba mailbox list.
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

    // Click the first row to open detail.
    const firstRow = await page.$(
      "#messages-list tr, #messages-list .message-row",
    );
    if (!firstRow) throw new Error("no message rows visible");
    await firstRow.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await captureScreenshot(page, {
      automation: AUTOMATION,
      label: "01-message-detail",
    });

    // Scan for label/assign-related controls (read-only DOM evaluate).
    const candidates = await page.evaluate(
      (pattern: { source: string; flags: string }) => {
        const re = new RegExp(pattern.source, pattern.flags);
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button, a, [role='button'], select, input, .btn, [data-action], [title], label",
          ),
        );
        return els
          .map((el) => ({
            tag: el.tagName,
            text: (el.textContent || "").trim().slice(0, 100),
            title: el.getAttribute("title") || "",
            aria: el.getAttribute("aria-label") || "",
            action: el.getAttribute("data-action") || "",
            id: el.id || null,
            cls: (el.className?.toString() || "").slice(0, 120),
            name: el.getAttribute("name") || null,
            visible: el.offsetParent !== null,
          }))
          .filter((c) =>
            re.test(
              `${c.text} ${c.title} ${c.aria} ${c.action} ${c.cls} ${c.name ?? ""}`,
            ),
          );
      },
      { source: LABEL_KEYWORDS.source, flags: LABEL_KEYWORDS.flags },
    );

    mkdirSync(`${OUT_DIR}/${AUTOMATION}`, { recursive: true });
    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/candidates.json`,
      JSON.stringify({ url: page.url(), candidates }, null, 2),
    );
    console.log(`[probe-label-ui] ${candidates.length} candidate elements`);

    // Capture label-picker state (without committing). Click the most likely
    // candidate IF it looks safe (no Save/Apply text). Otherwise just snapshot
    // the un-opened detail again.
    const safe = candidates.find(
      (c) =>
        c.visible &&
        !/save|apply|opslaan|toepassen/i.test(`${c.text} ${c.title}`),
    );
    if (safe) {
      const sel = safe.id
        ? `#${safe.id}`
        : safe.cls
          ? `${safe.tag.toLowerCase()}.${safe.cls.split(/\s+/)[0]}`
          : safe.tag.toLowerCase();
      try {
        await page.click(sel, { timeout: 3000 });
        await page.waitForTimeout(1500);
      } catch {
        /* selector synthesised — best-effort only */
      }
    }
    await captureScreenshot(page, {
      automation: AUTOMATION,
      label: "02-label-picker-open",
    });
  } finally {
    await closeIControllerSession(session);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
