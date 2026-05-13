/**
 * Phase 82.5 Plan 01 — Shared types for the feedback read-back surface.
 *
 * Contract module consumed by:
 *   - web/lib/automations/debtor-email/feedback/load-feedback-map.ts
 *   - web/lib/automations/debtor-email/feedback/load-operator-display.ts (indirect)
 *   - web/app/api/automations/debtor-email/feedback/route.ts (GET handler)
 *   - downstream client components (StageFeedbackPanel, OthersSaidBlock, ...)
 *
 * Hard-separation reminder (docs/agentic-pipeline/README.md): these types key
 * solely on `email_feedback.(email_id, stage)`. They are orthogonal to
 * `swarm_noise_categories` (Stage 1) and `swarm_intents` (Stage 3); the two
 * registries MUST NOT be blurred via this module.
 *
 * No imports. No runtime code. Plain TS contract only.
 */

export interface FeedbackOtherNote {
  display_name: string;
  verdict: "confirm" | "override" | "unclear";
  prose_notes: string | null;
  created_at: string; // ISO 8601
}

export interface FeedbackReadBack {
  own_latest: {
    prose_notes: string | null;
    verdict: "confirm" | "override" | "unclear";
    created_at: string;
  } | null;
  others: FeedbackOtherNote[];
}

export type FeedbackMap = Record<string /* email_id */, FeedbackReadBack>;
