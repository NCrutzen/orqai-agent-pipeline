"use client";

// Phase 4 Plan 03 Task 3 — full candidate-detail surface (S11 sketch 007 lock).
//
// Layout:
//   header (breadcrumb + kind + signature + status + headline stats)
//   ────────────────────────────────────────────────────────────────────
//   left (1.4fr): ProposedChangeCard + EvidenceRows
//   right (1fr): ActionCard
//   ────────────────────────────────────────────────────────────────────
//   footer: rendered by ActionCard (reversibility copy)
//
// Operator terminology lock (P4-D-04): KIND_LABEL + STATUS_LABEL maps inline.

import Link from "next/link";
import type { CandidateDetailBundle } from "../_lib/hydrate-candidate-detail";
import type { PromotionKind, PromotionStatus } from "@/lib/promotion-recommender/types";
import { ProposedChangeCard } from "./components/proposed-change-card";
import { EvidenceRows } from "./components/evidence-rows";
import { ActionCard } from "./components/action-card";

export interface CandidateDetailShellProps {
  swarm: string;
  bundle: CandidateDetailBundle;
}

const KIND_LABEL: Record<PromotionKind, string> = {
  regex_rule: "Filter rule",
  sender_mapping: "Known sender",
  prompt_tune_stage_3: "AI tuning",
  new_intent: "New topic",
  prompt_tune_stage_4: "Draft style",
};

// Sketch 007 breadcrumb lock — full stage path under "Patterns / …".
const STAGE_FROM_KIND: Record<PromotionKind, string> = {
  regex_rule: "Stage 1 · Noise filter",
  sender_mapping: "Stage 2 · Customer",
  prompt_tune_stage_3: "Stage 3 · Topic",
  new_intent: "Stage 3 · Topic",
  prompt_tune_stage_4: "Stage 4 · Action",
};

const STATUS_LABEL: Record<PromotionStatus, string> = {
  open: "needs review",
  in_review: "being reviewed",
  approved: "applied",
  rejected: "dismissed",
  rolled_back: "rolled back",
};

const STATUS_COLOR: Record<PromotionStatus, string> = {
  open: "var(--v7-patterns, var(--patterns))",
  in_review: "var(--v7-amber, var(--amber))",
  approved: "var(--v7-lime, var(--lime))",
  rejected: "var(--v7-text-muted)",
  rolled_back: "var(--v7-orange, var(--orange))",
};

function formatSavings(cents: number | null): string {
  if (cents === null) return "—";
  const euros = Math.round(cents / 100);
  return `est. €${euros}/mo`;
}

// Sketch 007 breadcrumb lock: "pc_a91f3b · created 2026-05-18".
function shortCandidateRef(id: string, createdAt: string): string {
  const short = `pc_${id.replace(/-/g, "").slice(0, 6)}`;
  let datePart = "";
  try {
    datePart = new Date(createdAt).toISOString().slice(0, 10);
  } catch {
    datePart = createdAt.slice(0, 10);
  }
  return `${short} · created ${datePart}`;
}

export function CandidateDetailShell({ swarm, bundle }: CandidateDetailShellProps) {
  const { candidate, evidence_emails, evidence_total_count } = bundle;
  const kindLabel = KIND_LABEL[candidate.kind] ?? candidate.kind;
  const statusLabel = STATUS_LABEL[candidate.status] ?? candidate.status;
  const statusColor = STATUS_COLOR[candidate.status] ?? "var(--v7-text-muted)";

  return (
    <main
      data-testid="candidate-detail-shell"
      data-swarm={swarm}
      data-candidate-id={candidate.id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4, 20px)",
        padding: "var(--space-4, 20px)",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header
        data-testid="detail-header"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-2, 8px)" }}
      >
        <nav data-testid="breadcrumb" style={{ fontSize: 12, color: "var(--v7-text-muted)" }}>
          <Link
            href={`/automations/${swarm}/patterns`}
            style={{ color: "var(--v7-text-muted)", textDecoration: "none" }}
          >
            ← Patterns
          </Link>
          <span style={{ margin: "0 6px" }}>/</span>
          <span>{STAGE_FROM_KIND[candidate.kind] ?? kindLabel}</span>
          <span style={{ margin: "0 6px" }}>/</span>
          <span
            data-testid="breadcrumb-candidate-ref"
            style={{ fontFamily: "var(--v7-font-mono)", color: "var(--v7-faint, var(--v7-text-muted))" }}
          >
            {shortCandidateRef(candidate.id, candidate.created_at)}
          </span>
        </nav>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-3, 12px)",
            flexWrap: "wrap",
          }}
        >
          <span
            data-testid="kind-label"
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "2px 8px",
              border: "1px solid var(--v7-border)",
              borderRadius: 12,
              color: "var(--v7-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {kindLabel}
          </span>
          <h1
            data-testid="display-signature"
            style={{ fontSize: 18, fontWeight: 600, margin: 0, lineHeight: 1.3 }}
          >
            {candidate.proposed_change.display_signature}
          </h1>
          <span
            data-testid="status-pill"
            data-status={candidate.status}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 10px",
              borderRadius: 12,
              background: statusColor,
              color: "var(--v7-bg)",
            }}
          >
            {statusLabel}
          </span>
        </div>
        <p
          data-testid="headline-stats"
          style={{ fontSize: 13, color: "var(--v7-text-muted)", margin: 0 }}
        >
          <span>Seen </span>
          <strong style={{ color: "var(--v7-text)" }}>
            {candidate.matched_event_count_30d} times this month
          </strong>
          <span> · est. saves </span>
          <strong style={{ color: "var(--v7-lime)" }}>
            {candidate.expected_savings_cents_per_month === null
              ? "—"
              : `€${Math.round(candidate.expected_savings_cents_per_month / 100)} / month`}
          </strong>
        </p>
        {candidate.proposed_change.display_signature_sub && (
          <p
            data-testid="display-signature-sub"
            style={{
              fontSize: 13,
              color: "var(--v7-text-muted)",
              margin: 0,
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            {candidate.proposed_change.display_signature_sub}
          </p>
        )}
      </header>

      <div
        data-testid="detail-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "var(--space-4, 20px)",
        }}
      >
        <div
          data-testid="detail-left"
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-3, 12px)" }}
        >
          <ProposedChangeCard proposedChange={candidate.proposed_change} />
          <EvidenceRows
            kind={candidate.kind}
            emails={evidence_emails}
            totalCount={evidence_total_count}
          />
        </div>
        <div data-testid="detail-right">
          <ActionCard
            swarm={swarm}
            candidateId={candidate.id}
            kind={candidate.kind}
            proposedChange={candidate.proposed_change}
          />
        </div>
      </div>
    </main>
  );
}
