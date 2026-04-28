"use client";

// Phase 60-04 (D-26). Cross-swarm rules dashboard table.
// Groups by status: Promoted / Candidates / Demoted / Manually blocked.
// Within each group, rows sorted by last_evaluated DESC.
// Renders status badge, N (tabular-nums), CI-lo (tabular-nums), 14d sparkline,
// last_evaluated, and Block/Unblock actions per UI-SPEC.

import { useMemo, useTransition } from "react";
import type { ClassifierRule, RuleStatus } from "@/lib/classifier/types";
import { RuleStatusBadge } from "./rule-status-badge";
import { CiLoSparkline } from "./ci-lo-sparkline";
import { BlockRuleModal } from "./block-rule-modal";
import { Button } from "@/components/ui/button";
import { CircleCheck } from "lucide-react";
import { unblockRule } from "./actions";

interface SparkPoint {
  ci_lo: number;
  evaluated_at: string;
}

interface RulesTableProps {
  rules: ClassifierRule[];
  evalsByRule: Record<string, SparkPoint[]>;
  shadowMode: boolean;
}

const GROUPS: Array<{ key: RuleStatus; heading: string }> = [
  { key: "promoted", heading: "Promoted" },
  { key: "candidate", heading: "Candidates" },
  { key: "demoted", heading: "Demoted" },
  { key: "manual_block", heading: "Manually blocked" },
];

function formatPercent(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function UnblockButton({ ruleId }: { ruleId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(async () => unblockRule(ruleId))}
      className="border-[var(--v7-line)]"
    >
      <CircleCheck className="size-4" />
      Unblock
    </Button>
  );
}

export function RulesTable({
  rules,
  evalsByRule,
  shadowMode,
}: RulesTableProps) {
  const grouped = useMemo(() => {
    const m = new Map<RuleStatus, ClassifierRule[]>();
    for (const g of GROUPS) m.set(g.key, []);
    for (const r of rules) {
      const arr = m.get(r.status);
      if (arr) arr.push(r);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ta = a.last_evaluated ? Date.parse(a.last_evaluated) : 0;
        const tb = b.last_evaluated ? Date.parse(b.last_evaluated) : 0;
        return tb - ta;
      });
    }
    return m;
  }, [rules]);

  if (rules.length === 0) {
    return (
      <div className="mt-12 px-6 py-12 rounded-[var(--v7-radius-card)] bg-[var(--v7-panel)] text-center">
        <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]">
          No rules yet
        </h2>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
          Rules appear here as the debtor-email ingest route writes telemetry to
          agent_runs. The first daily cron run seeds candidates.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {GROUPS.map(({ key, heading }) => {
        const groupRules = grouped.get(key) ?? [];
        return (
          <section key={key} className="mb-12">
            <h2
              className="sticky top-0 z-10 bg-[var(--v7-bg)] py-3 text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]"
            >
              <span>{heading}</span>
              <span
                aria-hidden="true"
                className="ml-3 text-[14px] font-normal text-[var(--v7-muted)]"
              >
                {groupRules.length}
              </span>
            </h2>
            {groupRules.length === 0 ? (
              <p className="text-[14px] text-[var(--v7-muted)] py-4">
                None.
              </p>
            ) : (
              <div className="rounded-[var(--v7-radius-card)] bg-[var(--v7-panel)] overflow-hidden">
                <table className="w-full text-[14px]">
                  <thead className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--v7-muted)]">
                    <tr className="border-b border-[var(--v7-line)]">
                      <th className="text-left px-4 py-3">Rule</th>
                      <th className="text-left px-4 py-3">Swarm</th>
                      <th className="text-left px-4 py-3">Kind</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">N</th>
                      <th className="text-right px-4 py-3">CI-lo</th>
                      <th className="text-left px-4 py-3">Trend (14d)</th>
                      <th className="text-left px-4 py-3">Last evaluated</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRules.map((r) => {
                      const evalsKey = `${r.swarm_type}::${r.rule_key}`;
                      const points = evalsByRule[evalsKey] ?? [];
                      const showShadowChip =
                        shadowMode &&
                        r.status === "candidate" &&
                        r.n >= 30 &&
                        r.ci_lo !== null &&
                        r.ci_lo >= 0.95;
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-[var(--v7-line)] last:border-0"
                        >
                          <td className="px-4 py-3 font-mono text-[13px]">
                            {r.rule_key}
                          </td>
                          <td className="px-4 py-3 text-[var(--v7-muted)]">
                            {r.swarm_type}
                          </td>
                          <td className="px-4 py-3 text-[var(--v7-muted)]">
                            {r.kind}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <RuleStatusBadge variant={r.status} />
                              {showShadowChip && (
                                // "Would have promoted" chip — shadow-mode preview per UI-SPEC.
                                <RuleStatusBadge
                                  variant="shadow_would_promote"
                                  label="Would have promoted"
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {r.n}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {formatPercent(r.ci_lo)}
                          </td>
                          <td className="px-4 py-3">
                            <CiLoSparkline points={points} />
                          </td>
                          <td className="px-4 py-3 text-[var(--v7-muted)]">
                            {formatTimestamp(r.last_evaluated)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.status === "manual_block" ? (
                              <UnblockButton ruleId={r.id} />
                            ) : (
                              <BlockRuleModal
                                ruleId={r.id}
                                ruleKey={r.rule_key}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
