import { type Page } from "playwright-core";
import { captureBeforeAfter, captureScreenshot } from "@/lib/browser";
import {
  openIControllerSession,
  closeIControllerSession,
  type IControllerEnv,
  type EnvConfig,
} from "@/lib/automations/icontroller/session";

export type { IControllerEnv, EnvConfig };

const AUTOMATION_NAME = "debtor-email-cleanup";

// findEmailViaSearch sentinels. -1 keeps the legacy "row not located"
// meaning. -2 is the distinct "the sender never even appeared in
// iController's autocomplete index" state — callers must NOT treat it as a
// generic not_found-after-scan, because no row scan happened (the filter was
// never committed; scanning the unfiltered 1,200-row inbox is exactly the
// bug we fixed).
const ROW_NOT_FOUND = -1;
const SENDER_NOT_IN_LIST = -2;

/**
 * Canonical subject normalization — the SINGLE source of truth for comparing
 * an email's subject against a rendered iController row subject.
 *
 * Lowercase + strip the truncation ellipsis iController appends to long cells
 * + collapse every whitespace run (spaces, tabs, and the newlines a
 * multi-text-node / line-wrapped cell injects) to a single space + trim.
 *
 * Used on BOTH sides of every subject comparison: the search subject is
 * normalized here in Node and passed into the page scan as `wantNormalized`,
 * and each scanned row subject is normalized by the byte-identical mirror
 * (`normRow`) inside findEmailViaSearch's page.evaluate — the page is a
 * separate JS realm and cannot import this symbol, so the mirror is kept in
 * lock-step and BOTH normalized strings (the normalized `want` plus every
 * candidate's normalized subject) are logged on a near-miss so any drift, or a
 * timestamp-gate (not subject) rejection, is immediately visible in the audit.
 *
 * (2026-06-29 fix #3) Before this, the search subject was normalized inside the
 * page next to the row subject (already symmetric), but the telemetry logged
 * neither the normalized `want` nor a per-candidate subjectOk flag — so a
 * `not_found` on a row that was visibly the target could not be attributed to
 * the subject check vs the ±60s timestamp check. This makes that attributable.
 */
