// Phase 67 (D-05, R-04). Browserless label module — Wave-2 fill-in.
//
// Selectors copied from .planning/briefs/artifacts/debtor-email-label-probe/SELECTORS.md
// (production-verified 2026-04-29; acceptance re-verified Wave 0 of Phase 67).
//
// Single-account mode only. Multi-select widget mode (multiple accounts
// per email) is deferred per SELECTORS.md caveat 2.
//
// Plan 05 refactor: this module no longer owns Browserless session lifecycle.
// The tagger (debtor-email-icontroller-tagger) opens the session, navigates
// to the mailbox-LIST URL, search-clicks the row to land on the detail page,
// and passes the existing `page` here. The first selector wait
// (`.select2-container.clients`) confirms the caller put us on the detail
// page before invoking.

import { type Page } from "playwright-core";
import { captureScreenshot } from "@/lib/browser";
import { matchesExpectedBrand } from "@/lib/automations/debtor-email/mailboxes";

export interface LabelEmailInput {
  // page is provided by the caller — already navigated to the message DETAIL page.
  // The tagger owns session lifecycle; the label module no longer opens/closes.
  page: Page;
  customer_account_id: string;
  customer_name?: string;
  source_mailbox: string;
  entity: string | null; // from labeling_settings.entity; required for brand-mismatch defense
}

export type LabelEmailStatus =
  | "labeled"
  | "already_labeled"
  | "skipped_conflict"
  | "brand_mismatch"
  | "failed";

export interface LabelEmailResult {
  status: LabelEmailStatus;
  reason?: string;
  assigned_label?: string;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
}

const ACCOUNTS_TRIGGER = ".select2-container.clients";
const TYPEAHEAD_INPUT = ".select2-input.select2-focused";
const ANY_SELECTABLE_RESULT =
  "ul.select2-results .select2-result-selectable";
const HIGHLIGHTED_RESULT =
  "ul.select2-results .select2-result-selectable.select2-highlighted";
const HIGHLIGHTED_RESULT_LABEL =
  "ul.select2-results .select2-result-selectable.select2-highlighted .select2-result-label";

export async function labelEmailInIcontroller(
  input: LabelEmailInput,
): Promise<LabelEmailResult> {
  const { page } = input;
  let beforeUrl: string | null = null;
  let afterUrl: string | null = null;
  try {
    // Caller already navigated to the detail page; just confirm the
    // accounts widget is present (acts as a detail-page sanity check).
    await page.waitForSelector(ACCOUNTS_TRIGGER, { timeout: 8000 });

    // Idempotency: read current label state BEFORE applying.
    const current = await readCurrentLabel(page);
    if (current && current.customer_account_id === input.customer_account_id) {
      return {
        status: "already_labeled",
        assigned_label: current.text,
        screenshot_before_url: null,
        screenshot_after_url: null,
      };
    }
    if (
      current &&
      current.customer_account_id &&
      current.customer_account_id !== input.customer_account_id
    ) {
      return {
        status: "skipped_conflict",
        reason: `already labeled to ${current.customer_account_id}`,
        screenshot_before_url: null,
        screenshot_after_url: null,
      };
    }

    const before = await captureScreenshot(page, {
      automation: "debtor-email-labeling",
      label: "before",
    });
    beforeUrl = before?.url ?? null;

    // SELECTORS.md lines 67-110: open picker, type customer_id.
    await page.click(ACCOUNTS_TRIGGER);
    await page.waitForSelector(TYPEAHEAD_INPUT, { timeout: 3000 });
    await page.fill(TYPEAHEAD_INPUT, "");
    await page.type(TYPEAHEAD_INPUT, input.customer_account_id, { delay: 50 });
    await page.waitForSelector(ANY_SELECTABLE_RESULT, { timeout: 4000 });

    // SELECTORS.md lines 142-170: brand-mismatch defensive layer (R-04).
    // Read the highlighted result's parenthesized brand suffix and confirm
    // it matches the source mailbox's expected pattern. Bail out if not.
    const highlightedText = await page.$eval(
      HIGHLIGHTED_RESULT_LABEL,
      (el) => el.textContent?.trim() ?? "",
    );
    const brandMatch = highlightedText.match(/\(([^)]+)\)\s*$/);
    const annotatedBrand = brandMatch?.[1] ?? null;
    if (!matchesExpectedBrand(annotatedBrand, input.entity)) {
      // Capture an "error" screenshot so operator can audit which result
      // was about to be clicked.
      try {
        const errShot = await captureScreenshot(page, {
          automation: "debtor-email-labeling",
          label: "brand-mismatch",
        });
        afterUrl = errShot?.url ?? null;
      } catch {
        /* non-fatal */
      }
      return {
        status: "brand_mismatch",
        reason: `brand_mismatch: highlighted '${annotatedBrand ?? "unknown"}' did not match entity '${input.entity}'`,
        screenshot_before_url: beforeUrl,
        screenshot_after_url: afterUrl,
      };
    }

    // SELECTORS.md lines 109-110: click highlighted result. Select2 onSelect
    // auto-saves (no Save button). Operator-confirmed 2026-04-29.
    await page.click(HIGHLIGHTED_RESULT);
    await page.waitForTimeout(800);

    // Verify selection stuck.
    const after = await page.$eval(
      ACCOUNTS_TRIGGER,
      (el) => el.textContent?.trim() ?? "",
    );
    if (/none\s+selected/i.test(after)) {
      try {
        const errShot = await captureScreenshot(page, {
          automation: "debtor-email-labeling",
          label: "selection-not-stuck",
        });
        afterUrl = errShot?.url ?? null;
      } catch {
        /* non-fatal */
      }
      return {
        status: "failed",
        reason: "SELECTION_DID_NOT_STICK",
        screenshot_before_url: beforeUrl,
        screenshot_after_url: afterUrl,
      };
    }

    const afterShot = await captureScreenshot(page, {
      automation: "debtor-email-labeling",
      label: "after",
    });
    afterUrl = afterShot?.url ?? null;

    return {
      status: "labeled",
      assigned_label: after,
      screenshot_before_url: beforeUrl,
      screenshot_after_url: afterUrl,
    };
  } catch (err) {
    try {
      const errShot = await captureScreenshot(page, {
        automation: "debtor-email-labeling",
        label: "error",
      });
      afterUrl = errShot?.url ?? null;
    } catch {
      /* non-fatal */
    }
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
      screenshot_before_url: beforeUrl,
      screenshot_after_url: afterUrl,
    };
  }
}

/**
 * Idempotency probe: read the Accounts widget's current text and parse the
 * leading numeric customer_id from `<id> - <name> (<brand>)` format.
 * Returns null when widget shows "None selected".
 */
async function readCurrentLabel(
  page: Page,
): Promise<{ customer_account_id: string | null; text: string } | null> {
  const text = await page
    .$eval(ACCOUNTS_TRIGGER, (el) => el.textContent?.trim() ?? "")
    .catch(() => "");
  if (!text) return null;
  if (/none\s+selected/i.test(text)) {
    return { customer_account_id: null, text };
  }
  // Parse leading numeric id from "<id> - <name> (<brand>)".
  const idMatch = text.match(/^\s*(\d+)\s*-/);
  return {
    customer_account_id: idMatch?.[1] ?? null,
    text,
  };
}
