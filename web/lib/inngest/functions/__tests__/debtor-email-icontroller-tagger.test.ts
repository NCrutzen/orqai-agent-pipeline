// Phase 67 Plan 01 Wave 0 — failing scaffold for the debtorEmailIcontrollerTagger
// Inngest function introduced in Plan 05 (Wave 3). Six it.todo placeholders
// document the cases Plan 05 must fill in. The handler will mock @/lib/inngest/client
// (createFunction + send), @supabase/supabase-js admin chains, and
// labelEmailInIcontroller per the pattern in classifier-label-resolver.test.ts.
//
// Tracking column: icontroller_tag_status (Plan 01 migration).
import { describe, it } from "vitest";

describe("debtorEmailIcontrollerTagger", () => {
  it.todo(
    "UPDATEs email_labels.icontroller_tag_status='tagged' on labelEmailInIcontroller success",
  );
  it.todo(
    "UPDATEs email_labels.icontroller_tag_status='failed' + error on Browserless throw",
  );
  it.todo(
    "UPDATEs 'failed' with error LIKE 'brand_mismatch:%' when label module returns brand_mismatch",
  );
  it.todo(
    "returns ok:true even when labelEmailInIcontroller status='failed' (Inngest run stays green)",
  );
  it.todo("writes screenshot_before_url + screenshot_after_url on success");
  it.todo("calls emitAutomationRunStale with debtor-email-review after row update");
});
