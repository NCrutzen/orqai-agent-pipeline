"use client";

// Phase 4 Plan 03 Task 3 — right-column action triad.
//
// Apply (lime, default-selected, ⏎ submits) · Refine (amber) · Dismiss (red).
// Submit button color + label flip per active action. Dismiss reveal shows
// AuditBlock variant='escalate' required=true (UI-SPEC §13 anti-drift #9).
// Refine reveal shows the kind-specific form (Filter rule + Known sender);
// AI tuning / New topic / Draft style show an engineer-handoff notice.
// Reversibility footer copy verbatim per anti-drift #10.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AuditBlock, auditBlockIsComplete } from "../../../_shell/components/audit-block";
import type {
  PromotionKind,
  RefinementPayload,
  ProposedChange,
} from "@/lib/promotion-recommender/types";
import { RefineFormFilterRule } from "./refine-form-filter-rule";
import { RefineFormKnownSender } from "./refine-form-known-sender";
import {
  applyCandidate,
  refineCandidate,
  dismissCandidate,
} from "../../_actions/patterns-actions";

type Action = "apply" | "refine" | "dismiss";

export interface ActionCardProps {
  swarm: string;
  candidateId: string;
  kind: PromotionKind;
  proposedChange: ProposedChange;
}

const ERROR_COPY: Record<string, string> = {
  already_terminal: "Someone else already acted on this suggestion.",
  audit_required: "Reason needs at least 8 characters.",
  "401": "Please sign in.",
  invalid_refinement: "The refined values look incomplete — double-check the form.",
};

const DETERMINISTIC: ReadonlySet<PromotionKind> = new Set([
  "regex_rule",
  "sender_mapping",
]);

const REVERSIBILITY_FOOTER =
  "all actions are logged · an engineer can reverse Apply if it misbehaves";

