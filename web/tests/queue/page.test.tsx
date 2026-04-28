// Phase 60-00 (D-10). Stub for the rewritten /automations/debtor-email-review
// page. Real assertions arrive in 60-05.

import { describe, it } from "vitest";

describe("D-10: debtor-email-review page reads automation_runs.status='predicted' only", () => {
  it.todo("does NOT call listInboxMessages from @/lib/outlook on render");
  it.todo(
    "calls admin.rpc('classifier_queue_counts', { p_swarm_type: 'debtor-email' })",
  );
  it.todo("renders 0 rows when supabase returns empty list");
  it.todo("filters by entity / mailbox_id from searchParams");
});
