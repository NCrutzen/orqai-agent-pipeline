"use client";

// Phase 2 Plan 02-05 — Stage 2 Read column.
//
// Renders the 4-step Stage 2 resolver chain (operator-facing labels) plus the
// resolved customer + brand badge. Pure read-only: no edit affordances on
// brand (CON-brand-register-trust-boundary), no override controls (Phase 3
// territory per sketch 004 lock).
//
// Phase 04.1 — Plan 06 (P4.1-D-01 / D-02 / D-03). Per-step trace now
// lands here via row.stage_2.resolver_steps[] + winner_step. The empty-
// state fallback (resolver_steps === null) is the forward-only-emit gap
// per P4.1-D-02 + SC #6: pre-Phase-04.1 rows render "Resolver path not
// recorded for this row." instead of a fictional trace.
//
// Hard-separation invariant: this component never reads swarm_intents or
// swarm_noise_categories. Stage 2 vocabulary = customer_account_id +
// entity_brand (validated against swarms.entity_brand registry by the
// hydrator, codegen'd into ENTITY_BRANDS).
//
// Step mapping (RESEARCH §5 + hydrate.ts:283-322):
//   row.stage_2.resolver_source === 'sender_map'        → Step 2 wins
//   row.stage_2.resolver_source === 'identifier_match'  → Step 3 wins
//   row.stage_2.resolver_source === 'llm_tiebreaker'    → Step 4 wins
//   row.stage_2.resolver_source === null                → No step wins
//                                                         (entire chain stays "skipped")

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type { Entity } from "@/lib/automations/debtor-email/coordinator/entity.generated";
import { ResolverChain, type ResolverChainCandidate } from "./resolver-chain";

interface Stage2ReadProps {
  row: BulkReviewRow;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--v7-fg-muted)",
        fontWeight: 600,
        fontFamily: "var(--v7-font-mono)",
      }}
    >
      {children}
    </div>
  );
}

// Phase 04.1 — Plan 08. Standalone AI-tiebreaker evidence block. Renders the
// competing candidate customers + the system's reasoning straight from
// stage_2.inputs (kind === 'llm_tiebreaker'), independent of the resolver
// step-chain (which is never persisted in the current corpus). Answers the
// operator question: which customers were weighed, which was chosen, and why.
// "AI" is operator-safe language; "LLM" is not (operator-language lock).
function TiebreakerAnalysis({
  candidates,
  picked_account_id,
  reason,
}: {
  candidates: ResolverChainCandidate[];
  picked_account_id: string | null;
  reason: string | null;
}) {
  return (
    <div
      data-testid="stage-2-tiebreaker-analysis"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <SectionLabel>{`AI WEIGHED ${candidates.length} CUSTOMERS`}</SectionLabel>
      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}
      >
        {candidates.map((c) => {
          const isPicked = c.id === picked_account_id;
          return (
            <article
              key={c.id}
              data-testid="tiebreaker-candidate"
              data-picked={isPicked ? "true" : "false"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "var(--space-2) var(--space-3)",
                background: isPicked
                  ? "var(--v7-state-match-bg)"
                  : "var(--v7-panel-2)",
                borderRadius: "var(--v7-radius-sm)",
                borderLeft: isPicked
                  ? "3px solid var(--v7-brand-primary)"
                  : "3px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  fontSize: 13,
                  color: "var(--v7-text)",
                }}
              >
                <span style={{ flex: 1, fontWeight: isPicked ? 600 : 400 }}>
                  {c.name}
                </span>
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
                  {isPicked ? "chosen" : "considered"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--v7-font-mono)",
                  color: "var(--v7-fg-muted)",
                }}
              >
                acct {c.id}
                {c.contact_person ? ` · ${c.contact_person}` : ""}
                {c.recent_invoices.length > 0
                  ? ` · ${c.recent_invoices.length} recent invoices`
                  : ""}
              </div>
            </article>
          );
        })}
      </div>
      {reason ? (
        <div
          data-testid="stage-2-tiebreaker-reason"
          style={{
            fontSize: 12,
            color: "var(--v7-fg-muted)",
            lineHeight: 1.5,
            paddingTop: "var(--space-1)",
          }}
        >
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--v7-fg-muted)",
              fontWeight: 600,
              fontFamily: "var(--v7-font-mono)",
              display: "block",
              marginBottom: 2,
            }}
          >
            Why this one
          </span>
          {reason}
        </div>
      ) : null}
    </div>
  );
}

// Brand → CSS token mapping. Codegen'd ENTITY_BRANDS today =
// berki, fire-control, sicli-noord, sicli-sud, smeba, smeba-fire (Phase 69).
// Extra deferred-brand mappings (lifebee, nbf, iccafe, iccafe-france) are
// defensive: if historic rows ever surface them, the renderer falls back to
// a generic token instead of crashing (project_brand_scope memo).
function brandTokens(brand: Entity | string): {
  bg: string;
  fg: string;
} {
  switch (brand) {
    case "smeba":
      return { bg: "var(--v7-brand-smeba-soft)", fg: "var(--v7-brand-smeba)" };
    case "smeba-fire":
      return {
        bg: "var(--v7-brand-smeba-fire-soft)",
        fg: "var(--v7-brand-smeba-fire)",
      };
    case "fire-control":
      return {
        bg: "var(--v7-brand-fire-control-soft)",
        fg: "var(--v7-brand-fire-control)",
      };
    case "berki":
      return { bg: "var(--v7-brand-berki-soft)", fg: "var(--v7-brand-berki)" };
    case "sicli-noord":
      return {
        bg: "var(--v7-brand-sicli-noord-soft)",
        fg: "var(--v7-brand-sicli-noord)",
      };
    case "sicli-sud":
      return {
        bg: "var(--v7-brand-sicli-sud-soft)",
        fg: "var(--v7-brand-sicli-sud)",
      };
    case "lifebee":
      return {
        bg: "var(--v7-brand-lifebee-soft)",
        fg: "var(--v7-brand-lifebee)",
      };
    case "nbf":
      return { bg: "var(--v7-brand-nbf-soft)", fg: "var(--v7-brand-nbf)" };
    case "iccafe":
    case "iccafe-france":
      return {
        bg: "var(--v7-brand-iccafe-soft)",
        fg: "var(--v7-brand-iccafe)",
      };
    default:
      return {
        bg: "var(--v7-brand-fallback-soft)",
        fg: "var(--v7-brand-fallback)",
      };
  }
}