export function ActionCard({
  swarm,
  candidateId,
  kind,
  proposedChange,
}: ActionCardProps) {
  const router = useRouter();
  const [active, setActive] = useState<Action>("apply");
  const [refinement, setRefinement] = useState<{
    valid: boolean;
    payload: RefinementPayload | null;
  }>({ valid: false, payload: null });
  const [dismissReason, setDismissReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const [appliedMigrationPath, setAppliedMigrationPath] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset error when the active action changes. Done via the "adjust state
  // during render" pattern (store previous prop, compare) rather than an effect
  // — react-hooks/set-state-in-effect forbids synchronous setState in effects,
  // and this is React's recommended way to reset state on a prop change.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setError(null);
  }

  // Dismiss gate: AuditBlock requires non-empty AND the server-side audit_required
  // boundary expects >= 8 chars (matches patterns-actions.dismissCandidate).
  const auditOk =
    auditBlockIsComplete(dismissReason, true) && dismissReason.trim().length >= 8;

  let submitDisabled = isPending;
  if (active === "refine") submitDisabled = submitDisabled || !refinement.valid;
  if (active === "dismiss") submitDisabled = submitDisabled || !auditOk;

  let submitLabel = "Apply suggestion ⏎";
  let submitColorVar = "var(--v7-lime, var(--lime))";
  if (active === "refine") {
    submitLabel = "Apply refined rule ⏎";
    submitColorVar = "var(--v7-amber, var(--amber))";
  } else if (active === "dismiss") {
    submitLabel = "Dismiss suggestion ⏎";
    submitColorVar = "var(--v7-red, var(--red))";
  }

  const handleSubmit = useCallback(() => {
    if (submitDisabled) return;
    setError(null);
    startTransition(async () => {
      let result;
      if (active === "apply") {
        result = await applyCandidate({ candidate_id: candidateId });
      } else if (active === "refine") {
        if (!refinement.payload) return;
        result = await refineCandidate({
          candidate_id: candidateId,
          refinement: refinement.payload,
        });
      } else {
        result = await dismissCandidate({
          candidate_id: candidateId,
          reason: dismissReason,
        });
      }
      if (result.ok) {
        if ("migration_path" in result.data && result.data.migration_path) {
          setAppliedMigrationPath(result.data.migration_path);
          setAppliedMessage(
            (result.data as { message?: string }).message ?? "Applied",
          );
          return; // keep the surface up so engineer can copy the migration
        }
        // Otherwise navigate back to the listing.
        router.push(`/automations/${swarm}/patterns`);
        return;
      }
      const copy = result.code && ERROR_COPY[result.code]
        ? ERROR_COPY[result.code]
        : result.error;
      setError(copy);
    });
  }, [
    active,
    candidateId,
    dismissReason,
    refinement,
    router,
    submitDisabled,
    swarm,
  ]);

  // ⏎ keyboard shortcut — Submit on Enter (unless focus is in a textarea/input
  // where Enter is a normal newline).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter") return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        return;
      }
      ev.preventDefault();
      handleSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSubmit]);

  function actionButton(target: Action, label: string, colorVar: string) {
    const selected = active === target;
    // Sketch 007 lock — Apply is the default-focused action so the operator
    // can hit ⏎ on mount. autoFocus only on Apply; other buttons receive
    // focus via Tab or click.
    const autoFocus = target === "apply";
    return (
      <button
        key={target}
        data-testid={`action-${target}`}
        data-selected={selected ? "true" : "false"}
        type="button"
        autoFocus={autoFocus}
        onClick={() => setActive(target)}
        style={{
          padding: "var(--space-2) var(--space-3)",
          border: `1px solid ${colorVar}`,
          borderRadius: 4,
          background: selected ? colorVar : "var(--v7-bg)",
          color: selected ? "var(--v7-bg)" : "var(--v7-text)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
          outline: selected ? "2px solid var(--v7-brand-primary, var(--brand-primary))" : "none",
          outlineOffset: 2,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <aside
      data-testid="action-card"
      data-active={active}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--v7-border)",
        borderRadius: 6,
        background: "var(--v7-bg)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {actionButton("apply", "Apply", "var(--v7-lime, var(--lime))")}
        {actionButton("refine", "Refine", "var(--v7-amber, var(--amber))")}
        {actionButton("dismiss", "Dismiss", "var(--v7-red, var(--red))")}
      </div>

      {active === "refine" && (
        <div data-testid="refine-reveal">
          {kind === "regex_rule" && proposedChange.structured_payload.kind === "regex_rule" ? (
            <RefineFormFilterRule
              initial={{
                subject_pattern: proposedChange.structured_payload.subject_pattern,
                sender_filter: proposedChange.structured_payload.sender_filter,
              }}
              onChange={setRefinement}
            />
          ) : kind === "sender_mapping" && proposedChange.structured_payload.kind === "sender_mapping" ? (
            <RefineFormKnownSender
              initial={{
                sender_pattern: proposedChange.structured_payload.sender_pattern,
                customer_account_id: proposedChange.structured_payload.customer_account_id,
              }}
              onChange={setRefinement}
            />
          ) : (
            <p
              data-testid="refine-not-wired"
              style={{
                fontSize: 13,
                color: "var(--v7-text-muted)",
                margin: 0,
                padding: "var(--space-2)",
                border: "1px dashed var(--v7-border)",
                borderRadius: 4,
              }}
            >
              Refine isn’t fully wired for this kind yet — Apply will mark this
              suggestion for engineer review.
            </p>
          )}
        </div>
      )}

      {active === "dismiss" && (
        <div data-testid="dismiss-reveal">
          <AuditBlock
            question="Why dismiss this suggestion?"
            sub="At least 8 characters — the engineer reviewing the rollback log relies on this."
            placeholder="e.g. pattern is too broad, would archive legitimate invoices"
            value={dismissReason}
            onChange={setDismissReason}
            required
            variant="escalate"
            testId="dismiss-audit"
            disabled={isPending}
          />
        </div>
      )}

      {error && (
        <p
          data-testid="action-error"
          role="alert"
          style={{ fontSize: 13, color: "var(--v7-red, var(--red))", margin: 0 }}
        >
          {error}
        </p>
      )}

      {appliedMessage && (
        <div
          data-testid="applied-confirmation"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            padding: "var(--space-2)",
            border: "1px solid var(--v7-lime, var(--lime))",
            borderRadius: 4,
            background: "var(--v7-bg)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{appliedMessage}</p>
          {appliedMigrationPath && (
            <code
              data-testid="applied-migration-path"
              style={{ fontSize: 12, color: "var(--v7-text-muted)" }}
            >
              {appliedMigrationPath}
            </code>
          )}
          <button
            type="button"
            onClick={() => router.push(`/automations/${swarm}/patterns`)}
            style={{
              padding: "var(--space-2)",
              border: "1px solid var(--v7-border)",
              borderRadius: 4,
              background: "var(--v7-bg)",
              cursor: "pointer",
            }}
          >
            Back to suggestions
          </button>
        </div>
      )}

      <button
        data-testid="action-submit"
        data-active={active}
        type="button"
        onClick={handleSubmit}
        disabled={submitDisabled}
        style={{
          padding: "var(--space-2) var(--space-3)",
          border: `2px solid ${submitColorVar}`,
          borderRadius: 4,
          background: submitDisabled ? "var(--v7-bg)" : submitColorVar,
          color: submitDisabled ? "var(--v7-text-muted)" : "var(--v7-bg)",
          fontWeight: 700,
          fontSize: 14,
          cursor: submitDisabled ? "not-allowed" : "pointer",
        }}
      >
        {submitLabel}
      </button>

      <p
        data-testid="reversibility-footer"
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--v7-text-muted)",
          lineHeight: 1.4,
        }}
      >
        {REVERSIBILITY_FOOTER}
      </p>

      {!DETERMINISTIC.has(kind) && active === "apply" && (
        <p
          data-testid="engineer-handoff-notice"
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--v7-text-muted)",
            fontStyle: "italic",
          }}
        >
          Engineer will wire this change manually after Apply.
        </p>
      )}
    </aside>
  );
}
