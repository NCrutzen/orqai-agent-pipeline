"use client";

// Phase 82 Plan 01 — Stage 0 injection_suspected 2-state toggle widget.
//
// Net-new (no Stage 0 cell exists in the legacy 4-axis pane). Mirrors the
// visual idiom of Stage 1's eval-type radio pair (radio-row inside the
// per-stage widget area).
//
// Stage 0 is the safety-pre-filter axis: a row is either "Injection suspected"
// (LLM/prompt-injection or unsafe content detected) or "Clean" (passes safety
// gate). Operators override here to either escalate a missed injection
// (false-negative) or clear a false-positive.
//
// 2026-05-19 — wired the override-submit + approve flow. Listens for
// `bulk-review:override-submit` (footer Submit) and calls the Stage 0 server
// action that writes email_feedback + dispatches the safety worker re-emit.
// Without this, Submit-override on Stage 0 fired the window event but no
// listener existed, so nothing happened.

import { useEffect, type ChangeEvent } from "react";
import { toast } from "sonner";
import { overrideStage0Safety } from "../../stage-0/actions";
import { useSelection } from "../selection-context";

interface Stage0WidgetProps {
  value: boolean | null;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Email id (uuid). When provided alongside swarmType, the widget wires the
   *  Submit-override footer action via window event. */
  emailId?: string;
  swarmType?: string;
}

export function Stage0Widget({
  value,
  onChange,
  disabled,
  emailId,
  swarmType,
}: Stage0WidgetProps) {
  const handleChange = (next: boolean) => (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) onChange(next);
  };

  const { markPendingRemoval } = useSelection();

  useEffect(() => {
    if (!emailId || !swarmType) return;
    const onOverrideSubmit = async () => {
      if (value === null) {
        toast.error("Pick a Stage 0 verdict before submitting.");
        return;
      }
      try {
        await overrideStage0Safety({
          email_id: emailId,
          swarm_type: swarmType,
          corrected_value: value ? "injection_suspected" : "safe",
        });
        // Optimistic removal — the loader's excludeReviewed filter will
        // confirm on next server round-trip; markPendingRemoval keeps the
        // row hidden in the meantime.
        markPendingRemoval(emailId);
        toast.success(
          value
            ? "Stage 0 verdict re-affirmed as injection_suspected"
            : "Stage 0 override sent — re-routing as safe",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "override failed";
        toast.error(`Stage 0 override failed: ${msg}`);
      }
    };
    window.addEventListener("bulk-review:override-submit", onOverrideSubmit);
    return () => {
      window.removeEventListener(
        "bulk-review:override-submit",
        onOverrideSubmit,
      );
    };
  }, [emailId, swarmType, value, markPendingRemoval]);

  return (
    <fieldset
      aria-label="Stage 0 safety verdict"
      style={{
        border: 0,
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
      disabled={disabled}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: 13,
          color: "var(--v7-text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="radio"
          name="stage-0-verdict"
          value="injection_suspected"
          checked={value === true}
          onChange={handleChange(true)}
          disabled={disabled}
        />
        <span>Injection suspected</span>
      </label>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: 13,
          color: "var(--v7-text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="radio"
          name="stage-0-verdict"
          value="clean"
          checked={value === false}
          onChange={handleChange(false)}
          disabled={disabled}
        />
        <span>Clean</span>
      </label>
    </fieldset>
  );
}
