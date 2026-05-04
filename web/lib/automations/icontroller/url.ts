// Phase 67 (D-04, R-01): URL helper for iController message-list navigation.
//
// Per 67-RESEARCH.md § URL Construction (Open Question 1, Option A recommended):
// returns the MAILBOX-LIST URL, not the per-message detail URL. The numeric
// msg_id is unknown at dispatch time (email_pipeline.emails has no
// icontroller_msg_id column populated upstream). The tagger lands on the
// mailbox-list URL and search-clicks the row using cleanup-worker's
// findEmailViaSearch pattern (browser.ts:54+).
//
// BASE_URLS duplicated rather than re-exported from session.ts so this
// helper has no runtime dependency on the Browserless connect path. Phase
// 68's swarms registry generalisation will collapse the duplication into a
// single per-mailbox row.

import {
  ICONTROLLER_MAILBOXES,
  isKnownMailbox,
} from "@/lib/automations/debtor-email/mailboxes";
import type { IControllerEnv } from "@/lib/automations/icontroller/session";

const BASE_URLS: Record<IControllerEnv, string> = {
  production: "https://walkerfire.icontroller.eu",
  acceptance: "https://test-walkerfire-testing.icontroller.billtrust.com",
} as const;

export interface BuildIcontrollerMessageUrlInput {
  source_mailbox: string;
  env: IControllerEnv;
}

/**
 * Build the iController mailbox-list URL the tagger lands on.
 *
 * Returns: `${BASE_URLS[env]}/messages/index/mailbox/{mailbox_id}`
 *
 * Throws if `source_mailbox` is not a known Moyne Roberts mailbox per
 * `ICONTROLLER_MAILBOXES`. Callers should pre-validate via `isKnownMailbox`
 * if a soft-fail path is preferred.
 */
export function buildIcontrollerMessageUrl(
  input: BuildIcontrollerMessageUrlInput,
): string {
  if (!isKnownMailbox(input.source_mailbox)) {
    throw new Error(
      `buildIcontrollerMessageUrl: unknown source_mailbox '${input.source_mailbox}'`,
    );
  }
  const mailboxId = ICONTROLLER_MAILBOXES[input.source_mailbox];
  const baseUrl = BASE_URLS[input.env];
  return `${baseUrl}/messages/index/mailbox/${mailboxId}`;
}