export function normalizeSubject(s: string): string {
  return s
    .replace(/[…]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface EmailIdentifiers {
  /** Company name as shown in iController sidebar (used only for screenshot label) */
  company: string;
  /** iController mailbox id — when present, navigate directly to the
   *  correct mailbox folder via /messages/index/mailbox/{id}, bypassing
   *  the session-sticky sidebar Account filter that caused cross-mailbox
   *  DOM-mismatch on the post-delete verify probe (2026-05-11).
   *  Optional: legacy ad-hoc callers (webhook route, catchup script, dev
   *  test) fall back to bare /messages. Cron worker MUST pass it. */
  mailboxId?: number;
  /** Sender email address */
  from: string;
  /** Email subject line */
  subject: string;
  /** ISO date string of when the email was received */
  receivedAt: string;
}

export interface CleanupResult {
  success: boolean;
  emailFound: boolean;
  screenshots: {
    before: { path: string; url: string | null } | null;
    after: { path: string; url: string | null } | null;
  };
  error?: string;
}

/**
 * Result of committing iController's sender filter (the jQuery-UI
 * autocomplete + DataTables redraw dance).
 *
 *   "committed"     — a matching suggestion was clicked AND the filtered
 *                     redraw settled. The #messages-list rows are now
 *                     scoped to this sender; the caller may scan them.
 *   "no_suggestion" — the autocomplete menu rendered but held no <li>
 *                     matching the sender, OR rendered nothing at all. The
 *                     sender is (as far as iController's index knows) not
 *                     present. The caller MUST NOT fall back to scanning the
 *                     unfiltered inbox and report a generic not_found.
 *   "no_searchbox"  — the search input itself was never found (iController
 *                     chrome changed). Legacy fall-through.
 */
type FilterCommit = "committed" | "no_suggestion" | "no_searchbox";

/**
 * Wait for iController's DataTables redraw to SETTLE.
 *
 * DataTables renders a `.dataTables_processing` overlay (id
 * `#messages-list_processing` for this table) while an AJAX redraw is in
 * flight, then hides it when the new rows are painted. Waiting for it to be
 * hidden guarantees we don't scan rows mid-repaint. `waitFor({hidden})`
 * resolves immediately when the element is already hidden or absent, so this
 * is safe whether the redraw is fast, slow, or client-side.
 */
async function settleDataTables(page: Page): Promise<void> {
  await page
    .locator("#messages-list_processing, .dataTables_processing")
    .first()
    .waitFor({ state: "hidden", timeout: 4000 })
    .catch(() => null);
}

/**
 * Type the sender into iController's search box and commit the resulting
 * DataTables sender filter, leaving #messages-list scoped to that sender.
 *
 * iController's search box is a jQuery-UI autocomplete (confirmed 2026-05-11
 * via DOM probe): `ul.ui-autocomplete > li.ui-menu-item`. The DataTables
 * filter XHR only fires when a suggestion <li> is CLICKED — Enter on the raw
 * input does not commit a filter.
 *
 * TWO waits are load-bearing here, both for the same "scan happened before
 * the async UI settled" bug class:
 *
 *   1. (2026-06-29 fix #1) Wait for the autocomplete menu to RENDER before
 *      querying its <li> list. Without it the list was empty, no <li> was
 *      clicked, the filter never committed, and the caller paginated the
 *      full unfiltered inbox → chronic ~55% false not_found.
 *
 *   2. (2026-06-29 fix #2) Wait for the post-click DataTables REDRAW to settle
 *      before returning. The previous code armed its XHR wait BEFORE
 *      pressSequentially, so the autocomplete SUGGESTION XHR (which also hits
 *      /messages) satisfied it and `await waitForXhr` returned immediately;
 *      the caller then scanned the stale/pre-redraw row set and missed the row
 *      that was about to render at the top (verified: a row visible at the top
 *      of the filtered list still came back not_found, with `nearest`
 *      telemetry weeks off-target). The fix arms the redraw wait AFTER the
 *      suggestion XHR has fired (menu is up) and BEFORE the click, so the next
 *      matching XHR is the filter redraw — then waits for the processing
 *      overlay to clear on top of that.
 */
async function commitSenderFilter(page: Page, from: string): Promise<FilterCommit> {
  // Try a few common placeholders / selectors for the search input. The
  // "Search in mails..." placeholder was observed in production.
  const searchSelectors = [
    'input[placeholder="Search in mails..."]',
    'input[placeholder*="Search in mails"]',
    'input[placeholder*="Search"]',
    ".dataTables_filter input",
    "#messages-list_filter input",
    'input[type="search"]',
  ];

  for (const sel of searchSelectors) {
    const input = page.locator(sel).first();
    if (!(await input.isVisible({ timeout: 800 }).catch(() => false))) continue;

    await input.fill("");
    // Type with real keystrokes so the jQuery-UI autocomplete fires its
    // suggestion XHR. `.fill()` sets the value in one shot and does NOT
    // reliably trigger the autocomplete search.
    await input.pressSequentially(from, { delay: 15 });

    // Fix #1: wait for the suggestion menu to render before we query it.
    const menuShown = await page
      .locator("ul.ui-autocomplete:visible li.ui-menu-item")
      .first()
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    // Fix #2: arm the filter-redraw wait HERE — after the suggestion XHR has
    // already fired (menu is up) and before the click. Timing-scoped rather
    // than URL-scoped so the autocomplete suggestion request can't satisfy it
    // (it already resolved); the next matching XHR is the DataTables filter
    // redraw the click triggers.
    const waitForFilterXhr = page
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
        { timeout: 5000 },
      )
      .catch(() => null);

    // Click the suggestion whose text starts with the sender email. Match on
    // the bare email (not `email (`) so senders WITHOUT a display name —
    // whose suggestion is just the address — still match.
    const want = from.toLowerCase();
    const clicked = await page
      .locator("ul.ui-autocomplete:visible li.ui-menu-item")
      .evaluateAll((items, prefix) => {
        for (const li of items) {
          const txt = (li.textContent || "").trim().toLowerCase();
          if (txt.startsWith(prefix)) {
            (li as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, want)
      .catch(() => false);

    if (clicked) {
      await waitForFilterXhr;
      // Close the autocomplete dropdown so it doesn't overlay the rows in
      // preview screenshots. The DataTables filter is already committed
      // server-side via the click, so blurring can't un-filter it.
      await input.blur().catch(() => null);
      // Fix #2 continued: the XHR resolving is necessary but the row
      // re-paint can lag it — wait for the processing overlay to clear.
      await settleDataTables(page);
      return "committed";
    }

    // No matching suggestion was clickable.
    if (!menuShown) {
      // The menu never rendered. Preserve the legacy best-effort: a unique
      // sender can auto-select on Enter in some iController builds. Give it
      // one shot, then treat as committed (the scan will confirm or not).
      await input.press("Enter").catch(() => null);
      await waitForFilterXhr;
      await settleDataTables(page);
      return "committed";
    }

    // The menu rendered but held no <li> for this sender → genuinely absent.
    await input.blur().catch(() => null);
    return "no_suggestion";
  }

  return "no_searchbox";
}

/**
 * Find a specific email via iController's search box, independent of the
 * sidebar (company) filter.
 *
 * Why: the sidebar scopes the list to one Account label, but the same
 * debiteuren@smeba.nl mailbox is shared across many accounts (Hans Anders,
 * Holland & Barrett, HEMA T.a.v., smebabrandbeveiliging, …). Filtering by a
 * single sidebar item makes cross-account items invisible and findEmail
 * would return -1 even when the message exists.
 *
 * Match rule:
 *   sender email in search box → for each result row, require subject match
 *   (normalizeSubject on BOTH sides, bidirectional substring to tolerate
 *   iController's cell truncation) AND received_at within ±60 s of ours
 *   (covers delivery drift between Outlook and iController's ingest clock).
 *
 *   If multiple rows satisfy both, pick the first. Rationale: vendors
 *   like Lidl and Unica batch-insert N identical payment-notification
 *   emails within 1-2s of each other; our inbox holds N identical
 *   copies to delete. Any 1:1 pairing is correct — set semantics, not
 *   row identity. The previous "ambiguous → skip" policy left these
 *   permanently stuck.
 *
 * Returns a row index, or one of the ROW_NOT_FOUND / SENDER_NOT_IN_LIST
 * sentinels (see their declarations).
 */
async function findEmailViaSearch(
  page: Page,
  email: EmailIdentifiers,
  maxPages = 10,
): Promise<number> {
  // Phase 76 hotfix (2026-05-07): fail fast with a typed error when the
  // queue payload is missing identifiers. Without this guard, Playwright
  // throws the generic `locator.fill: value: expected string, got undefined`,
  // which masks the real cause (a producer not merging email fields into
  // the automation_runs.result jsonb).
  if (typeof email.from !== "string" || !email.from) {
    throw new Error(
      "findEmailViaSearch: missing email.from on queue payload (producer schema drift)",
    );
  }
  if (typeof email.subject !== "string") {
    throw new Error(
      "findEmailViaSearch: missing email.subject on queue payload (producer schema drift)",
    );
  }
  if (typeof email.receivedAt !== "string") {
    throw new Error(
      "findEmailViaSearch: missing email.receivedAt on queue payload (producer schema drift)",
    );
  }

  // Commit the sender filter (autocomplete + DataTables redraw). Only scan
  // rows once the list is actually sender-scoped.
  const commit = await commitSenderFilter(page, email.from);
  if (commit === "no_searchbox") return ROW_NOT_FOUND;
  if (commit === "no_suggestion") return SENDER_NOT_IN_LIST;

  const targetMs = new Date(email.receivedAt).getTime();
  if (Number.isNaN(targetMs)) return ROW_NOT_FOUND;

  // Normalize the search subject ONCE, in Node, with the canonical helper.
  // This exact string is passed into the page scan as `wantNormalized` so the
  // search side and the row side are normalized by lock-stepped code, and it
  // is logged in the near-miss telemetry so a subject-gate vs timestamp-gate
  // rejection is distinguishable from the audit row.
  const wantNormalized = normalizeSubject(email.subject);

  // iController displays timestamps in Europe/Amsterdam local time.
  // In April → CEST (UTC+2). The offset-lookup is done once outside
  // the row loop for speed and is good enough for production; DST
  // transition edges are narrow and not worth the extra complexity.
  const amsterdamOffsetMs = (() => {
    const d = new Date(email.receivedAt);
    const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
    const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    return ams.getTime() - utc.getTime();
  })();

  // Debug telemetry: collect the nearest candidates so a no-match response
  // carries actionable info back to the caller's log row. `subjectOk` per
  // candidate is the load-bearing field — it tells whether a near-miss failed
  // the SUBJECT check or only the ±60s timestamp check.
  const debugCandidates: Array<{ subj: string; ts: string; dtSec: number; subjectOk: boolean }> = [];

  for (let pg = 0; pg < maxPages; pg++) {
    await page.waitForSelector("#messages-list", { timeout: 5000 }).catch(() => null);
    const isEmpty = await page
      .locator(".dataTables_empty")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isEmpty) break;

    const { hits, pageCandidates } = await page.evaluate(
      ({ wantNormalized, targetMs, toleranceMs, offsetMs }) => {
        const reTs = /(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})/;
        // MIRROR of normalizeSubject() (Node side) — MUST stay in lock-step.
        // The page is a separate JS realm, so the canonical helper can't be
        // imported here; `want` is already normalized in Node by
        // normalizeSubject and any divergence between the two surfaces in the
        // near-miss telemetry below (`want` vs each candidate `subj`).
        const normRow = (s: string) =>
          s.replace(/[…]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

        const rows = Array.from(
          document.querySelectorAll<HTMLTableRowElement>("#messages-list tbody tr"),
        );
        const hits: number[] = [];
        const pageCandidates: Array<{ subj: string; ts: string; dtSec: number; subjectOk: boolean }> = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const txt = row.textContent ?? "";
          if (txt.includes("No data available")) continue;

          // Scan every cell: pick the longest text cell that isn't an
          // email address or a pure datestamp. Observed 2026-04-23: the
          // old "longest alphabetic cell" rule picked the sender-email
          // cell (`administratie@fire-contro…`) for auto-reply rows,
          // causing subject-match false negatives. Prefer the cell's
          // `title` attribute (iController stores the full, untruncated
          // subject there) over the possibly-clipped textContent.
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
          let subjectText = "";
          for (const c of cells) {
            const raw = (c.getAttribute("title") || c.textContent || "").trim();
            if (!/[a-z]/i.test(raw)) continue;
            if (/\S@\S/.test(raw) && !/\s/.test(raw)) continue;
            if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(raw)) continue;
            if (raw.length > subjectText.length) subjectText = raw;
          }
          subjectText = normRow(subjectText);

          const tsMatch = txt.match(reTs);
          if (!tsMatch) continue;
          const [, y, mo, d, hh, mm, ss] = tsMatch;
          // Build UTC ms from Amsterdam-local components.
          const rowUtcMs =
            Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - offsetMs;
          if (Number.isNaN(rowUtcMs)) continue;

          const dt = Math.abs(rowUtcMs - targetMs);
          // Bidirectional substring match tolerates both CSS truncation
          // (DOM has "…" or is clipped) and row-text-with-extra-suffix.
          // Both sides are normalized by the same logic (normalizeSubject in
          // Node → wantNormalized; normRow here → subjectText).
          const subjectOk =
            subjectText.includes(wantNormalized) ||
            (wantNormalized.length > 20 && wantNormalized.includes(subjectText) && subjectText.length > 20);

          pageCandidates.push({ subj: subjectText.slice(0, 80), ts: tsMatch[0], dtSec: Math.round(dt / 1000), subjectOk });
          if (subjectOk && dt <= toleranceMs) hits.push(i);
        }
        return { hits, pageCandidates };
      },
      // ±60s: debug run 2026-04-23 showed exact-subject matches getting
      // rejected because 15s was narrower than real delivery drift
      // between the mailbox and iController's ingest clock.
      { wantNormalized, targetMs, toleranceMs: 60_000, offsetMs: amsterdamOffsetMs },
    );

    for (const c of pageCandidates) debugCandidates.push(c);

    // Any hit is good enough — pick the first. See match rule in the
    // function's top comment for why multi-hit is now treated as OK.
    if (hits.length >= 1) return hits[0];

    const advanced = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        "#messages-list_paginate .paginate_button.next:not(.disabled), .dataTables_paginate .paginate_button.next:not(.disabled)",
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!advanced) break;
    // Pagination click also triggers a DataTables XHR — wait on that
    // instead of a blind 1500ms. Falls through at 4s if the endpoint
    // doesn't emit a recognizable URL.
    await page
      .waitForResponse(
        (r) => {
          const u = r.url();
          return (
            r.request().resourceType() === "xhr" &&
            (u.includes("/messages") || u.includes("DataTables") || u.includes("draw="))
          );
        },
        { timeout: 4000 },
      )
      .catch(() => null);
    // Settle the per-page redraw too, for the same reason as the filter
    // commit: don't scan the next page mid-repaint.
    await settleDataTables(page);
  }

  // Stash debug info on the page so the caller can retrieve it. Include the
  // normalized `want` alongside the nearest candidates (each carrying its own
  // `subjectOk`) so a no-match is attributable: subjectOk:false everywhere →
  // subject normalization/extraction problem; subjectOk:true with a large
  // dtSec → the ±60s timestamp gate rejected an otherwise-correct row.
  await page
    .evaluate((payload) => {
      (window as unknown as { __debtorDebug?: unknown }).__debtorDebug = payload;
    }, {
      want: wantNormalized,
      nearest: debugCandidates.sort((a, b) => a.dtSec - b.dtSec).slice(0, 6),
    })
    .catch(() => null);

  return ROW_NOT_FOUND;
}

/** Read debug candidates stashed by findEmailViaSearch. Empty if none. */
async function readSearchDebug(page: Page): Promise<string> {
  try {
    const d = await page.evaluate(
      () =>
        (window as unknown as { __debtorDebug?: unknown }).__debtorDebug ?? null,
    );
    if (!d) return "";
    return ` [search-debug: ${JSON.stringify(d)}]`;
  } catch {
    return "";
  }
}

/**
 * After Pass 1 deletes a row, confirm the SPECIFIC iController message
 * id is gone from the result set. Sender-search pre-filters the inbox to
 * one sender; then we check the DOM for `<input name="message[]" value="{id}">`.
 *
 * Why id-based, not subject+timestamp: senders like Lidl, Unica, and
 * vendor auto-replies often produce N identical-subject rows within the
 * 60-second match tolerance. The old verify-pass re-ran subject+timestamp
 * search and found a sibling, then reported "still present" — a false
 * positive that drove a chronic 36% failure rate (2026-05-19 root-cause
 * investigation, `.planning/debug/icontroller-bulkdelete-failures.md`).
 *
 * The id we check is iController's internal numeric `message[]` value —
 * the same value `selectAndDelete` POSTs to bulkDelete. Stable across
 * the post-delete page reload.
 *
 * Returns true when the id is no longer present (delete confirmed).
 */
async function verifyMessageGone(
  page: Page,
  email: EmailIdentifiers,
  deletedMessageId: string,
): Promise<boolean> {
  if (typeof email.from !== "string" || !email.from) {
    throw new Error(
      "verifyMessageGone: missing email.from on queue payload (producer schema drift)",
    );
  }
  // Re-trigger the sender-scoped search so the DataTables result set is
  // narrowed to one sender — keeps the DOM small and avoids paginating
  // 1200+ rows just to confirm a single delete. Uses the same commit helper
  // as findEmailViaSearch, so the post-click redraw is settled before we
  // probe the DOM. Without that settle this could probe the UNFILTERED
  // pre-redraw inbox: after a FAILED delete the still-present id may sit on
  // a later (un-rendered) page → falsely reported gone (a false delete
  // confirmation). no_suggestion / no_searchbox fall through to the bare DOM
  // check (best-effort; after a real delete the id is absent regardless).
  // This path is id-based, not subject-based, so subject normalization does
  // not apply here.
  await commitSenderFilter(page, email.from).catch(() => null);

  return page
    .evaluate((id) => {
      const sel = `#messages-list input[name="message[]"][value="${id}"]`;
      return document.querySelector(sel) === null;
    }, deletedMessageId)
    .catch(() => false);
}

/**
 * Scroll matched row into view and apply red outline + pink background
 * so screenshots visually point to the target.
 */
async function highlightRow(page: Page, rowIndex: number): Promise<string | null> {
  return page.evaluate((i) => {
    const row = document.querySelectorAll("#messages-list tbody tr")[i] as HTMLElement | undefined;
    if (!row) return null;
    row.scrollIntoView({ block: "center" });
    row.style.outline = "3px solid #ff0033";
    row.style.outlineOffset = "-3px";
    row.style.background = "#ffe5ec";
    return Array.from(row.querySelectorAll("td"))
      .map((td) => td.textContent?.trim() || "")
      .join(" | ");
  }, rowIndex);
}

/**
 * Delete the row at rowIndex by POSTing directly to iController's
 * Intercooler.js bulkDelete endpoint, bypassing the checkbox+button UI dance.
 *
 * Why direct POST instead of clicking:
 *   The trash toolbar button is an Intercooler.js action — the markup is
 *
 *     <button class="delete-bulk bulk-action" ic=""
 *             href="/messages/bulkDelete/_token/{csrf}"
 *             data-success-message="Message(s) deleted successfully. [link]Undo[/link]">
 *
 *   and rows carry `<input name="message[]" value="{message_id}">`. Intercooler
 *   serializes the `:checked` `message[]` inputs at button-click time and POSTs
 *   them to the href. The `data-success-message` toast renders on ANY 2xx
 *   response — it does not reflect what was actually deleted.
 *
 *   Playwright's `checkbox.click()` toggles the DOM `:checked` state but does
 *   not reliably fire the change event Intercooler's selection-state listeners
 *   expect (binding happens after DataTables row render — racey). On race-loss
 *   the framework's selected-set is empty at click time, the POST goes out
 *   with no `message[]` entries, the server returns 2xx ("deleted 0 rows"),
 *   the success toast fires, and the row remains in the inbox. That was the
 *   sustained 49% failure rate observed across all four mailboxes from
 *   2026-05-08 onward — confirmed 2026-05-11 by inspecting the button DOM
 *   (Intercooler `ic=""` attribute + static success-message template) and
 *   confirming deleted rows were NOT in iController's Trash folder.
 *
 * Direct POST removes the entire click-race surface:
 *   - we read the message_id from the row's checkbox `value`
 *   - we read the bulkDelete URL (CSRF token baked in) from the button's `href`
 *   - we POST `message[]={id}` via page.request — same cookie jar as the
 *     browser session, so auth travels with it
 *   - response status is the truth, not an optimistic toast
 */
async function selectAndDelete(page: Page, rowIndex: number): Promise<string> {
  const rowSelector = `#messages-list tbody tr:nth-child(${rowIndex + 1})`;

  const extracted = await page.evaluate((sel) => {
    const row = document.querySelector(sel) as HTMLElement | null;
    if (!row) return { error: "row not found at nth-child index" } as const;
    const cb = row.querySelector<HTMLInputElement>('input[name="message[]"]');
    if (!cb || !cb.value) {
      return { error: "row has no message[] checkbox with a value" } as const;
    }
    const btn = document.querySelector<HTMLElement>(".delete-bulk.bulk-action");
    if (!btn) {
      return { error: ".delete-bulk.bulk-action button not found in DOM" } as const;
    }
    const href = btn.getAttribute("href");
    if (!href) {
      return { error: "delete button has no href (CSRF token missing)" } as const;
    }
    return { messageId: cb.value, deleteUrl: href } as const;
  }, rowSelector);

  if ("error" in extracted) {
    throw new Error(`selectAndDelete: ${extracted.error}`);
  }

  // href is a path like `/messages/bulkDelete/_token/{csrf}` — prepend the
  // page's origin. Using page.url() rather than threading cfg.url through
  // the signature keeps the call site untouched.
  const baseUrl = new URL(page.url()).origin;
  const fullUrl = extracted.deleteUrl.startsWith("http")
    ? extracted.deleteUrl
    : `${baseUrl}${extracted.deleteUrl}`;

  const res = await page.request.post(fullUrl, {
    form: { "message[]": extracted.messageId },
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
  });

  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `bulkDelete POST ${fullUrl} returned ${res.status()} ${res.statusText()}: ${body.slice(0, 200)}`,
    );
  }

  // No DOM-settle wait needed — the in-page DataTables doesn't know we
  // bypassed it, and Pass 2's `page.goto(listUrl)` does a fresh navigation
  // anyway, which reflects authoritative server state.
  return extracted.messageId;
}

