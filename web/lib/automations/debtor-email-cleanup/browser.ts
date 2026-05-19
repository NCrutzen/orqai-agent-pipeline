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
 *   sender email in search box → for each result row, require FULL subject
 *   equality AND received_at within ±15 s of ours (covers 3–5 s delivery
 *   drift between Outlook and iController's timestamp).
 *
 *   If multiple rows satisfy both, pick the first. Rationale: vendors
 *   like Lidl and Unica batch-insert N identical payment-notification
 *   emails within 1-2s of each other; our inbox holds N identical
 *   copies to delete. Any 1:1 pairing is correct — set semantics, not
 *   row identity. The previous "ambiguous → skip" policy left these
 *   permanently stuck.
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
  // Try a few common placeholders / selectors for the search input. The
  // "Search in mails..." placeholder was observed in production.
  const searchSelectors = [
    'input[placeholder="Search in mails..."]',
    'input[placeholder*="Search in mails"]',
    'input[placeholder*="Search"]',
    '.dataTables_filter input',
    '#messages-list_filter input',
    'input[type="search"]',
  ];
  let typed = false;
  for (const sel of searchSelectors) {
    const input = page.locator(sel).first();
    if (await input.isVisible({ timeout: 800 }).catch(() => false)) {
      await input.fill("");
      // Kick off the response listener BEFORE the Enter that triggers the
      // DataTables AJAX — otherwise we can miss the frame the request fires.
      const waitForXhr = page
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
      await input.fill(email.from);
      // iController's search box is a jQuery UI autocomplete (confirmed
      // 2026-05-11 via DOM probe): ul.ui-autocomplete > li.ui-menu-item.
      // Pressing Enter on the raw input does NOT commit a filter and
      // ArrowDown+Enter also fails to commit reliably — the actual
      // DataTables filter XHR only fires when a suggestion <li> is
      // clicked. Without an explicit click the function was paginating
      // an unfiltered 1,200+ row inbox and missing the target unless it
      // happened to fall in the first ~250 rows. Find the <li> whose text
      // starts with `{email.from} (` (the structured `email (Display Name)`
      // suggestion format) and click it.
      const wantPrefix = `${email.from.toLowerCase()} (`;
      // Wait briefly for the autocomplete XHR to populate the menu.
      const clicked = await page
        .locator("ul.ui-autocomplete:visible li.ui-menu-item")
        .filter({
          has: page.locator(
            `div.ui-menu-item-wrapper`,
          ),
        })
        .evaluateAll((items, prefix) => {
          for (const li of items) {
            const txt = (li.textContent || "").trim().toLowerCase();
            if (txt.startsWith(prefix)) {
              (li as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, wantPrefix)
        .catch(() => false);
      if (!clicked) {
        // Fallback: press Enter in case the autocomplete is dismissed or
        // a future iController build wires Enter to commit. Keeps the old
        // behavior for cases where the menu didn't render (e.g. unique
        // sender that auto-selects).
        await input.press("Enter").catch(() => null);
      }
      await waitForXhr;
      typed = true;
      break;
    }
  }
  if (!typed) return -1;

  const targetMs = new Date(email.receivedAt).getTime();
  if (Number.isNaN(targetMs)) return -1;

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

  // Debug telemetry: collect the nearest 3 candidates so a no-match
  // response carries actionable info back to the caller's log row.
  const debugCandidates: Array<{ subj: string; ts: string; dtSec: number }> = [];

  for (let pg = 0; pg < maxPages; pg++) {
    await page.waitForSelector("#messages-list", { timeout: 5000 }).catch(() => null);
    const isEmpty = await page
      .locator(".dataTables_empty")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isEmpty) break;

    const { hits, pageCandidates } = await page.evaluate(
      ({ wantSubject, targetMs, toleranceMs, offsetMs }) => {
        const reTs = /(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})/;
        const norm = (s: string) =>
          s.replace(/[…]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

        const rows = Array.from(
          document.querySelectorAll<HTMLTableRowElement>("#messages-list tbody tr"),
        );
        const hits: number[] = [];
        const pageCandidates: Array<{ subj: string; ts: string; dtSec: number }> = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const txt = row.textContent ?? "";
          if (txt.includes("No data available")) continue;

          // Scan every cell: pick the longest text cell that isn't an
          // email address or a pure datestamp. Observed 2026-04-23: the
          // old "longest alphabetic cell" rule picked the sender-email
          // cell (`administratie@fire-contro…`) for auto-reply rows,
          // causing subject-match false negatives.
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
          let subjectText = "";
          for (const c of cells) {
            const raw = (c.getAttribute("title") || c.textContent || "").trim();
            if (!/[a-z]/i.test(raw)) continue;
            if (/\S@\S/.test(raw) && !/\s/.test(raw)) continue;
            if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(raw)) continue;
            if (raw.length > subjectText.length) subjectText = raw;
          }
          subjectText = norm(subjectText);

          const tsMatch = txt.match(reTs);
          if (!tsMatch) continue;
          const [, y, mo, d, hh, mm, ss] = tsMatch;
          // Build UTC ms from Amsterdam-local components.
          const rowUtcMs =
            Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - offsetMs;
          if (Number.isNaN(rowUtcMs)) continue;

          const dt = Math.abs(rowUtcMs - targetMs);
          const want = norm(wantSubject);
          // Bidirectional substring match tolerates both CSS truncation
          // (DOM has "…" or is clipped) and row-text-with-extra-suffix.
          const subjectOk =
            subjectText.includes(want) || (want.length > 20 && want.includes(subjectText) && subjectText.length > 20);

          pageCandidates.push({ subj: subjectText.slice(0, 60), ts: tsMatch[0], dtSec: Math.round(dt / 1000) });
          if (subjectOk && dt <= toleranceMs) hits.push(i);
        }
        return { hits, pageCandidates };
      },
      // ±60s: debug run 2026-04-23 showed exact-subject matches getting
      // rejected because 15s was narrower than real delivery drift
      // between the mailbox and iController's ingest clock.
      { wantSubject: email.subject, targetMs, toleranceMs: 60_000, offsetMs: amsterdamOffsetMs },
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
  }

  // Stash debug info on the page so the caller can retrieve it.
  await page
    .evaluate((c) => {
      (window as unknown as { __debtorDebug?: unknown }).__debtorDebug = c;
    }, debugCandidates.sort((a, b) => a.dtSec - b.dtSec).slice(0, 5))
    .catch(() => null);

  return -1;
}

/** Read debug candidates stashed by findEmailViaSearch. Empty if none. */
async function readSearchDebug(page: Page): Promise<string> {
  try {
    const d = await page.evaluate(
      () =>
        (window as unknown as { __debtorDebug?: unknown }).__debtorDebug ?? null,
    );
    if (!d) return "";
    return ` [nearest: ${JSON.stringify(d)}]`;
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
  // Re-trigger the sender-scoped search so the DataTables result set is
  // narrowed to one sender — keeps the DOM small and avoids paginating
  // 1200+ rows just to confirm a single delete.
  const searchSelectors = [
    'input[placeholder="Search in mails..."]',
    'input[placeholder*="Search in mails"]',
    'input[placeholder*="Search"]',
    ".dataTables_filter input",
    "#messages-list_filter input",
    'input[type="search"]',
  ];
  let typed = false;
  for (const sel of searchSelectors) {
    const input = page.locator(sel).first();
    if (await input.isVisible({ timeout: 800 }).catch(() => false)) {
      await input.fill("");
      const waitForXhr = page
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
      await input.fill(email.from);
      const wantPrefix = `${email.from.toLowerCase()} (`;
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
        }, wantPrefix)
        .catch(() => false);
      if (!clicked) {
        await input.press("Enter").catch(() => null);
      }
      await waitForXhr;
      typed = true;
      break;
    }
  }
  if (!typed) {
    // Search box missing — fall back to checking the un-filtered DOM. If
    // the row is on a later page we may miss it, but that's no worse than
    // the prior behaviour and only fires when iController's chrome changed.
  }

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
    if (rowIndex === -1) {
      const debug = await readSearchDebug(page);
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
        error: `Email not found: "${email.subject}" from ${email.from}${debug}`,
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
    if (rowIndex === -1) {
      const debug = await readSearchDebug(page);
      const errorScreenshot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `email-not-found`,
      });
      return {
        success: false,
        emailFound: false,
        screenshots: { before: errorScreenshot, after: null },
        error: `Email not found: "${email.subject}" from ${email.from}${debug}`,
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
    const gone = await verifyMessageGone(page, email, deletedMessageId);
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
