import { type Page } from "playwright-core";
import { connectWithSession, saveSession, captureBeforeAfter, captureScreenshot } from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";

const AUTOMATION_NAME = "debtor-email-cleanup";

export type IControllerEnv = "acceptance" | "production";

interface EnvConfig {
  url: string;
  credentialId: string;
  sessionKey: string;
}

function resolveEnv(env: IControllerEnv | undefined): EnvConfig {
  const resolved: IControllerEnv =
    env ?? (process.env.ICONTROLLER_ENV === "production" ? "production" : "acceptance");
  if (resolved === "production") {
    return {
      url: "https://walkerfire.icontroller.eu",
      credentialId: "dfae6b50-59dd-44e6-81ac-79d4f3511c3f",
      sessionKey: "icontroller_session_prod",
    };
  }
  return {
    url: "https://test-walkerfire-testing.icontroller.billtrust.com",
    credentialId: "e9a9570e-5f0d-4d50-8b41-212fc6bdb78a",
    sessionKey: "icontroller_session",
  };
}

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
 * Login to iController. Skips if already logged in via session reuse.
 * Selectors: #login-username (type=text), #login-password, #login-submit
 */
async function login(page: Page, cfg: EnvConfig): Promise<void> {
  await page.goto(cfg.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const hasLoginForm = await page.locator('#login-username')
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (!hasLoginForm) return; // Already logged in via session

  const creds = await resolveCredentials(cfg.credentialId);

  await page.fill('#login-username', creds.username);
  await page.fill('#login-password', creds.password);
  await page.click('#login-submit');

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
}

/**
 * Navigate directly to Messages inbox via URL.
 * Collections is already the active section after login.
 */
async function navigateToMessages(page: Page, cfg: EnvConfig): Promise<void> {
  await page.goto(`${cfg.url}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

/**
 * Select a company mailbox from the sidebar.
 * Sidebar is a <ul> with <a> links, format "» CompanyName",
 * href = /messages/index/mailbox/{id}. Navigate directly via URL for reliability.
 */
async function selectCompanyMailbox(page: Page, cfg: EnvConfig, company: string): Promise<boolean> {
  const mailboxHref = await page.evaluate((name) => {
    const links = Array.from(document.querySelectorAll('a'));
    for (const a of links) {
      const text = a.textContent?.trim().replace(/^»\s*/, '') || '';
      if (text.toLowerCase() === name.toLowerCase()) return a.getAttribute('href');
    }
    for (const a of links) {
      const text = a.textContent?.trim().toLowerCase() || '';
      if (text.includes(name.toLowerCase())) return a.getAttribute('href');
    }
    return null;
  }, company);

  if (!mailboxHref) return false;

  await page.goto(`${cfg.url}${mailboxHref}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Find a specific email in the messages table, paginating forward.
 * Primary match: timestamp (HH:MM + date parts from receivedAt).
 * Fallback: from + subject substring. Walks up to maxPages (default 10).
 * Returns row index within the page it was found on, or -1.
 * (The caller stays on that page so selectAndDelete's nth-child works.)
 */
async function findEmail(page: Page, email: EmailIdentifiers, maxPages = 10): Promise<number> {
  for (let pg = 0; pg < maxPages; pg++) {
    await page.waitForSelector('#messages-list', { timeout: 5000 }).catch(() => null);
    const isEmpty = await page.locator('.dataTables_empty').isVisible({ timeout: 1500 }).catch(() => false);
    if (isEmpty) return -1;

    const rowIndex = await page.evaluate(({ from, subject, receivedAt }) => {
      const tsParts = receivedAt.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      const [, year, month, day, hh, mm] = tsParts ?? [];
      const hm = hh && mm ? `${hh}:${mm}` : "";

      const rows = document.querySelectorAll('#messages-list tbody tr');
      for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent || "";
        if (text.includes("No data available")) continue;

        const timeMatch = hm !== "" && text.includes(hm);
        const dateMatch =
          tsParts !== null && (
            text.includes(`${year}-${month}-${day}`) ||
            text.includes(`${day}-${month}-${year}`) ||
            text.includes(`${day}/${month}/${year}`) ||
            text.includes(`${day}.${month}.${year}`)
          );

        if (timeMatch && dateMatch) return i;

        const fromMatch = from && text.toLowerCase().includes(from.toLowerCase());
        const subjectMatch =
          subject && text.toLowerCase().includes(subject.substring(0, 30).toLowerCase());
        if (fromMatch && subjectMatch) return i;
      }
      return -1;
    }, email);

    if (rowIndex !== -1) return rowIndex;

    const advanced = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        '#messages-list_paginate .paginate_button.next:not(.disabled), .dataTables_paginate .paginate_button.next:not(.disabled)',
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!advanced) return -1;
    await page.waitForTimeout(1500);
  }
  return -1;
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
 *   equality AND received_at within ±60 s of ours (covers 3–5 s delivery
 *   drift between Outlook and iController's timestamp). Multiple rows that
 *   satisfy both → ambiguous, return -2 so the caller can log and skip.
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
    if (await input.isVisible({ timeout: 1500 }).catch(() => false)) {
      await input.fill("");
      await input.fill(email.from);
      await input.press("Enter").catch(() => null);
      typed = true;
      break;
    }
  }
  if (!typed) return -1;

  // Wait for the table to settle after the search filter applies.
  await page.waitForTimeout(1500);

  const targetMs = new Date(email.receivedAt).getTime();
  if (Number.isNaN(targetMs)) return -1;

  for (let pg = 0; pg < maxPages; pg++) {
    await page.waitForSelector("#messages-list", { timeout: 5000 }).catch(() => null);
    const isEmpty = await page
      .locator(".dataTables_empty")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isEmpty) return -1;

    const matched = await page.evaluate(
      ({ wantSubject, targetMs, toleranceMs }) => {
        // Extract a YYYY-MM-DD HH:MM:SS timestamp from a cell's text.
        const reTs = /(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2}):(\d{2})/;
        const norm = (s: string) => s.replace(/\s+/g, " ").trim();

        const rows = Array.from(
          document.querySelectorAll<HTMLTableRowElement>(
            "#messages-list tbody tr",
          ),
        );
        const hits: number[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const txt = row.textContent ?? "";
          if (txt.includes("No data available")) continue;

          // Full subject is in the DOM even when CSS truncates visually.
          // Pull the subject-cell anchor text + any title attribute as fallback.
          const subjCell = row.querySelector<HTMLElement>(
            "td a, td.subject, td:nth-child(3)",
          );
          const subjectText = subjCell
            ? norm(subjCell.getAttribute("title") || subjCell.textContent || "")
            : "";

          const tsMatch = txt.match(reTs);
          if (!tsMatch) continue;
          const [, y, mo, d, hh, mm, ss] = tsMatch;
          const rowMs = new Date(
            `${y}-${mo}-${d}T${hh}:${mm}:${ss}`,
          ).getTime();
          if (Number.isNaN(rowMs)) continue;

          const dt = Math.abs(rowMs - targetMs);
          const subjectOk = subjectText === norm(wantSubject);

          if (subjectOk && dt <= toleranceMs) hits.push(i);
        }
        return hits;
      },
      { wantSubject: email.subject, targetMs, toleranceMs: 60_000 },
    );

    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return -2; // ambiguous

    // Try to advance to the next page (search results can still paginate).
    const advanced = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        "#messages-list_paginate .paginate_button.next:not(.disabled), .dataTables_paginate .paginate_button.next:not(.disabled)",
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!advanced) return -1;
    await page.waitForTimeout(1500);
  }
  return -1;
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
  await page.waitForTimeout(400);

  let checked = await checkbox.isChecked().catch(() => false);
  if (!checked) {
    // Fallback: click the first cell (select column) — many DataTables
    // implementations toggle the checkbox when the cell is clicked.
    await row.locator("td").first().click();
    await page.waitForTimeout(400);
    checked = await checkbox.isChecked().catch(() => false);
  }
  if (!checked) {
    throw new Error(`Checkbox on row ${rowIndex} could not be checked`);
  }

  const deleteButton = page.locator('.delete-bulk.bulk-action').first();
  await deleteButton.click();
  await page.waitForTimeout(1000);

  const confirmButton = page.locator(
    'button:has-text("OK"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete"), .modal button.call-to-action',
  );
  const hasConfirm = await confirmButton.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (hasConfirm) {
    await confirmButton.first().click();
  }

  await page.waitForTimeout(2000);
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
  const cfg = resolveEnv(env);
  const { browser, context, page } = await connectWithSession(cfg.sessionKey);

  try {
    await login(page, cfg);
    await navigateToMessages(page, cfg);

    // Stay on the all-accounts view — sidebar filtering is the wrong
    // mental model (same mailbox, many Account labels).

    const rowIndex = await findEmailViaSearch(page, email);
    if (rowIndex === -2) {
      const shot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `preview-ambiguous`,
      });
      return {
        success: false,
        emailFound: false,
        rowIndex: -1,
        rowPreview: null,
        screenshot: shot,
        error: `Ambiguous match: multiple rows with subject "${email.subject}" within ±60s of ${email.receivedAt}`,
      };
    }
    if (rowIndex === -1) {
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
        error: `Email not found: "${email.subject}" from ${email.from}`,
      };
    }

    const rowPreview = await highlightRow(page, rowIndex);
    await page.waitForTimeout(400);

    const shot = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: `preview-before-delete-${email.company}`,
    });

    await saveSession(context, cfg.sessionKey);

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
    await browser.close();
  }
}

