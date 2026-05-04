// Phase 67 (R-01) — search-and-click helper for the iController mailbox-list
// DataTable. Mirrors web/lib/automations/debtor-email-cleanup/browser.ts
// findEmailViaSearch (sender + subject + received_at match within ±60s) but
// CLICKS the row's title link → navigates to /messages/show?msg=<N>.
//
// Returns { found, detail_url, icontroller_msg_id, debug? }. On miss the
// tagger surfaces a "message_not_found" failure with nearest-candidate debug
// info for operator triage in Bulk Review.
//
// IMPORTANT: caller MUST already have the page on the mailbox-list URL
// (see buildIcontrollerMessageUrl + page.goto). This helper performs the
// search-input fill + DataTables-XHR wait + row walk + click into detail.

import { type Page } from "playwright-core";

export interface FindMessageRowInput {
  sender_email: string;
  subject: string;
  received_at: string; // ISO8601
}

export interface FindMessageRowResult {
  found: boolean;
  detail_url: string | null;
  icontroller_msg_id: number | null;
  debug?: string;
}

const SEARCH_SELECTORS = [
  'input[placeholder="Search in mails..."]',
  'input[placeholder*="Search in mails"]',
  'input[placeholder*="Search"]',
  ".dataTables_filter input",
  "#messages-list_filter input",
  'input[type="search"]',
];

function parseMsgIdFromUrl(url: string): number | null {
  const m = url.match(/[?&]msg=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function findMessageRow(
  page: Page,
  input: FindMessageRowInput,
  maxPages = 10,
): Promise<FindMessageRowResult> {
  // 1. Fill the search box with sender_email — same selector cascade as
  //    cleanup/browser.ts findEmailViaSearch.
  let typed = false;
  for (const sel of SEARCH_SELECTORS) {
    const inputLoc = page.locator(sel).first();
    if (await inputLoc.isVisible({ timeout: 800 }).catch(() => false)) {
      await inputLoc.fill("");
      const waitForXhr = page
        .waitForResponse(
          (r) => {
            const u = r.url();
            return (
              r.request().resourceType() === "xhr" &&
              (u.includes("/messages") ||
                u.includes("DataTables") ||
                u.includes("draw="))
            );
          },
          { timeout: 4000 },
        )
        .catch(() => null);
      await inputLoc.fill(input.sender_email);
      await inputLoc.press("Enter").catch(() => null);
      await waitForXhr;
      typed = true;
      break;
    }
  }
  if (!typed) {
    return {
      found: false,
      detail_url: null,
      icontroller_msg_id: null,
      debug: "search input not found",
    };
  }

  const targetMs = new Date(input.received_at).getTime();
  if (Number.isNaN(targetMs)) {
    return {
      found: false,
      detail_url: null,
      icontroller_msg_id: null,
      debug: `invalid received_at: ${input.received_at}`,
    };
  }

  // iController displays timestamps in Europe/Amsterdam local time.
  const amsterdamOffsetMs = (() => {
    const d = new Date(input.received_at);
    const ams = new Date(
      d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }),
    );
    const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    return ams.getTime() - utc.getTime();
  })();

  const debugCandidates: Array<{ subj: string; ts: string; dtSec: number }> =
    [];

  for (let pg = 0; pg < maxPages; pg++) {
    await page
      .waitForSelector("#messages-list", { timeout: 5000 })
      .catch(() => null);
    const isEmpty = await page
      .locator(".dataTables_empty")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isEmpty) break;

    const { hits, pageCandidates } = await page.evaluate(
      ({ wantSubject, targetMs, toleranceMs, offsetMs }) => {
        const reTs = /(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})/;
        const norm = (s: string) =>
          s
            .replace(/[…]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        const rows = Array.from(
          document.querySelectorAll<HTMLTableRowElement>(
            "#messages-list tbody tr",
          ),
        );
        const hits: number[] = [];
        const pageCandidates: Array<{
          subj: string;
          ts: string;
          dtSec: number;
        }> = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const txt = row.textContent ?? "";
          if (txt.includes("No data available")) continue;

          const cells = Array.from(
            row.querySelectorAll<HTMLTableCellElement>("td"),
          );
          let subjectText = "";
          for (const c of cells) {
            const raw = (
              c.getAttribute("title") ||
              c.textContent ||
              ""
            ).trim();
            if (!/[a-z]/i.test(raw)) continue;
            if (/\S@\S/.test(raw) && !/\s/.test(raw)) continue;
            if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(raw)) continue;
            if (raw.length > subjectText.length) subjectText = raw;
          }
          subjectText = norm(subjectText);

          const tsMatch = txt.match(reTs);
          if (!tsMatch) continue;
          const [, y, mo, d, hh, mm, ss] = tsMatch;
          const rowUtcMs =
            Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - offsetMs;
          if (Number.isNaN(rowUtcMs)) continue;

          const dt = Math.abs(rowUtcMs - targetMs);
          const want = norm(wantSubject);
          const subjectOk =
            subjectText.includes(want) ||
            (want.length > 20 &&
              want.includes(subjectText) &&
              subjectText.length > 20);

          pageCandidates.push({
            subj: subjectText.slice(0, 60),
            ts: tsMatch[0],
            dtSec: Math.round(dt / 1000),
          });
          if (subjectOk && dt <= toleranceMs) hits.push(i);
        }
        return { hits, pageCandidates };
      },
      // ±60s tolerance — production-validated by cleanup-worker.
      {
        wantSubject: input.subject,
        targetMs,
        toleranceMs: 60_000,
        offsetMs: amsterdamOffsetMs,
      },
    );

    for (const c of pageCandidates) debugCandidates.push(c);

    if (hits.length >= 1) {
      // 4. On hit: locate the row's title link and click it.
      //    The subject column typically has the only <a> in the row pointing
      //    to /messages/show?msg=N. Click the first such anchor; fall back
      //    to clicking the longest text cell.
      const rowIndex = hits[0];
      const rowSelector = `#messages-list tbody tr:nth-child(${rowIndex + 1})`;
      const titleLink = page
        .locator(`${rowSelector} a[href*="/messages/show"]`)
        .first();
      const navPromise = page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 })
        .catch(() => null);
      const hasLink = await titleLink
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (hasLink) {
        await titleLink.click().catch(() => null);
      } else {
        // Fallback: click the row itself.
        await page
          .locator(rowSelector)
          .first()
          .click()
          .catch(() => null);
      }
      await navPromise;

      const detailUrl = page.url();
      const msgId = parseMsgIdFromUrl(detailUrl);
      if (msgId === null) {
        return {
          found: false,
          detail_url: null,
          icontroller_msg_id: null,
          debug: `clicked row but URL has no msg= param: ${detailUrl}`,
        };
      }
      return {
        found: true,
        detail_url: detailUrl,
        icontroller_msg_id: msgId,
      };
    }

    const advanced = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        "#messages-list_paginate .paginate_button.next:not(.disabled), .dataTables_paginate .paginate_button.next:not(.disabled)",
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!advanced) break;
    await page
      .waitForResponse(
        (r) => {
          const u = r.url();
          return (
            r.request().resourceType() === "xhr" &&
            (u.includes("/messages") ||
              u.includes("DataTables") ||
              u.includes("draw="))
          );
        },
        { timeout: 4000 },
      )
      .catch(() => null);
  }

  // Miss — surface nearest candidates as debug info.
  const debug = `[nearest: ${JSON.stringify(
    debugCandidates.sort((a, b) => a.dtSec - b.dtSec).slice(0, 5),
  )}]`;
  return {
    found: false,
    detail_url: null,
    icontroller_msg_id: null,
    debug,
  };
}
