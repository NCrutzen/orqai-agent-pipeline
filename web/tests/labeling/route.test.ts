// Phase 56-00 (D-06, D-28, D-29). Route integration tests.
// Wave 0 scaffold: route.ts is the existing MVP — Wave 2 (56-04) refactors
// to consume resolveDebtor + new schema. These tests are RED until then.

import { describe, it } from "vitest";

describe("POST /api/automations/debtor/label-email", () => {
  it.todo("no nxt_database — 404 when labeling_settings.nxt_database is null (D-06)");
  it.todo("404 email_not_ingested — when email_pipeline.emails has no row (D-29)");
  it.todo("always writes email_labels — even when method=unresolved (D-28)");
  it.todo("dry-run gate — when labeling_settings.dry_run=true status=dry_run, no Browserless");
});