/**
 * Find and delete a specific email in iController.
 * Called by the Vercel API route after Zapier handles the Outlook side.
 *
 * Input: email identifiers from Zapier (company, from, subject, receivedAt)
 * Output: success status + before/after screenshot paths for audit trail
 */
export async function deleteEmailFromIController(
  email: EmailIdentifiers,
  env?: IControllerEnv,
): Promise<CleanupResult> {
  const cfg = resolveEnv(env);
  const { browser, context, page } = await connectWithSession(cfg.sessionKey);

  try {
    await login(page, cfg);
    await navigateToMessages(page, cfg);

    // Stay on the all-accounts view — sidebar filtering is the wrong
    // mental model (same mailbox, many Account labels).

    const rowIndex = await findEmailViaSearch(page, email);
    if (rowIndex === -2) {
      const errorScreenshot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: "ambiguous-match",
      });
      return {
        success: false,
        emailFound: false,
        screenshots: { before: errorScreenshot, after: null },
        error: `Ambiguous match: multiple rows with subject "${email.subject}" within ±60s of ${email.receivedAt}`,
      };
    }
    if (rowIndex === -1) {
      const errorScreenshot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `email-not-found`,
      });
      return {
        success: false,
        emailFound: false,
        screenshots: { before: errorScreenshot, after: null },
        error: `Email not found: "${email.subject}" from ${email.from}`,
      };
    }

    // Highlight the target row so before/after screenshots clearly point to it.
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

    await saveSession(context, cfg.sessionKey);

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
  } finally {
    await browser.close();
  }
}
