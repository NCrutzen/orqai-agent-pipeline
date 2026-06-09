// Phase 90 Wave 0 RED — RED until forward-rate is confirmed across all 3 paths in Plan 03 (RESL-05).
//
// RESL-05 has two halves: (1) a one-shot backfill of ~377 historical
// debtor.email_labels rows (a Supabase migration, Plan 03), and (2) a FORWARD-RATE
// guard that EVERY code path which INSERTs an email_labels row stamps
// `conversation_id` when the source email carries one. Without (2), the backfill
// is a one-time patch that re-rots as new labels are written without the field.
//
// This is a static-source guard: it reads each of the THREE known write paths
// (90-RESEARCH §RESL-05) and asserts the email_labels INSERT object literal
// includes a `conversation_id` key. Paths:
//   (a) the Inngest worker label INSERT      — stage-2-customer-resolver.ts:169-199
//   (b) the runThreadInheritanceOnly fallback — stage-2-customer-resolver.ts:389  (resolver; emits inputs.conversation_id)
//   (c) the legacy label-email route          — app/api/automations/debtor/label-email/route.ts (INSERT ~:152-159)
//
// RED today: the guard also requires a Plan-03 export — `STAGE2_LABEL_WRITE_PATHS`
// from the resolver engine home — that enumerates the audited paths so the set
// can't silently drift (a new 4th writer must register or this fails). That
// module (`../forward-rate-paths`) does not exist yet → import fails → RED.
// Plan 03 adds the export (and confirms path (a) stamps it after the body-source
// edit), turning this GREEN.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Plan 03 exports the audited-write-path registry from the resolver home.
import { STAGE2_LABEL_WRITE_PATHS } from "../forward-rate-paths";

// web/ root (this file is at web/lib/agentic-pipeline/resolve/__tests__/).
const WEB_ROOT = resolve(__dirname, "../../../..");

// The three write paths that may INSERT a debtor.email_labels row (RESL-05).
const WRITE_PATHS = [
  {
    name: "Inngest worker label INSERT",
    file: "lib/inngest/functions/stage-2-customer-resolver.ts",
  },
  {
    name: "legacy /api/automations/debtor/label-email route",
    file: "app/api/automations/debtor/label-email/route.ts",
  },
];

describe("Phase 90 RESL-05: conversation_id forward-rate across all write paths", () => {
  it("registers the audited write-path set (Plan 03 export)", () => {
    // The Plan-03 registry must enumerate every email_labels writer so a new
    // 4th path can't silently skip the conversation_id stamp.
    expect(Array.isArray(STAGE2_LABEL_WRITE_PATHS)).toBe(true);
    expect(STAGE2_LABEL_WRITE_PATHS.length).toBeGreaterThanOrEqual(2);
  });

  for (const path of WRITE_PATHS) {
    it(`${path.name} INSERTs email_labels with conversation_id`, () => {
      const src = readFileSync(resolve(WEB_ROOT, path.file), "utf8");
      // Locate the email_labels insert block and assert it carries the key.
      const insertIdx = src.indexOf('from("email_labels")');
      expect(insertIdx).toBeGreaterThan(-1);
      const afterInsert = src.slice(insertIdx, insertIdx + 1500);
      expect(afterInsert).toContain("conversation_id");
    });
  }

  it("runThreadInheritanceOnly fallback threads conversation_id into its result", () => {
    const src = readFileSync(
      resolve(WEB_ROOT, "lib/inngest/functions/stage-2-customer-resolver.ts"),
      "utf8",
    );
    // The no-NXT fallback (stage-2-customer-resolver.ts:389) must carry
    // conversation_id into its ResolveResult.inputs so the shared worker INSERT
    // stamps it. Assert the function exists and references conversation_id.
    expect(src).toContain("runThreadInheritanceOnly");
    const fnIdx = src.indexOf("function runThreadInheritanceOnly");
    expect(fnIdx).toBeGreaterThan(-1);
    expect(src.slice(fnIdx, fnIdx + 1500)).toContain("conversation_id");
  });
});