export function Stage2Read({ row }: Stage2ReadProps) {
  const slot = row.stage_2;

  if (slot === null) {
    return (
      <p
        data-testid="stage-2-read-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Stage 2 has not yet run on this row.
      </p>
    );
  }

  // Phase 04.1 — Plan 08. Tiebreaker context reads from the typed slot.inputs
  // discriminated union (projected by hydrate.ts from
  // pipeline_events.decision_details.inputs). Narrow on the llm_tiebreaker
  // kind to surface the competing candidate customers + the system's reason.
  const inputs = slot.inputs;
  const resolvedAcct =
    slot.corrected_customer_account_id ?? slot.customer_account_id;
  const tiebreakerCandidates: ResolverChainCandidate[] | null =
    inputs !== null && inputs.kind === "llm_tiebreaker"
      ? inputs.candidates
      : null;
  // The persisted inputs carry no `picked_account_id` (verified live: 0/10
  // tiebreaker rows have it), so the "picked" candidate is the resolved
  // customer_account_id on this slot — fall back to it when the field is
  // absent. NEVER fabricate a pick.
  const tiebreakerPicked: string | null =
    inputs !== null && inputs.kind === "llm_tiebreaker"
      ? (inputs.picked_account_id ?? resolvedAcct)
      : null;
  const tiebreakerReason: string | null =
    inputs !== null && inputs.kind === "llm_tiebreaker" ? inputs.llm_reason : null;

  const brand = slot.entity_brand;
  const brandStyles = brand !== null ? brandTokens(brand) : null;

  return (
    <div
      data-testid="stage-2-read"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      <SectionLabel>CUSTOMER RESOLUTION</SectionLabel>

      {/* Resolved customer line + brand badge.
       * Plan 03-13 (UAT r3-1): when slot.customer_name is present (sourced
       * from email_labels.debtor_name via Plan 03-12), render the NAME as the
       * headline with `acct {id} · NXT` as a mono sub-line. When null, render
       * the account-only line — NEVER fabricate a name, NEVER "(name
       * unavailable)" (anti-fabrication lock). */}
      <div
        data-testid="stage-2-read-customer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          fontSize: 13,
          color: "var(--v7-text)",
        }}
      >
        {(() => {
          const acct =
            slot.corrected_customer_account_id ?? slot.customer_account_id;
          if (slot.customer_name) {
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span
                  data-testid="stage-2-read-customer-name"
                  style={{ fontSize: 14, fontWeight: 600, color: "var(--v7-text)" }}
                >
                  {slot.customer_name}
                </span>
                {acct ? (
                  <span
                    data-testid="stage-2-read-customer-acct"
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--v7-font-mono)",
                      color: "var(--v7-fg-muted)",
                    }}
                  >
                    acct {acct} · NXT
                  </span>
                ) : null}
              </div>
            );
          }
          // Account-only fallback (no name on this row).
          return (
            <>
              <span style={{ color: "var(--v7-fg-muted)" }}>Customer:</span>
              <span
                data-testid="stage-2-read-customer-acct"
                style={{
                  fontFamily: "var(--v7-font-mono)",
                  color: "var(--v7-text)",
                }}
              >
                {acct ?? "—"}
              </span>
            </>
          );
        })()}
        <span style={{ flex: 1 }} />
        {brand !== null && brandStyles !== null ? (
          <span
            data-testid="stage-2-read-brand-badge"
            data-brand={brand}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 10px",
              background: brandStyles.bg,
              color: brandStyles.fg,
              borderRadius: "var(--v7-radius-pill)",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--v7-font-mono)",
              whiteSpace: "nowrap",
            }}
          >
            {brand}
          </span>
        ) : null}
      </div>

      {/* 4-step resolver chain — driven by row.stage_2.resolver_steps +
       * winner_step (Plan 04). Empty state when resolver_steps === null
       * is rendered inside ResolverChain (SC #6). */}
      <div
        data-testid="stage-2-read-chain"
        style={{
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid var(--v7-border)",
          paddingTop: "var(--space-2)",
        }}
      >
        {tiebreakerCandidates !== null && slot.resolver_steps === null ? (
          // The resolver step-trace is not persisted in the current corpus
          // (verified live: 0 rows carry `steps`), so the step chain would
          // only ever render its "Resolver path not recorded" empty state.
          // When this row was decided by the AI tiebreaker we DO have the
          // candidate evidence in `inputs` — surface it directly so the
          // operator sees which customers were weighed + why.
          <TiebreakerAnalysis
            candidates={tiebreakerCandidates}
            picked_account_id={tiebreakerPicked}
            reason={tiebreakerReason}
          />
        ) : (
          <ResolverChain
            steps={slot.resolver_steps}
            winner={slot.winner_step}
            tiebreaker_candidates={tiebreakerCandidates}
            tiebreaker_picked_account_id={tiebreakerPicked}
          />
        )}
      </div>
    </div>
  );
}
