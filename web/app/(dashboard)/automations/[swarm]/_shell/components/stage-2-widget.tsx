"use client";

// Phase 88 Plan 02 — Stage 2 override widget (shell-local).
//
// Wraps the existing Stage 2 customer-search picker
// (web/app/(dashboard)/automations/[swarm]/stage-1/components/stage-2-widget.tsx
// — exported as `Stage2Widget`) with the same shape as `stage-1-widget.tsx`:
// inline note Textarea (fused with the override per D-01b), EvalTypeRadio,
// override POST handler, optimistic-removal via useSelection(), and the
// window event listeners ("bulk-review:override-submit" /
// "bulk-review:override-discard") so the per-stage cancel-override link and
// the footer Submit + Cancel buttons work the same as on Stage 1.
//
// HARD-SEPARATION (docs/agentic-pipeline/README.md):
//   Customer entity sits on the `stage_2_customer` axis — NOT in
//   swarm_noise_categories (Stage 1) nor swarm_intents (Stage 3). This widget
//   must NOT import either of those registry types. Enforced by file-source
//   grep gate in the plan acceptance criteria + a regex assertion in the
//   co-located vitest.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Stage2Widget as Stage2CustomerSelect,
  type CustomerSelection,
} from "../../stage-1/components/stage-2-widget";
import {
  EvalTypeRadio,
  type EvalType,
} from "../../stage-1/components/eval-type-radio";
import { recordVerdict } from "../../stage-1/actions";
import { useSelection } from "../selection-context";
import type { PredictedRow } from "../../stage-1/page";

// ---- Public props --------------------------------------------------------

export interface Stage2OverrideWidgetProps {
  /** Current Stage 2 prediction (null when fresh). */
  value: CustomerSelection | null;
  /** Marks the parent's stage-2 cell dirty in the unified pane. */
  onChange: (next: CustomerSelection) => void;
  /** PredictedRow shape — needed for override POST + recordVerdict args. */
  row: PredictedRow;
  swarmType: string;
}

interface ResultPayload {
  message_id?: string;
  source_mailbox?: string;
  email_id?: string;
  subject?: string;
  predicted?: { rule?: string; category?: string };
}

function readResult(row: PredictedRow): ResultPayload {
  return (row.result as ResultPayload | null) ?? {};
}

