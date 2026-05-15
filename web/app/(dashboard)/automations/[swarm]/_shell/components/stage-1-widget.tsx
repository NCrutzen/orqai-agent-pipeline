"use client";

// Phase 82.1 Plan 04 — Stage 1 override widget (shell-local).
//
// Ported from the legacy Stage 1 detail-pane override picker (Phase 71-05
// / Phase 82-06) — the source file was deleted in this plan after the port.
// Owns just the stage_1 axis flow: category dropdown + notes + eval-type +
// OverrideConfirmDialog + POST /api/automations/debtor-email/override +
// optimistic removal via useSelection().markPendingRemoval.
//
// HARD-SEPARATION (CONTEXT D-11, docs/agentic-pipeline/README.md):
//   This widget reads the noise registry ONLY via SwarmNoiseCategoryRow.
//   It MUST NOT import the intent-registry types nor reference intent rows
//   under any name. Stage 3 surfaces are routed by the embedded Stage 3
//   widget in UnifiedDetailPane via a separate prop on the pane — never
//   through this widget. Enforced by a source-file grep gate in the plan
//   acceptance criteria + a vitest assertion in stage-1-widget.test.tsx.
//
// Chrome that already lives on UnifiedDetailPane (header, subject, body
// expander, 5-cell PipelineFlow, action footer) is intentionally NOT
// duplicated here — this widget renders inline in the Stage 1 cell and the
// pane provides the outer surface.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Stage1Widget as Stage1CategorySelect } from "../../stage-1/components/stage-1-widget";
import {
  EvalTypeRadio,
  type EvalType,
} from "../../stage-1/components/eval-type-radio";
import {
  OverrideConfirmDialog,
  type OverrideConfirmTrigger,
} from "../../stage-1/components/override-confirm-dialog";
import { recordVerdict } from "../../stage-1/actions";
import { useSelection } from "../selection-context";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { PredictedRow } from "../../stage-1/page";

// ---- Public props (CONTEXT D-08 locked) --------------------------------

export interface Stage1WidgetProps {
  /** Hard-sep: noise registry ONLY. */
  categories: SwarmNoiseCategoryRow[];
  /** Current Stage 1 prediction (null when fresh). */
  value: string | null;
  /** Marks the parent's stage-1 cell dirty in the unified pane. */
  onChange: (next: string) => void;
  /** The PredictedRow shape — needed for server-action args + override
   *  payload (email_id, automation_run_id, result.message_id). */
  row: PredictedRow;
  /** Threaded through recordVerdict + override POST. */
  swarmType: string;
}

// ---- Helpers -----------------------------------------------------------

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

// ---- Component ---------------------------------------------------------