export interface PreviewResult {
  success: boolean;
  emailFound: boolean;
  rowIndex: number;
  rowPreview: string | null;
  screenshot: { path: string; url: string | null } | null;
  error?: string;
}

/**
 * Dry-run: login, navigate, find the email, capture a before-screenshot.
 * Does NOT delete. For production safety gate — user inspects screenshot
 * before we re-run with the delete path.
 */
export async function findAndPreviewEmail(
  email: EmailIdentifiers,
  env?: IControllerEnv,
): Promise<PreviewResult> {
  const session = await openIControllerSession(env);
  const { page } = session;

  try {
    const rowIndex = await findEmailViaSearch(page, email);
    if (rowIndex < 0) {
      const debug = await readSearchDebug(page);
      // Keep an "Email not found" substring in every miss so the worker's
      // not_found classifier (browser-agnostic regex) stays backward
      // compatible, but distinguish the sender-absent case for the audit log.
      const reason =
        rowIndex === SENDER_NOT_IN_LIST
          ? `Email not found (sender ${email.from} not in iController autocomplete index — filter not committed, inbox NOT scanned)`
          : `Email not found: "${email.subject}" from ${email.from}${debug}`;
      const shot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `preview-email-not-found`,
      });
      return {
        success: false,
        emailFound: false,
        rowIndex: -1,
        rowPreview: null,
        screenshot: shot,
        error: reason,
      };
    }

    const rowPreview = await highlightRow(page, rowIndex);
    await page.waitForTimeout(400);

    const shot = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: `preview-before-delete-${email.company}`,
    });

    return {
      success: true,
      emailFound: true,
      rowIndex,
      rowPreview,
      screenshot: shot,
    };
  } catch (error) {
    const shot = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: "preview-error",
    }).catch(() => null);
    return {
      success: false,
      emailFound: false,
      rowIndex: -1,
      rowPreview: null,
      screenshot: shot,
      error: String(error),
    };
  } finally {
    await closeIControllerSession(session);
  }
}