export function Stage2OverrideWidget({
  value,
  onChange,
  row,
  swarmType,
}: Stage2OverrideWidgetProps) {
  const router = useRouter();
  const { markPendingRemoval, setSelected } = useSelection();

  const [dirty, setDirty] = useState<{
    customer_account_id: string;
    customer_name: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [evalType, setEvalType] = useState<EvalType>("regression");
  const [submitting, setSubmitting] = useState(false);
  const [reRun, setReRun] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Reset on row change.
  useEffect(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
    setSubmitting(false);
    setReRun(false);
  }, [row.id]);

  const result = readResult(row);
  const ruleKey = result.predicted?.rule ?? "no_match";
  const predictedCategory =
    result.predicted?.category ?? row.topic ?? "unknown";

  // Stage 2 has no "unknown bucket" — only regression overrides require notes.
  const notesRequired = evalType === "regression";
  const notesValid = !notesRequired || notes.trim().length >= 10;

  const discardOverride = useCallback(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
    setReRun(false);
  }, []);

  // POST /api/automations/debtor-email/override for the stage_2_customer axis.
  const submitOverride = useCallback(async () => {
    if (!dirty) return;
    if (submitting) return;
    const emailId = result.email_id ?? row.id;
    if (!emailId) {
      toast.error("Missing email_id — cannot submit override");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        axis: "stage_2_customer",
        email_id: emailId,
        original_event_id: "00000000-0000-0000-0000-000000000000",
        original_decision: value?.customer_account_id ?? "",
        decision: dirty.customer_account_id,
        decision_details: {
          customer_account_id: dirty.customer_account_id,
          customer_name: dirty.customer_name,
          re_run_downstream: reRun,
        },
        eval_type: evalType,
        reason: notes.trim() || undefined,
      };
      const res = await fetch("/api/automations/debtor-email/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "(no body)");
        throw new Error(`Override POST failed (${res.status}): ${errText}`);
      }
      const automationRunId = row.automation_run_id ?? row.id;
      try {
        await recordVerdict({
          swarm_type: swarmType,
          automation_run_id: automationRunId,
          email_id: row.id,
          rule_key: ruleKey,
          decision: "approve",
          message_id: result.message_id ?? "",
          source_mailbox: result.source_mailbox ?? "",
          entity: row.entity ?? "",
          predicted_category: predictedCategory,
          override_category: dirty.customer_account_id,
          notes: notes || undefined,
        });
      } catch {
        // Non-fatal — override POST already landed.
      }
      const subj = result.subject ?? "(no subject)";
      toast.success(
        `Customer override recorded for ${subj} → ${dirty.customer_name}`,
      );
      setDirty(null);
      markPendingRemoval(row.id);
      setTimeout(() => {
        setSelected(null);
        const qs = new URLSearchParams(window.location.search);
        qs.delete("selected");
        router.replace(`${window.location.pathname}?${qs.toString()}`, {
          scroll: false,
        });
      }, 200);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast.error(`Override failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    dirty,
    submitting,
    result.email_id,
    result.message_id,
    result.source_mailbox,
    result.subject,
    row.id,
    row.automation_run_id,
    row.entity,
    value,
    evalType,
    notes,
    reRun,
    swarmType,
    ruleKey,
    predictedCategory,
    markPendingRemoval,
    setSelected,
    router,
  ]);

  const onClickSubmit = useCallback(() => {
    if (submitting) return;
    if (!dirty) {
      toast.error("Pick a customer from the search first.");
      return;
    }
    if (notesRequired && notes.trim().length < 10) {
      notesRef.current?.focus();
      toast.error("Regression overrides need a note — what changed?");
      return;
    }
    void submitOverride();
  }, [dirty, submitting, notesRequired, notes, submitOverride]);

  // Window event listeners — mirror Stage 1 verbatim.
  useEffect(() => {
    const onEvalCap = () => setEvalType("capability");
    const onEvalReg = () => setEvalType("regression");
    const onOverrideSubmit = () => onClickSubmit();
    const onOverrideDiscard = () => discardOverride();
    window.addEventListener("bulk-review:eval-type-capability", onEvalCap);
    window.addEventListener("bulk-review:eval-type-regression", onEvalReg);
    window.addEventListener("bulk-review:override-submit", onOverrideSubmit);
    window.addEventListener("bulk-review:override-discard", onOverrideDiscard);
    return () => {
      window.removeEventListener("bulk-review:eval-type-capability", onEvalCap);
      window.removeEventListener("bulk-review:eval-type-regression", onEvalReg);
      window.removeEventListener("bulk-review:override-submit", onOverrideSubmit);
      window.removeEventListener("bulk-review:override-discard", onOverrideDiscard);
    };
  }, [onClickSubmit, discardOverride]);

  const pickerValue: CustomerSelection | null = dirty
    ? {
        customer_account_id: dirty.customer_account_id,
        customer_name: dirty.customer_name,
      }
    : value;

  return (
    <div className="flex flex-col gap-3" data-testid="stage-2-override-widget">
      <Stage2CustomerSelect
        value={pickerValue}
        onChange={(next) => {
          onChange(next);
          setDirty({
            customer_account_id: next.customer_account_id,
            customer_name: next.customer_name,
          });
        }}
        reRun={reRun}
        onReRunChange={setReRun}
      />

      {dirty && (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="stage-2-override-notes"
              className="text-[13px] font-semibold leading-[1.3] inline-flex items-center gap-1.5"
            >
              Notes
              {notesRequired ? (
                <span
                  className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded-[var(--v7-radius-pill)]"
                  style={{
                    background: "rgba(255,107,122,0.16)",
                    color: "var(--v7-red)",
                  }}
                >
                  required
                </span>
              ) : (
                <span className="text-[12px] font-normal text-[var(--v7-muted)]">
                  (optional)
                </span>
              )}
            </label>
            <Textarea
              id="stage-2-override-notes"
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                notesRequired
                  ? "Why is this customer wrong? (≥10 chars)"
                  : "Why is this customer wrong?"
              }
              rows={3}
              maxLength={1000}
              aria-required={notesRequired}
              aria-invalid={notesRequired && !notesValid}
            />
            {notesRequired && !notesValid && notes.length > 0 && (
              <p
                className="text-[12px] leading-[1.4]"
                style={{ color: "var(--v7-red)" }}
              >
                {`Need at least ${
                  10 - notes.trim().length
                } more character${
                  10 - notes.trim().length === 1 ? "" : "s"
                }.`}
              </p>
            )}
          </div>
          <EvalTypeRadio value={evalType} onChange={setEvalType} />
        </>
      )}
    </div>
  );
}
