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
  /** Company name as shown in iController sidebar */
  company: string;
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
      await input.press("Enter").catch(() => null);
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
 * Select a row's checkbox and click the bulk delete button.
 * Verifies the checkbox is actually :checked before clicking delete; falls
 * back to clicking the select-column td (DataTables row-click toggle) if
 * the direct input click doesn't register.
 */
async function selectAndDelete(page: Page, rowIndex: number): Promise<void> {
  const rowSelector = `#messages-list tbody tr:nth-child(${rowIndex + 1})`;
  const row = page.locator(rowSelector);
  const checkbox = row.locator('input[type="checkbox"]').first();

  await checkbox.scrollIntoViewIfNeeded();
  await checkbox.click();

  // Poll for checked state for up to 1s instead of a blind 400ms sleep —
  // returns as soon as the checkbox registers as :checked.
  const waitChecked = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await checkbox.isChecked().catch(() => false)) return true;
      await page.waitForTimeout(50);
    }
    return false;
  };

  let checked = await waitChecked(1000);
  if (!checked) {
    // Fallback: click the first cell (select column) — many DataTables
    // implementations toggle the checkbox when the cell is clicked.
    await row.locator("td").first().click();
    checked = await waitChecked(1000);
  }
  if (!checked) {
    throw new Error(`Checkbox on row ${rowIndex} could not be checked`);
  }

  const deleteButton = page.locator('.delete-bulk.bulk-action').first();
  await deleteButton.click();

  // Modal appears via JS animation — the visibility-check below already
  // has its own 3s timeout, so the old blind 1s sleep was redundant.
  const confirmButton = page.locator(
    'button:has-text("OK"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete"), .modal button.call-to-action',
  );
  const hasConfirm = await confirmButton.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (hasConfirm) {
    // Kick off delete-XHR listener before the click — same pattern as the
    // search: otherwise we risk racing past the request emission frame.
    const waitForDeleteXhr = page
      .waitForResponse(
        (r) => {
          const u = r.url();
          const method = r.request().method();
          return (
            (method === "POST" || method === "DELETE") &&
            (u.includes("/messages") || u.includes("/delete"))
          );
        },
        { timeout: 6000 },
      )
      .catch(() => null);
    await confirmButton.first().click();
    await waitForDeleteXhr;
  }

  // Brief settle time for the table rerender after the XHR returns —
  // down from 2s to 400ms.
  await page.waitForTimeout(400);
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
    // Reset the list view so each item starts from a clean state (previous
    // search filter still populated would skew the next findEmailViaSearch).
    await page.goto(`${cfg.url}/messages`, { waitUntil: "domcontentloaded" });
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

    const audit = await captureBeforeAfter(
      page,
      AUTOMATION_NAME,
      `delete-${email.company}`,
      async () => {
        await selectAndDelete(page, rowIndex);
      },
    );

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
