import { type Page } from "playwright-core";
import { connectWithSession, saveSession, captureBeforeAfter, captureScreenshot } from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";

const ICONTROLLER_CREDENTIAL_ID = "e9a9570e-5f0d-4d50-8b41-212fc6bdb78a";
const SESSION_KEY = "icontroller_session";
const ICONTROLLER_URL = "https://test-walkerfire-testing.icontroller.billtrust.com";
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
 * Login to iController. Skips if already logged in via session reuse.
 * Selectors: #login-username (type=text), #login-password, #login-submit
 */
async function login(page: Page): Promise<void> {
  await page.goto(ICONTROLLER_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const hasLoginForm = await page.locator('#login-username')
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (!hasLoginForm) return; // Already logged in via session

  const creds = await resolveCredentials(ICONTROLLER_CREDENTIAL_ID);

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
async function navigateToMessages(page: Page): Promise<void> {
  await page.goto(`${ICONTROLLER_URL}/messages`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

/**
 * Select a company mailbox from the sidebar.
 * Sidebar is a <ul> with <a> links, format "» CompanyName",
 * href = /messages/index/mailbox/{id}. Navigate directly via URL for reliability.
 */
async function selectCompanyMailbox(page: Page, company: string): Promise<boolean> {
  // Find the mailbox link by matching company name in the sidebar
  const mailboxHref = await page.evaluate((name) => {
    const links = Array.from(document.querySelectorAll('a'));
    // Try exact match first (sidebar shows "» CompanyName")
    for (const a of links) {
      const text = a.textContent?.trim().replace(/^»\s*/, '') || '';
      if (text.toLowerCase() === name.toLowerCase()) return a.getAttribute('href');
    }
    // Try partial match
    for (const a of links) {
      const text = a.textContent?.trim().toLowerCase() || '';
      if (text.includes(name.toLowerCase())) return a.getAttribute('href');
    }
    return null;
  }, company);

  if (!mailboxHref) return false;

  // Navigate directly to the mailbox URL
  await page.goto(`${ICONTROLLER_URL}${mailboxHref}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Find a specific email in the messages table (#messages-list).
 * Uses the "Search in mails..." box first, then matches on from + subject.
 * Returns the row index (0-based) or -1 if not found.
 */
async function findEmail(page: Page, email: EmailIdentifiers): Promise<number> {
  // Wait for table to be present
  await page.waitForSelector('#messages-list', { timeout: 5000 }).catch(() => null);

  // Check if table has data
  const isEmpty = await page.locator('.dataTables_empty').isVisible({ timeout: 2000 }).catch(() => false);
  if (isEmpty) return -1;

  // Use the "Search in mails..." input if available
  const searchBox = page.locator('input[placeholder*="Search in mails"]').first();
  const hasSearch = await searchBox.isVisible({ timeout: 2000 }).catch(() => false);

  if (hasSearch) {
    await searchBox.fill(email.subject.substring(0, 50));
    await page.waitForTimeout(2000);
  }

  // Find the matching row in #messages-list tbody
  const rowIndex = await page.evaluate(({ from, subject }) => {
    const rows = document.querySelectorAll('#messages-list tbody tr');
    for (let i = 0; i < rows.length; i++) {
      const rowText = rows[i].textContent || '';
      if (rowText.includes('No data available')) continue;

      const fromMatch = rowText.toLowerCase().includes(from.toLowerCase());
      const subjectMatch = rowText.toLowerCase().includes(subject.substring(0, 30).toLowerCase());

      if (fromMatch && subjectMatch) return i;
    }
    return -1;
  }, { from: email.from, subject: email.subject });

  return rowIndex;
}

/**
 * Select a row by index and click the delete button.
 * Table: #messages-list. Rows have a checkbox in the select column.
 * Delete button: div.delete-bulk.bulk-action in the toolbar.
 */
async function selectAndDelete(page: Page, rowIndex: number): Promise<void> {
  // Click the checkbox on the row (column with class "column-select")
  const checkbox = page.locator(`#messages-list tbody tr:nth-child(${rowIndex + 1}) .column-select input[type="checkbox"], #messages-list tbody tr:nth-child(${rowIndex + 1}) td:nth-child(2)`).first();
  await checkbox.click();
  await page.waitForTimeout(500);

  // Click the delete button (div.delete-bulk.bulk-action)
  const deleteButton = page.locator('.delete-bulk.bulk-action').first();
  await deleteButton.click();
  await page.waitForTimeout(1000);

  // Handle potential confirmation dialog
  const confirmButton = page.locator('button:has-text("OK"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete"), .modal button.call-to-action');
  const hasConfirm = await confirmButton.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (hasConfirm) {
    await confirmButton.first().click();
  }

  await page.waitForTimeout(2000);
}

/**
 * Find and delete a specific email in iController.
 * Called by the Vercel API route after Zapier handles the Outlook side.
 *
 * Input: email identifiers from Zapier (company, from, subject, receivedAt)
 * Output: success status + before/after screenshot paths for audit trail
 */
export async function deleteEmailFromIController(email: EmailIdentifiers): Promise<CleanupResult> {
  const { browser, context, page } = await connectWithSession(SESSION_KEY);

  try {
    await login(page);
    await navigateToMessages(page);

    // Find the company mailbox
    const found = await selectCompanyMailbox(page, email.company);
    if (!found) {
      const errorScreenshot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: `company-not-found-${email.company}`,
      });
      return {
        success: false,
        emailFound: false,
        screenshots: { before: errorScreenshot, after: null },
        error: `Company "${email.company}" not found in iController sidebar`,
      };
    }

    // Find the specific email
    const rowIndex = await findEmail(page, email);
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

    // Delete with before/after screenshots
    const audit = await captureBeforeAfter(
      page,
      AUTOMATION_NAME,
      `delete-${email.company}`,
      async () => {
        await selectAndDelete(page, rowIndex);
      },
    );

    await saveSession(context, SESSION_KEY);

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
