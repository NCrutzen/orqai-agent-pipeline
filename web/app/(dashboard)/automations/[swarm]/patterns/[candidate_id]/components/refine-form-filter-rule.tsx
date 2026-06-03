"use client";

// Phase 4 Plan 03 Task 3 — kind-specific refine form: Filter rule.
//
// subject_pattern textbox (prepopulated from proposed_change.structured_payload)
// + optional sender_filter narrowing list. Reports refinement validity +
// payload back to the parent ActionCard so Submit can gate.

import { useCallback, useState } from "react";
import type { RefinementPayload } from "@/lib/promotion-recommender/types";

export interface RefineFormFilterRuleProps {
  initial: { subject_pattern: string; sender_filter?: string[] };
  onChange: (next: { valid: boolean; payload: RefinementPayload }) => void;
}

export function RefineFormFilterRule({
  initial,
  onChange,
}: RefineFormFilterRuleProps) {
  const [subjectPattern, setSubjectPattern] = useState(initial.subject_pattern ?? "");
  const [senderFilterText, setSenderFilterText] = useState(
    (initial.sender_filter ?? []).join(", "),
  );

  const emit = useCallback(
    (subject: string, senderRaw: string) => {
      const senderFilter = senderRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const payload: RefinementPayload = {
        kind: "regex_rule",
        subject_pattern: subject,
        ...(senderFilter.length > 0 ? { sender_filter: senderFilter } : {}),
      };
      onChange({ valid: subject.trim().length >= 3, payload });
    },
    [onChange],
  );

  return (
    <div
      data-testid="refine-form-filter-rule"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
        border: "1px solid var(--v7-amber, var(--amber))",
        borderRadius: 6,
        background: "var(--v7-bg)",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Subject pattern</span>
        <input
          data-testid="refine-subject-pattern"
          type="text"
          value={subjectPattern}
          onChange={(e) => {
            setSubjectPattern(e.target.value);
            emit(e.target.value, senderFilterText);
          }}
          maxLength={200}
          placeholder="e.g. invoice copy"
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--v7-border)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "var(--v7-font-sans)",
            background: "var(--v7-bg)",
            color: "var(--v7-text)",
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Narrow to senders (optional, comma-separated)</span>
        <input
          data-testid="refine-sender-filter"
          type="text"
          value={senderFilterText}
          onChange={(e) => {
            setSenderFilterText(e.target.value);
            emit(subjectPattern, e.target.value);
          }}
          placeholder="ap@vendor.com, billing@other.com"
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--v7-border)",
            borderRadius: 4,
            fontSize: 13,
            background: "var(--v7-bg)",
            color: "var(--v7-text)",
          }}
        />
      </label>
    </div>
  );
}
