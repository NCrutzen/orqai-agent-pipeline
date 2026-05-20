"use client";

// Phase 88 Plan 02 — Stage 3 override widget (shell-local).
//
// Wraps the existing Stage 3 intent picker
// (web/app/(dashboard)/automations/[swarm]/stage-1/components/stage-3-widget.tsx
// — exported as `Stage3Widget`) with the same shape as `stage-1-widget.tsx`:
// inline note Textarea (fused per D-01b), EvalTypeRadio, override POST handler
// (axis=stage_3_intent), recordVerdict success path, optimistic-removal,
// and the canonical window-event listeners.
//
// HARD-SEPARATION (docs/agentic-pipeline/README.md):
//   Stage 3 = intent classifier. This widget consumes `SwarmIntentRow[]` ONLY
//   and MUST NOT import the Stage 1 noise-registry row type. Enforced by a
//   source-file grep gate + vitest assertion.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Stage3Widget as Stage3IntentSelect } from "../../stage-1/components/stage-3-widget";
import {
  EvalTypeRadio,
  type EvalType,
} from "../../stage-1/components/eval-type-radio";
import { recordVerdict } from "../../stage-1/actions";
import { useSelection } from "../selection-context";
import type { SwarmIntentRow } from "@/lib/swarms/types";
import type { PredictedRow } from "../../stage-1/page";

// ---- Public props --------------------------------------------------------

export interface Stage3OverrideWidgetProps {
  /** Hard-sep: intent registry ONLY. */
  intents: SwarmIntentRow[];
  /** Current Stage 3 prediction (null when fresh). */
  value: string | null;
  /** Marks the parent's stage-3 cell dirty in the unified pane. */
  onChange: (intentKey: string) => void;
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

export function Stage3OverrideWidget({
  intents,
  value,
  onChange,
  row,
  swarmType,
}: Stage3OverrideWidgetProps) {
  const router = useRouter();
  const { markPendingRemoval, setSelected } = useSelection();

  const [dirty, setDirty] = useState<{ intent_key: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [evalType, setEvalType] = useState<EvalType>("regression");
  const [submitting, setSubmitting] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
    setSubmitting(false);
  }, [row.id]);

  const intentLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of intents) m.set(i.intent_key, i.display_label);
    return m;
  }, [intents]);

  const result = readResult(row);
  const ruleKey = result.predicted?.rule ?? "no_match";
  const predictedCategory =
    result.predicted?.category ?? row.topic ?? "unknown";

  const notesRequired = evalType === "regression";
  const notesValid = !notesRequired || notes.trim().length >= 10;

  const discardOverride = useCallback(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
  }, []);

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
        axis: "stage_3_intent",
        email_id: emailId,
        original_event_id: "00000000-0000-0000-0000-000000000000",
        original_decision: value ?? "",
        decision: dirty.intent_key,
        decision_details: { intent_key: dirty.intent_key },
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
          override_category: dirty.intent_key,
          notes: notes || undefined,
        });
      } catch {
        // Non-fatal — override POST already landed.
      }
      const subj = result.subject ?? "(no subject)";
      toast.success(
        `Intent override recorded for ${subj} → ${
          intentLabelByKey.get(dirty.intent_key) ?? dirty.intent_key
        }`,
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
    swarmType,
    ruleKey,
    predictedCategory,
    markPendingRemoval,
    setSelected,
    router,
    intentLabelByKey,
  ]);

  const onClickSubmit = useCallback(() => {
    if (submitting) return;
    if (!dirty) {
      toast.error("Pick a new intent from the dropdown first.");
      return;
    }
    if (notesRequired && notes.trim().length < 10) {
      notesRef.current?.focus();
      toast.error("Regression overrides need a note — what changed?");
      return;
    }
    void submitOverride();
  }, [dirty, submitting, notesRequired, notes, submitOverride]);

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

  const dropdownValue = dirty?.intent_key ?? value ?? null;

  return (
    <div className="flex flex-col gap-3" data-testid="stage-3-override-widget">
      <Stage3IntentSelect
        intents={intents}
        value={dropdownValue}
        onChange={(intentKey) => {
          onChange(intentKey);
          setDirty({ intent_key: intentKey });
        }}
      />

      {dirty && (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="stage-3-override-notes"
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
              id="stage-3-override-notes"
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                notesRequired
                  ? "Why is this intent wrong? (≥10 chars)"
                  : "Why is this intent wrong?"
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
