// Phase 71-03 Task 1 (REVW-06). Locks the per-email aggregate view contract
// shipped by Plan 71-01 (D-09): the migration text is read from disk and
// asserted against the structural constructs that downstream consumers rely on
// (Bulk Review predicted-row feed, Phase 72 promotion recommender input).
//
// No DB connection is required — the migration file is the single source of
// truth. If the migration drifts and one of these assertions fails, that is a
// real bug in the migration (NOT a reason to relax the assertion).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260507a_pipeline_events_email_summary.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf-8");

describe("public.pipeline_events_email_summary view (Phase 71 D-09)", () => {
  it("creates the view with security_invoker=true (Pitfall 4 / Assumption A1)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.pipeline_events_email_summary/);
    expect(sql).toMatch(/WITH \(security_invoker\s*=\s*true\)/);
  });

  it("uses DISTINCT ON per (email_id, swarm_type, stage) ordered by created_at DESC so override-row wins", () => {
    expect(sql).toMatch(/DISTINCT ON\s*\(\s*email_id,\s*swarm_type,\s*stage\s*\)/);
    expect(sql).toMatch(/ORDER BY\s+email_id,\s*swarm_type,\s*stage,\s*created_at DESC/);
  });

  it("exposes stage_0..4_decision and stage_1..4_overridden columns", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(sql).toContain(`stage_${n}_decision`);
    }
    for (const n of [1, 2, 3, 4]) {
      expect(sql).toContain(`stage_${n}_overridden`);
    }
  });

  it("total_cost_cents SUMs all events for the email (cross-stage)", () => {
    expect(sql).toMatch(/SUM\(pe\.cost_cents\)/);
    expect(sql).toContain("AS total_cost_cents");
  });

  it("tool_call_count rolls up Stage-4 events with decision_details ? 'tool_calls'", () => {
    expect(sql).toMatch(/decision_details \? 'tool_calls'/);
    expect(sql).toContain("AS tool_call_count");
  });

  it("ships the supporting index pipeline_events_email_stage_created_idx (D-09 perf)", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS pipeline_events_email_stage_created_idx[\s\S]*\(email_id,\s*stage,\s*created_at DESC\)/,
    );
  });

  it("GRANTs SELECT to authenticated and service_role", () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.pipeline_events_email_summary TO authenticated, service_role/);
  });

  it("groups by (email_id, swarm_type) so each row is one email per swarm", () => {
    expect(sql).toMatch(/GROUP BY ps\.email_id,\s*ps\.swarm_type/);
  });
});