export function Stage1Widget({
  categories,
  value,
  onChange,
  row,
  swarmType,
}: Stage1WidgetProps) {
  const router = useRouter();
  const { markPendingRemoval, setSelected } = useSelection();

  const [dirty, setDirty] = useState<{ categoryKey: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [evalType, setEvalType] = useState<EvalType>("regression");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // For a stage-1-only widget the only confirm trigger we surface is
  // multi_axis (kept for parity with the source — UnifiedDetailPane owns
  // the multi-axis aggregation; we keep the mount here so this widget
  // stays self-contained per CONTEXT D-12).
  const [confirmTrigger] =
    useState<OverrideConfirmTrigger>("multi_axis");

  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Reset local state when the selected row changes.
  useEffect(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
    setSubmitting(false);
    setConfirmOpen(false);
  }, [row.id]);

  const categoryLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.category_key, c.display_label);
    return m;
  }, [categories]);

  // Notes-required: regression overrides need a note (highest-leverage
  // signal for prompt fixes). Unknown-bucket gating not needed here — the
  // unified pane's empty-bucket path covers it; for stage_1-only this
  // simplification matches the original notesRequired semantics.
  const result = readResult(row);
  const ruleKey = result.predicted?.rule ?? "no_match";
  const predictedCategory =
    result.predicted?.category ?? row.topic ?? "unknown";
  const isUnknownBucket =
    predictedCategory === "unknown" || ruleKey === "no_match";
  const notesRequired = isUnknownBucket || evalType === "regression";
  const notesValid = !notesRequired || notes.trim().length >= 10;

  const discardOverride = useCallback(() => {
    setDirty(null);
    setNotes("");
    setEvalType("regression");
    setConfirmOpen(false);
  }, []);

  // POST /api/automations/debtor-email/override for the stage_1 axis only.
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
        axis: "stage_1_category",
        email_id: emailId,
        original_event_id: "00000000-0000-0000-0000-000000000000",
        original_decision: value ?? "",
        decision: dirty.categoryKey,
        decision_details: { category_key: dirty.categoryKey },
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
      // Also fire recordVerdict so the row leaves the queue via the same
      // synchronous path as Approve/Reject (preserves Phase 71-05 behaviour).
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
          override_category: dirty.categoryKey,
          notes: notes || undefined,
        });
      } catch {
        // recordVerdict failure is non-fatal here — the override POST already
        // landed and the row will leave the queue via broadcast on the next
        // server roundtrip.
      }
      const subj = result.subject ?? "(no subject)";
      toast.success(
        `Override recorded for ${subj} → ${
          categoryLabelByKey.get(dirty.categoryKey) ?? dirty.categoryKey
        }`,
      );
      setDirty(null);
      setConfirmOpen(false);
      markPendingRemoval(row.id);
      // Defer URL/selection advance so the toast registers; parent
      // UnifiedDetailPane reads the next selectedId from the row list.
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
    categoryLabelByKey,
  ]);

  // Submit click — fires confirm dialog when triggers apply, else direct.
  const onClickSubmit = useCallback(() => {
    if (submitting) return;
    if (!dirty) {
      // Footer override button can fire override-submit before the operator
      // has picked a new category (Phase 82.5 introduced the footer trigger;
      // widget-dirty stays null until the dropdown changes). Surface a clear
      // toast instead of failing silently — otherwise the click looks broken.
      toast.error("Pick a new category from the dropdown first.");
      return;
    }
    if (notesRequired && notes.trim().length < 10) {
      notesRef.current?.focus();
      toast.error(
        isUnknownBucket
          ? "Briefly describe this email so we can build a rule for it"
          : "Regression overrides need a note — what changed?",
      );
      return;
    }
    // Stage-1-only flow — no multi-axis trigger here; submit directly.
    void submitOverride();
  }, [
    dirty,
    submitting,
    notesRequired,
    notes,
    isUnknownBucket,
    submitOverride,
  ]);

  // Keyboard listeners — Stage-1-only subset (the parent pane wires
  // approve/reject/skip/toggle-body).
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

  // Dropdown value: prefer dirty selection over the original prediction.
  const dropdownValue = dirty?.categoryKey ?? value ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Stage1CategorySelect
        categories={categories}
        value={dropdownValue}
        onChange={(categoryKey) => {
          onChange(categoryKey);
          setDirty({ categoryKey });
        }}
      />

      {dirty && (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="stage-1-override-notes"
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
              id="stage-1-override-notes"
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                notesRequired
                  ? "Required (≥10 chars)…"
                  : "Optional context for downstream eval…"
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
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              onClick={discardOverride}
              disabled={submitting}
            >
              Discard changes
              <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                Esc
              </kbd>
            </Button>
            <Button
              variant="default"
              onClick={onClickSubmit}
              disabled={submitting || !notesValid}
              style={{
                background: "var(--v7-brand-primary)",
                color: "#fff",
              }}
            >
              {submitting ? "Submitting override…" : "Submit override"}
              <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                ⌘⏎
              </kbd>
            </Button>
          </div>
        </>
      )}

      <OverrideConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        trigger={confirmTrigger}
        extra={{
          axis_count: 1,
          axis_list: ["stage_1_category"],
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          void submitOverride();
        }}
        onDismiss={() => setConfirmOpen(false)}
      />
    </div>
  );
}
