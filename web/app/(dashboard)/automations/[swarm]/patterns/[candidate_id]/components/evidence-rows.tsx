"use client";

// Phase 4 Plan 03 Task 3 — evidence rows section.
// Up to 5 affected emails (sender + subject + received_at + per-kind chip).

import type { EvidenceEmail } from "../../_lib/hydrate-candidate-detail";
import type { PromotionKind } from "@/lib/promotion-recommender/types";

export interface EvidenceRowsProps {
  kind: PromotionKind;
  emails: EvidenceEmail[];
  totalCount: number;
}

const CHIP_BY_KIND: Record<PromotionKind, string> = {
  regex_rule: "→ would auto-archive",
  sender_mapping: "→ would auto-route to known customer",
  prompt_tune_stage_3: "→ AI tuning",
  new_intent: "→ New topic",
  prompt_tune_stage_4: "→ Draft style",
};

function shortSubject(subject: string): string {
  const trimmed = subject.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

function formatReceivedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function EvidenceRows({ kind, emails, totalCount }: EvidenceRowsProps) {
  const chip = CHIP_BY_KIND[kind];
  return (
    <div
      data-testid="evidence-rows"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
    >
      <h3
        data-testid="evidence-rows-header"
        style={{ fontSize: 13, fontWeight: 600, margin: 0 }}
      >
        {Math.min(emails.length, 5)} of {totalCount} affected emails
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {emails.slice(0, 5).map((e) => (
          <li
            key={e.id}
            data-testid="evidence-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              padding: "var(--space-2)",
              border: "1px solid var(--v7-border)",
              borderRadius: 4,
              background: "var(--v7-bg)",
              fontSize: 13,
            }}
          >
            <div>
              <div style={{ color: "var(--v7-text-muted)", fontSize: 12 }}>
                {e.sender_email} · {formatReceivedAt(e.received_at)}
              </div>
              <div style={{ marginTop: 2 }}>{shortSubject(e.subject)}</div>
            </div>
            <span
              data-testid="evidence-chip"
              style={{
                alignSelf: "center",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--v7-text-muted)",
              }}
            >
              {chip}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
