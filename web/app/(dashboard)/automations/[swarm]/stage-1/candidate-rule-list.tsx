"use client";

/**
 * Phase 81 Plan 03 Task 2 — Candidate-rule list.
 *
 * Extracted from row-list.tsx::PendingPromotionPanel (line ~268 pre-extract)
 * and lifted to a top-level page-managed component (RESEARCH Pattern 3). When
 * /stage-1?sub=pending is active, this replaces <RowList>.
 *
 * Visual envelope mirrors the rest of the stage-1 row strip family — same
 * radius / panel tokens / muted text colour. Clicking a row writes
 * ?sub=pending&rule=<rule_key> so the right-pane detail can fetch samples
 * and render the promote/reject actions.
 */

import Link from "next/link";
import type { ClassifierCandidate } from "./page";

interface CandidateRuleListProps {
  rules: ClassifierCandidate[];
  selectedRuleKey: string | null;
  swarmType: string;
}

export function CandidateRuleList({
  rules,
  selectedRuleKey,
  swarmType,
}: CandidateRuleListProps) {
  const basePath = `/automations/${swarmType}/stage-1`;

  if (rules.length === 0) {
    return (
      <section className="flex flex-col gap-3 min-w-0">
        <div className="px-6 py-12 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-center">
          <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]">
            No candidate rules
          </h2>
          <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
            No rules in{" "}
            <code className="font-mono">
              classifier_rules.status = &apos;candidate&apos;
            </code>{" "}
            yet. Candidates appear after the first daily cron run records
            telemetry.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 min-w-0">
      {rules.map((c) => {
        const selected = selectedRuleKey === c.rule_key;
        const href = `${basePath}?sub=pending&rule=${encodeURIComponent(c.rule_key)}`;
        return (
          <Link
            key={c.rule_key}
            href={href}
            aria-current={selected ? "true" : undefined}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--v7-radius-sm)] border min-w-0 transition-colors duration-150"
            style={{
              background: selected
                ? "var(--v7-brand-secondary-soft)"
                : "var(--v7-panel-2)",
              borderColor: selected
                ? "var(--v7-brand-secondary)"
                : "var(--v7-line)",
              color: "var(--v7-text)",
            }}
          >
            <div className="min-w-0">
              <div className="font-mono text-[13px] truncate">{c.rule_key}</div>
              <div className="text-[12px] text-[var(--v7-muted)] mt-0.5">
                N={c.n} · CI-lo=
                {c.ci_lo === null ? "—" : (c.ci_lo * 100).toFixed(1) + "%"}
              </div>
            </div>
          </Link>
        );
      })}
    </section>
  );
}
