// Phase 56-00 (D-15, D-16, D-18, D-19). Browserless label module skeleton.
//
// Reuses the default openIControllerSession (shares cookies with cleanup —
// per RESEARCH §Anti-Patterns, NOT a dedicated session key like drafter).
//
// Selectors are TBD until probe-label-ui.ts artifact lands in Wave 1
// (.planning/briefs/artifacts/debtor-email-label-probe/candidates.json).
// Wave 2 fills the TODO(probe-artifact) blocks; for now the apply path
// throws so callers fall back gracefully.

import { type Page } from "playwright-core";
import { captureScreenshot } from "@/lib/browser";
import {
  openIControllerSession,
  closeIControllerSession,
} from "@/lib/automations/icontroller/session";

export interface LabelEmailInput {
  icontroller_message_url: string; // pre-resolved per D-15
  customer_account_id: string;
  customer_name?: string;
  source_mailbox: string;
}

export type LabelEmailStatus =
  | "labeled"
  | "already_labeled"
  | "skipped_conflict"
  | "failed";

export interface LabelEmailResult {
  status: LabelEmailStatus;
  reason?: string;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
}

const ENV = (process.env.ICONTROLLER_ENV === "production"
  ? "production"
  : "acceptance") as "production" | "acceptance";

export async function labelEmailInIcontroller(
  input: LabelEmailInput,
): Promise<LabelEmailResult> {
  const session = await openIControllerSession(ENV);
  let beforeUrl: string | null = null;
  let afterUrl: string | null = null;
  try {
    const { page } = session;

    // D-18: NEVER 'networkidle' on iController SPA.
    await page.goto(input.icontroller_message_url, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // D-16: idempotency — read current label state BEFORE applying.
    const current = await readCurrentLabel(page);
    if (current && current.customer_account_id === input.customer_account_id) {
      return {
        status: "already_labeled",
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

    // TODO(probe-artifact): apply label using selectors from
    // .planning/briefs/artifacts/debtor-email-label-probe/candidates.json
    // For now this throws so Wave 2 must replace.
    throw new Error(
      "label-DOM selectors pending probe artifact (Wave 1 task 56-03)",
    );

    // Wave-2 path (commented until selectors known):
    // const after = await captureScreenshot(page, {
    //   automation: "debtor-email-labeling",
    //   label: "after",
    // });
    // afterUrl = after?.url ?? null;
    // return {
    //   status: "labeled",
    //   screenshot_before_url: beforeUrl,
    //   screenshot_after_url: afterUrl,
    // };
  } catch (err) {
    try {
      const errShot = await captureScreenshot(session.page, {
        automation: "debtor-email-labeling",
        label: "error",
      });
      afterUrl = errShot?.url ?? null;
    } catch {
      /* swallow secondary error so we can still close session */
    }
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
      screenshot_before_url: beforeUrl,
      screenshot_after_url: afterUrl,
    };
  } finally {
    await closeIControllerSession(session);
  }
}

async function readCurrentLabel(
  _page: Page,
): Promise<{ customer_account_id: string | null } | null> {
  // TODO(probe-artifact): replace with selector(s) from probe candidates.json.
  // Until probe runs we conservatively return null — the apply path will throw,
  // surfacing the missing-selector state to operators.
  return null;
}
