"use client";

// Phase 04.1 — Plan 06 (P4.1-D-01 + D-02 + D-03). 4-step vertical resolver
// chain rendered inside stage-2-read.tsx in place of the static STEPS
// placeholder. Visual lock: sketch 004 + canonical-patterns.md.
//
// Hard separation (RFC stage-2-entity.md): this component reads from
// resolver_steps + tiebreaker candidates ONLY. NEVER reads
// noise-categories or intents — those vocabularies belong to Stage 1
// and Stage 3 respectively.

import { Fragment, useState } from "react";
import type { ResolverStep } from "@/lib/bulk-review/types";

// Candidate shape mirrors the runtime Candidate type emitted by
// classifier-label-resolver. Re-declared here to avoid a cross-package
// import; both shapes must stay identical.
export interface ResolverChainCandidate {
  id: string;
  name: string;
  contact_person: string | null;
  recent_invoices: string[];
}

interface ResolverChainProps {
  steps: ResolverStep[] | null;
  winner: 1 | 2 | 3 | 4 | null;
  tiebreaker_candidates: ResolverChainCandidate[] | null;
  tiebreaker_picked_account_id: string | null;
}

const STEP_LABELS: Record<ResolverStep["step"], string> = {
  thread: "Thread inheritance",
  sender_map: "Sender map",
  identifier: "Identifier match",
  llm_tiebreaker: "AI tiebreaker",
};

// No `--v7-stage-2-accent` token exists in globals.css (verified at
// Task 1 read). The canonical orange surface in the V7 palette is
// `--v7-brand-primary` (the canonical orange surface) — that is the
// token used for the winner left-border, matching sketch 004's orange
// winner highlight without introducing a raw hex.
const WINNER_BORDER_TOKEN = "var(--v7-brand-primary)";

function StatusPill({
  status,
}: {
  status: ResolverStep["status"];
}) {
  // Map status vocab → V7 state-token family. Hard-separation
  // invariant unchanged — this is a presentational mapping, not a
  // registry projection.
  const tokenFamily =
    status === "matched" || status === "picked"
      ? "match"
      : status === "conflict"
        ? "blocked"
        : "idle";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        background: `var(--v7-state-${tokenFamily}-bg)`,
        color: `var(--v7-state-${tokenFamily}-fg)`,
        borderRadius: "var(--v7-radius-pill)",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "var(--v7-font-mono)",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

function DetailBlock({
  step,
  isWinner,
  tiebreaker_candidates,
  tiebreaker_picked_account_id,
}: {
  step: ResolverStep;
  isWinner: boolean;
  tiebreaker_candidates: ResolverChainCandidate[] | null;
  tiebreaker_picked_account_id: string | null;
}) {
  const detailEntries =
    step.detail !== null && typeof step.detail === "object"
      ? Object.entries(step.detail)
      : [];

  return (
    <div
      data-testid={`resolver-step-${step.idx}-detail`}
      style={{
        marginTop: "var(--space-2)",
        paddingLeft: "var(--space-3)",
        fontSize: 12,
        color: "var(--v7-fg-muted)",
        fontFamily: "var(--v7-font-mono)",
        lineHeight: 1.5,
      }}
    >
      {detailEntries.length > 0 ? (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-1) var(--space-2)",
            margin: 0,
          }}
        >
          {detailEntries.map(([k, v]) => (
            <Fragment key={k}>
              <dt style={{ color: "var(--v7-fg-muted)" }}>{k}</dt>
              <dd style={{ margin: 0, color: "var(--v7-text)" }}>
                {typeof v === "string" || typeof v === "number"
                  ? String(v)
                  : JSON.stringify(v)}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      {step.step === "llm_tiebreaker" &&
      isWinner &&
      tiebreaker_candidates !== null ? (
        <div
          style={{
            marginTop: "var(--space-2)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          {tiebreaker_candidates.map((c) => {
            const isPicked = c.id === tiebreaker_picked_account_id;
            return (
              <article
                key={c.id}
                data-testid="tiebreaker-candidate"
                data-picked={isPicked ? "true" : "false"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) var(--space-2)",
                  background: isPicked
                    ? "var(--v7-state-match-bg)"
                    : "var(--v7-panel-2)",
                  color: isPicked
                    ? "var(--v7-state-match-fg)"
                    : "var(--v7-text)",
                  borderRadius: "var(--v7-radius-sm)",
                  fontSize: 12,
                }}
              >
                <span style={{ flex: 1 }}>{c.name}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--v7-font-mono)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: isPicked
                      ? "var(--v7-state-match-fg)"
                      : "var(--v7-fg-muted)",
                  }}
                >
                  {isPicked ? "picked" : "alternative"}
                </span>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ResolverChain({
  steps,
  winner,
  tiebreaker_candidates,
  tiebreaker_picked_account_id,
}: ResolverChainProps) {
  const [expandedNonWinner, setExpandedNonWinner] = useState<Set<number>>(
    () => new Set(),
  );

  if (steps === null) {
    return (
      <p
        data-testid="stage-2-read-no-trace"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Resolver path not recorded for this row.
      </p>
    );
  }

  const toggleExpand = (idx: number) => {
    setExpandedNonWinner((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div
      data-testid="resolver-chain"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      {steps.map((step) => {
        const isWinner = step.idx === winner;
        const isDimmed =
          !isWinner &&
          (step.status === "miss" || step.status === "not_run");
        const isExpanded = isWinner || expandedNonWinner.has(step.idx);
        return (
          <div
            key={step.idx}
            data-testid={`resolver-step-${step.idx}`}
            data-status={step.status}
            data-winner={isWinner ? "true" : "false"}
            style={{
              borderLeft: isWinner
                ? `3px solid ${WINNER_BORDER_TOKEN}`
                : "3px solid transparent",
              opacity: isDimmed ? 0.5 : 1,
              padding: "var(--space-2) var(--space-3)",
              marginBottom: "var(--space-1)",
              cursor: !isWinner ? "pointer" : "default",
              background: isWinner ? "var(--v7-panel-2)" : "transparent",
              borderRadius: "var(--v7-radius-sm)",
            }}
            onClick={() => {
              if (!isWinner) toggleExpand(step.idx);
            }}
          >
            <header
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
                fontSize: 13,
                color: "var(--v7-text)",
              }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 11,
                  fontFamily: "var(--v7-font-mono)",
                  color: "var(--v7-fg-muted)",
                  width: 32,
                  flexShrink: 0,
                }}
              >
                {step.idx}
              </span>
              <span style={{ flex: 1, fontWeight: isWinner ? 500 : 400 }}>
                {STEP_LABELS[step.step]}
              </span>
              <span data-testid={`resolver-step-${step.idx}-status`}>
                <StatusPill status={step.status} />
              </span>
            </header>
            {isExpanded ? (
              <DetailBlock
                step={step}
                isWinner={isWinner}
                tiebreaker_candidates={tiebreaker_candidates}
                tiebreaker_picked_account_id={tiebreaker_picked_account_id}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
