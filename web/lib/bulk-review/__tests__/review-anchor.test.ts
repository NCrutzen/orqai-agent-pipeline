// Phase 110 Plan 01 (D-01) — RED contract for the email_id-anchored hydrator.
//
// ─────────────────────────────────────────────────────────────────────────
// RED until 110-02 lands D-01 anchor generalization.
// ─────────────────────────────────────────────────────────────────────────
//
// Today hydrateBulkReviewRow accepts ONLY `email_label_id` and anchors on
// debtor.email_labels (a debtor-only table — see hydrate.ts:139-154 and the
// /review/page.tsx hard 404 for non-debtor swarms at page.tsx:84-86). Sales-
// email (and every future swarm) has no email_labels row, so Bulk Review is
// unreachable for it.
//
// Plan 02 generalizes the anchor: the hydrator must accept an `email_id`
// anchor and materialize a row directly from pipeline_events + agent_runs
// (the cross-swarm Stage 0-3 evidence store), leaving the debtor-only override
// slots (corrected_customer_account_id, reviewed_by, draft_quality,
// feedback_reason) null because a non-debtor swarm has no email_labels row to
// source them from.
//
// This suite RUNS (not .skip) and is EXPECTED TO FAIL today: HydrateOptions
// has no `email_id` field and the hydrator returns null for a sales-email
// anchor because the debtor.email_labels lookup misses. Plan 02 flips it GREEN.

import { describe, it, expect } from "vitest";
import { createSupabaseAdminMock } from "@/test-utils/supabase-mock";
import { hydrateBulkReviewRow } from "@/lib/bulk-review/hydrate";
import type { SupabaseClient } from "@supabase/supabase-js";

const SALES_EMAIL_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Minimal cross-swarm evidence: one Stage 3 pipeline_events row for a
// sales-email email_id, plus an agent_runs row carrying ranked intents.
function seedSalesEvidence(admin: ReturnType<typeof createSupabaseAdminMock>) {
  // (0) debtor.email_labels anchor lookup — the hydrator's FIRST query today
  //     (hydrate.ts:147). For a sales-email email_id anchor there is no
  //     email_labels row, so it resolves null and the hydrator early-returns
  //     null at hydrate.ts:177. THIS is the contract gap Plan 02 closes: an
  //     email_id anchor must bypass the debtor-only email_labels table.
  admin.queueResponse({ data: null, error: null });
  // (1) pipeline_events — ordered (stage, created_at). One Stage 3 decision.
  admin.queueResponse({
    data: [
      {
        id: "pe-stage3",
        stage: 3,
        decision: "quote_request",
        confidence: 0.9,
        decision_details: {
          ranked: [{ intent: "quote_request", confidence: "high" }],
          language: "nl",
          urgency: "normal",
        },
        override: null,
        triggered_by: "pipeline",
        created_at: "2026-06-03T10:00:00Z",
        cost_cents: null,
      },
    ],
    error: null,
  });
  // (2) agent_runs — Stage 3 tool_outputs with ranked first-pass.
  admin.queueResponse({
    data: [
      {
        id: "ar-stage3",
        stage: 3,
        corrected_category: null,
        human_verdict: null,
        tool_outputs: {
          intent_first_pass: {
            ranked: [{ intent: "quote_request", confidence: "high" }],
          },
        },
      },
    ],
    error: null,
  });
  // (3-5) registry loaders (noise cats / intents / brands) — empty is fine for
  //       the anchor contract; the assertion is on the override slots + anchor.
  admin.queueResponse({ data: [], error: null });
  admin.queueResponse({ data: [], error: null });
  admin.queueResponse({ data: [], error: null });
}

describe("D-01 review anchor — email_id anchor for a non-debtor swarm (RED until 110-02)", () => {
  it("hydrates a sales-email row from an email_id anchor with null debtor-only override slots", async () => {
    const admin = createSupabaseAdminMock({
      defaultResponse: { data: null, error: null },
    });
    seedSalesEvidence(admin);

    // Plan 02 contract: anchor by email_id (NOT email_label_id) for a
    // non-debtor swarm. Cast through the current HydrateOptions shape — the
    // `email_id` field does not exist on it yet, which is exactly why this
    // suite is RED today.
    const row = await hydrateBulkReviewRow(admin as unknown as SupabaseClient, {
      email_id: SALES_EMAIL_ID,
      swarm_type: "sales-email",
    } as unknown as { email_label_id: string; swarm_type: string });

    // RED today: hydrator returns null (no debtor.email_labels row for a
    // sales-email anchor). Plan 02 makes this a populated row.
    expect(row).not.toBeNull();
    expect(row!.swarm_type).toBe("sales-email");
    expect(row!.email_id).toBe(SALES_EMAIL_ID);

    // Stage 0-3 evidence comes from pipeline_events / agent_runs.
    expect(row!.stage_3).not.toBeNull();
    expect(row!.stage_3!.top_intent).toBe("quote_request");

    // Debtor-only override slots are null for a non-debtor swarm (no
    // email_labels row to source them from).
    expect(row!.stage_2?.corrected_customer_account_id ?? null).toBeNull();
    expect(row!.overrides.axis_2_corrected_customer_account_id).toBeNull();
    expect(row!.overrides.axis_2_reviewed_by).toBeNull();
    expect(row!.overrides.axis_4_draft_quality).toBeNull();
    expect(row!.overrides.axis_4_feedback_reason).toBeNull();
  });
});
