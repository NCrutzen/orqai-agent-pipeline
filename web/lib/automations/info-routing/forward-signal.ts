// Phase 134 (D-02) — PURE forward-signal builder.
//
// The forward-grade cron observes staff forwards out of an info@ mailbox and
// records each one as a `swarm_review_signals` row. This module is the PURE
// (IO-free) builder that turns one observed forward into that row + its
// deterministic dedupe_key, so it unit-tests without Supabase or Graph. The
// cron does the IO (Graph read, DB insert) and calls this to shape the row.
//
// Analog: web/lib/email-behavior/signal-derive.ts — same "build a verdict +
// deterministic dedupe_key, no clock, no randomness" shape. The difference is
// the cron is a SEPARATE producer from the delta deriveSignals path; both write
// the same `swarm_review_signals` table.
//
// Ground truth (memory `forward-match-as-wilson-ground-truth`): staff at info@
// already forward most mail to the right department, so the ACTUAL forward
// destination is ground truth for the correct route. The graded variant feeds
// the forward-Wilson grader; the no-verdict variant (Pitfall 5) is logged for
// observability only and NEVER fed to Wilson.

import type { SignalVerdict } from "@/lib/email-behavior/signal-derive";

/**
 * The two forward-grade verdicts. Declared as a narrowing of the (extended)
 * SignalVerdict union so the literals are type-checked against it: if a future
 * edit removes `forward_observed` / `forward_observed_no_verdict` from
 * SignalVerdict, this assignment fails to compile. No `as any` cast.
 */
export type ForwardVerdict = Extract<
  SignalVerdict,
  "forward_observed" | "forward_observed_no_verdict"
>;

/** One observed forward, as fed into the builder. Pure data — no IO. */
export interface ForwardSignalInput {
  swarm_type: string;
  /** The SOURCE info@ mailbox the forward came from. */
  mailbox: string;
  /** uuid of the inbound original (email_pipeline.emails.id), or null. */
  email_id: string | null;
  /** Outlook conversationId — the stable dedupe axis across re-scans. */
  conversation_id: string;
  /** The held verdict bucket the AI predicted; null = no persisted Stage-3
   *  verdict (or unrouted) → the no-verdict variant (Pitfall 5). */
  predicted_bucket: string | null;
  /** The routing bucket the mail was actually forwarded to; null = forwarded to
   *  a non-routing address (personal/external) → ungraded. */
  observed_bucket: string | null;
  /** The raw To-address the mail was forwarded to (auditable, A6). */
  observed_to_address: string | null;
  /** The forward's sentAt from Graph (ISO). Deterministic across replays — the
   *  dedupe key uses this, NOT the cron tick iso. */
  forward_sent_at: string;
}

/**
 * The persisted `swarm_review_signals` row shape (all columns free-text, so no
 * DB schema change is needed for the new kinds). `observed_meta` carries the
 * predicted + observed bucket + the raw To-address so the ledger is
 * self-sufficient for Phase 135 and the audit (A6/OQ1) — the cron persists it
 * either in a free column or stamped into an existing JSON-bearing field; we
 * expose it on the row regardless.
 */
export interface ForwardSignalRow {
  swarm_type: string;
  mailbox: string;
  email_id: string | null;
  /** Carries the predicted bucket (or null for the no-verdict variant). */
  category_key: string | null;
  verdict: ForwardVerdict;
  transition_kind: ForwardVerdict;
  /** `${swarm_type}|${conversation_id}|${verdict}|${forward_sent_at}` — keyed on
   *  the forward's sentAt (deterministic across replays), never the tick iso. */
  dedupe_key: string;
  /** = forward_sent_at (deterministic). */
  observed_at: string;
  /** Self-sufficient observation payload (A6). */
  observed_meta: {
    observed_bucket: string | null;
    observed_to_address: string | null;
    predicted_bucket: string | null;
  };
}

/**
 * Build the `swarm_review_signals` row for one observed forward. Pure and
 * deterministic: the same input always yields the same row (no clock, no
 * randomness). The verdict is `forward_observed` when a Stage-3 verdict was
 * persisted (predicted_bucket non-null), else `forward_observed_no_verdict`
 * (Pitfall 5 — never fed to Wilson). The dedupe_key includes swarm_type
 * (cross-swarm isolation), conversation_id, the verdict (so a graded and a
 * no-verdict observation of the same conversation+sentAt never collide), and the
 * forward's sentAt (so a corrected re-forward at a new sentAt is a new, desired
 * observation — Pitfall 4).
 */
export function buildForwardSignalRow(
  input: ForwardSignalInput,
): ForwardSignalRow {
  const {
    swarm_type,
    mailbox,
    email_id,
    conversation_id,
    predicted_bucket,
    observed_bucket,
    observed_to_address,
    forward_sent_at,
  } = input;

  const verdict: ForwardVerdict =
    predicted_bucket !== null ? "forward_observed" : "forward_observed_no_verdict";

  return {
    swarm_type,
    mailbox,
    email_id,
    category_key: predicted_bucket, // null for the no-verdict variant
    verdict,
    transition_kind: verdict, // symmetry with the delta signals' transition_kind
    dedupe_key: `${swarm_type}|${conversation_id}|${verdict}|${forward_sent_at}`,
    observed_at: forward_sent_at,
    observed_meta: {
      observed_bucket,
      observed_to_address,
      predicted_bucket,
    },
  };
}