/**
 * Search + delete one email against an already-opened iController page.
 * Caller is responsible for opening/closing the session. Before returning
 * to /messages for the next item, we re-navigate so the search box is
 * reset — otherwise residual filter state leaks into the next iteration.
 */
export async function deleteEmailOnPage(
  page: Page,
  cfg: EnvConfig,
  email: EmailIdentifiers,
): Promise<CleanupResult> {
  try {
    // Land directly in the target mailbox folder via the per-mailbox URL
    // when caller supplied an id. Previously we always navigated to bare
    // `/messages`, which inherits whatever sidebar Account filter the
    // iController session last had selected — that made Pass 1 (find)
    // and Pass 2 (verify) see different row populations across mailboxes
    // (smeba.nl / smeba-fire / fire-control), producing the "Delete
    // verification failed" false positives. Scoping by mailbox id is
    // deterministic and removes that failure class.
    const listUrl = email.mailboxId !== undefined
      ? `${cfg.url}/messages/index/mailbox/${email.mailboxId}`
      : `${cfg.url}/messages`;
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector("#messages-list", { timeout: 6000 })
      .catch(() => null);

    const rowIndex = await findEmailViaSearch(page, email);
    if (rowIndex < 0) {
      const debug = await readSearchDebug(page);
      // Distinguish "sender absent from iController's index" (filter never
      // committed, inbox deliberately NOT scanned) from "scanned the
      // sender-filtered list and the row wasn't there". Both keep an "Email
      // not found" substring so the worker classifies not_found (not failed).
      const reason =
        rowIndex === SENDER_NOT_IN_LIST
          ? `Email not found (sender ${email.from} not in iController autocomplete index — filter not committed, inbox NOT scanned)`
          : `Email not found: "${email.subject}" from ${email.from}${debug}`;
      const errorScreenshot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `email-not-found`,
      });
      return {
        success: false,
        emailFound: false,
        screenshots: { before: errorScreenshot, after: null },
        error: reason,
      };
    }

    await highlightRow(page, rowIndex);
    await page.waitForTimeout(400);

    let deletedMessageId = "";
    const audit = await captureBeforeAfter(
      page,
      AUTOMATION_NAME,
      `delete-${email.company}`,
      async () => {
        deletedMessageId = await selectAndDelete(page, rowIndex);
      },
    );

    // Post-delete verification (2026-05-19 rewrite): verify the SPECIFIC
    // iController message_id is gone, not "some row matching subject+time".
    // The prior subject+timestamp re-search false-positived whenever a
    // sibling row (same sender, identical subject within 60s, or different
    // sender with substring-matching subject within 60s) was still in the
    // inbox — driving ~36% chronic verify failures across all 4 mailboxes
    // even though the bulkDelete POST had succeeded.
    await page.goto(listUrl, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector("#messages-list", { timeout: 6000 })
      .catch(() => null);
    let gone = await verifyMessageGone(page, email, deletedMessageId);
    if (!gone) {
      // Single retry after 2 s — handles transient XHR cache lag on iController's side.
      await page.waitForTimeout(2000);
      await page.goto(listUrl, { waitUntil: "domcontentloaded" });
      await page
        .waitForSelector("#messages-list", { timeout: 6000 })
        .catch(() => null);
      gone = await verifyMessageGone(page, email, deletedMessageId);
    }
    if (!gone) {
      return {
        success: false,
        emailFound: true,
        screenshots: { before: audit.before, after: audit.after },
        error: `Delete verification failed: iController message_id=${deletedMessageId} still present after bulkDelete POST`,
      };
    }

    return {
      success: true,
      emailFound: true,
      screenshots: { before: audit.before, after: audit.after },
    };
  } catch (error) {
    const errorScreenshot = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: "error",
    }).catch(() => null);

    return {
      success: false,
      emailFound: false,
      screenshots: { before: errorScreenshot, after: null },
      error: String(error),
    };
  }
}

/**
 * Find and delete a single email in iController (one-off path used by the
 * review-UI server action). Opens a fresh session, deletes, closes.
 * For batch flows the cron uses openIControllerSession + deleteEmailOnPage
 * directly so the login cost is amortized.
 */
export async function deleteEmailFromIController(
  email: EmailIdentifiers,
  env?: IControllerEnv,
): Promise<CleanupResult> {
  const session = await openIControllerSession(env);
  try {
    return await deleteEmailOnPage(session.page, session.cfg, email);
  } finally {
    await closeIControllerSession(session);
  }
}
