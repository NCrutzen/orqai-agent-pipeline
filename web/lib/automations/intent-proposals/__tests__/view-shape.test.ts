/**
 * Phase 86 Plan 01 — type-shape lock tests.
 *
 * These tests pin the ProposalRow / ClusterRow / ViewEvent contracts so that
 * Plan 02 (cron) and Plan 03 (UI) cannot silently drift from the migrations
 * shipped in this plan. Drift surfaces here at type-check time (red squiggle
 * inside the `satisfies` block) and as a runtime assertion (centroid invariant).
 *
 * Pure deterministic + sub-millisecond — no DB required.
 */

import { describe, it, expect } from "vitest";
import type {
  ProposalRow,
  ClusterRow,
  ViewEvent,
} from "@/lib/automations/intent-proposals/types";

describe("Phase 86 intent-proposals shape lock", () => {
  it("ProposalRow has all 10 required fields in the documented order", () => {
    const row = {
      pipeline_event_id: "00000000-0000-0000-0000-000000000001",
      email_id: "00000000-0000-0000-0000-000000000002",
      swarm_type: "debtor-email",
      proposal_label: "request_payment_confirmation",
      proposal_reason: "Sender asks whether their payment was received.",
      intent_version: "2026-05-19.v3",
      ranked_top_intent: "unknown",
      created_at: "2026-05-20T08:15:00.000Z",
      subject: "Re: factuur 12345",
      sender_email: "debiteur@example.com",
    } satisfies ProposalRow;

    // Keys in the exact projection order from the SQL view. Plan 02 SELECTs
    // positionally; reordering this array is a contract change.
    expect(Object.keys(row)).toEqual([
      "pipeline_event_id",
      "email_id",
      "swarm_type",
      "proposal_label",
      "proposal_reason",
      "intent_version",
      "ranked_top_intent",
      "created_at",
      "subject",
      "sender_email",
    ]);
  });

  it("ProposalRow tolerates NULL email_id + missing JOIN columns (LEFT JOIN semantics)", () => {
    const orphan = {
      pipeline_event_id: "00000000-0000-0000-0000-000000000003",
      email_id: null,           // pipeline_events.email_id is uuid NULL
      swarm_type: "debtor-email",
      proposal_label: "ask_for_credit_note",
      proposal_reason: null,
      intent_version: "2026-05-19.v3",
      ranked_top_intent: null,
      created_at: "2026-05-20T08:16:00.000Z",
      subject: null,            // emails row absent → LEFT JOIN yields NULL
      sender_email: null,
    } satisfies ProposalRow;

    expect(orphan.email_id).toBeNull();
    expect(orphan.subject).toBeNull();
    expect(orphan.proposal_label).toBe("ask_for_credit_note");
  });

  it("ClusterRow centroid_label invariant: centroid must appear in member_labels", () => {
    const cluster = {
      id: "00000000-0000-0000-0000-000000000010",
      swarm_type: "debtor-email",
      centroid_label: "request_payment_confirmation",
      member_count: 7,
      member_labels: [
        "request_payment_confirmation",
        "request_payment_confirmation_eng",
        "confirm_payment_received",
      ],
      sample_email_ids: [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
      ],
      window_start: "2026-05-19T00:00:00.000Z",
      window_end: "2026-05-20T00:00:00.000Z",
      refreshed_at: "2026-05-20T03:00:00.000Z",
    } satisfies ClusterRow;

    // Centroid is the cluster's canonical label and MUST be one of the
    // members. Plan 02 enforces this when writing rows; this assertion locks
    // the consumer-side expectation.
    expect(cluster.member_labels).toContain(cluster.centroid_label);
    expect(cluster.member_count).toBeGreaterThanOrEqual(cluster.member_labels.length);
    expect(cluster.sample_email_ids.length).toBeGreaterThanOrEqual(1);
    expect(cluster.sample_email_ids.length).toBeLessThanOrEqual(5);
  });

  it("ViewEvent allows all-null operator context (anonymous tab open)", () => {
    const anon = {
      swarm_type: null,
      operator_id: null,
      cluster_id: null,
      user_agent: null,
      viewed_at: "2026-05-20T09:00:00.000Z",
    } satisfies ViewEvent;

    expect(anon.operator_id).toBeNull();
    expect(typeof anon.viewed_at).toBe("string");
  });
});
