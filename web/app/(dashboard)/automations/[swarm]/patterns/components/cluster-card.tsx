"use client";

// Phase 4 Plan 02 Task 2 — cluster card. Operator-facing surface for a
// single promotion_candidates row.
//
// Renders proposed_change.display_signature VERBATIM (server-rendered at
// cron time by Plan 01 — no client-side transformation, no jargon leak).
// Operator-facing terminology (P4-D-04) lives in this file as the closed
// translation maps KIND_LABEL / KIND_COLOR_TOKEN / STATUS_LABEL /
// STATUS_COLOR_TOKEN — internal backend names appear ONLY as map keys, never
// as a UI string.

import { useMemo } from "react";
import Link from "next/link";

import type {
  PromotionCandidateRow,
  PromotionKind,
  PromotionStatus,
} from "@/lib/promotion-recommender/types";
import styles from "./cluster-card.module.css";

// ── Operator-facing translation tables (P4-D-04) ────────────────────────────
const KIND_LABEL: Record<PromotionKind, string> = {
  regex_rule: "Filter rule",
  sender_mapping: "Known sender",
  prompt_tune_stage_3: "AI tuning",
  new_intent: "New topic",
  prompt_tune_stage_4: "Draft style",
};

// Token strings — kind badge background. Tokens defined in web/app/globals.css.
const KIND_COLOR_TOKEN: Record<PromotionKind, string> = {
  regex_rule: "var(--v7-blue)",
  sender_mapping: "var(--v7-lime)",
  prompt_tune_stage_3: "var(--v7-brand-patterns)",
  new_intent: "var(--v7-brand-patterns)",
  prompt_tune_stage_4: "var(--v7-amber)",
};

const STATUS_LABEL: Record<PromotionStatus, string> = {
  open: "needs review",
  in_review: "being reviewed",
  approved: "applied",
  rejected: "dismissed",
  rolled_back: "rolled back",
};

// Status pill background uses the *-soft variant of the matching token; the
// text color uses the solid token.
const STATUS_FG_TOKEN: Record<PromotionStatus, string> = {
  open: "var(--v7-brand-patterns)",
  in_review: "var(--v7-amber)",
  approved: "var(--v7-lime)",
  rejected: "var(--v7-muted)",
  rolled_back: "var(--v7-red)",
};

const STATUS_BG_TOKEN: Record<PromotionStatus, string> = {
  open: "var(--v7-brand-patterns-soft)",
  in_review: "var(--v7-amber-soft)",
  approved: "var(--v7-state-safe-bg)",
  rejected: "var(--v7-panel-2)",
  rolled_back: "var(--v7-state-blocked-bg)",
};

export interface ClusterCardProps {
  candidate: PromotionCandidateRow;
  swarmType: string;
}

function formatDateNL(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL");
  } catch {
    return "—";
  }
}

export function ClusterCard({ candidate, swarmType }: ClusterCardProps) {
  const kindLabel = KIND_LABEL[candidate.kind];
  const kindBg = KIND_COLOR_TOKEN[candidate.kind];

  // Display signature — verbatim from cron-rendered JSONB. Plain text render
  // (React's default JSX escaping mitigates any HTML injection — see threat
  // model T-04-02-03).
  const signature = candidate.proposed_change.display_signature;
  // Sketch 006 sig-sub lock (Phase 4 follow-up 2026-05-27) — "why this matters"
  // 2nd-line operator descriptor. Optional for backward compat with rows
  // persisted before the sub line was wired into the cron.
  const signatureSub = candidate.proposed_change.display_signature_sub;

  // Volume: big number "N" above small "times this month" (sketch 006 lock).
  const volumeBig = candidate.matched_event_count_30d;
  const volumeSmall = "times this month";

  // Savings: whole euros + small "est. saved" label below, "—" when null.
  const cents = candidate.expected_savings_cents_per_month;
  const savingsBig = cents === null ? "—" : `€${Math.round(cents / 100)}/mo`;
  const savingsSmall = "est. saved";

  // First-seen / last-seen for the hover tooltip. We don't have per-event
  // timestamps in the row contract; surface created_at (first surfaced) +
  // updated_at (last cron tick) so the tooltip stays useful without needing
  // an extra join.
  const firstSeen = useMemo(() => formatDateNL(candidate.created_at), [candidate.created_at]);
  const lastSeen = useMemo(() => formatDateNL(candidate.updated_at), [candidate.updated_at]);

  const statusLabel = STATUS_LABEL[candidate.status];
  const statusBg = STATUS_BG_TOKEN[candidate.status];
  const statusFg = STATUS_FG_TOKEN[candidate.status];

  return (
    <article
      data-testid="cluster-card"
      data-candidate-id={candidate.id}
      className={styles.card}
    >
      <span
        data-testid="cluster-card-kind"
        className={styles.kindBadge}
        style={{ background: kindBg }}
      >
        {kindLabel}
      </span>

      <div className={styles.signatureCell}>
        <span
          data-testid="cluster-card-signature"
          className={styles.signatureLine}
          title={signature}
        >
          {signature}
        </span>
        {signatureSub && (
          <span
            data-testid="cluster-card-signature-sub"
            className={styles.signatureSub}
            title={signatureSub}
          >
            {signatureSub}
          </span>
        )}
      </div>

      <div
        data-testid="cluster-card-volume"
        className={styles.volumeCell}
        tabIndex={0}
        aria-label={`Volume: ${volumeBig} ${volumeSmall}`}
      >
        <span className={styles.volumeBig}>{volumeBig}</span>
        <span className={styles.volumeSmall}>{volumeSmall}</span>
        <span
          data-testid="cluster-card-volume-tooltip"
          className={styles.volumeTooltip}
          role="tooltip"
        >
          {candidate.matched_event_count_30d}× in last 30d · first seen{" "}
          {firstSeen} · last seen {lastSeen}
        </span>
      </div>

      <div data-testid="cluster-card-savings" className={styles.savingsCell}>
        <span
          className={cents === null ? styles.savingsBigNull : styles.savingsBig}
        >
          {savingsBig}
        </span>
        <span className={styles.savingsSmall}>{savingsSmall}</span>
      </div>

      <div className={styles.actionCell}>
        <span
          data-testid="cluster-card-status"
          className={styles.statusPill}
          style={{ background: statusBg, color: statusFg }}
        >
          {statusLabel}
        </span>
        <Link
          data-testid="cluster-card-review-cta"
          href={`/automations/${swarmType}/patterns/${candidate.id}`}
          className={styles.reviewCta}
        >
          Review →
        </Link>
      </div>
    </article>
  );
}
