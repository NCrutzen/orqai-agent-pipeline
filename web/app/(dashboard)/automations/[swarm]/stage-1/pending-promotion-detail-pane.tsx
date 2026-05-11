"use client";

/**
 * Phase 81 Plan 03 Task 2 — Pending promotion detail pane.
 *
 * Right-pane evidence view for /stage-1?sub=pending&rule=<rule_key>:
 *   - Selected rule header (rule_key, status, n, ci_lo Wilson lower bound).
 *   - Sample matched emails (up to 5; fetched server-side in page.tsx via
 *     loadRuleSamples and passed in as `samples`).
 *   - Promote / Reject server-action buttons (forms with hidden rule_key).
 *
 * Hard-separation lock: classifier_rules is keyed by swarm_type + rule_key
 * (Stage 1 telemetry). Stage 3 intent registry is NEVER read here.
 */

import { promoteRule, rejectRule } from "./actions";
import type { ClassifierCandidate } from "./page";

export interface RuleSample {
  email_id: string;
  subject: string;
  sender: string;
  created_at: string;
}

interface PendingPromotionDetailPaneProps {
  rules: ClassifierCandidate[];
  selectedRuleKey: string | null;
  samples: RuleSample[];
  swarmType: string;
}

export function PendingPromotionDetailPane({
  rules,
  selectedRuleKey,
  samples,
  swarmType,
}: PendingPromotionDetailPaneProps) {
  const rule = selectedRuleKey
    ? rules.find((r) => r.rule_key === selectedRuleKey) ?? null
    : null;

  if (rule === null) {
    return (
      <aside
        className="rounded-[var(--v7-radius-card)] border p-6 min-w-0"
        style={{
          background: "var(--v7-panel-2)",
          borderColor: "var(--v7-line)",
        }}
      >
        <p style={{ color: "var(--v7-text-muted)" }}>
          Select a rule to see evidence.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="rounded-[var(--v7-radius-card)] border p-6 min-w-0 flex flex-col gap-4"
      style={{
        background: "var(--v7-panel-2)",
        borderColor: "var(--v7-line)",
      }}
    >
      <header>
        <h3 className="font-mono text-[14px] leading-[1.3] break-all">
          {rule.rule_key}
        </h3>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-[var(--v7-text-muted)]">status</dt>
        <dd className="font-mono">{rule.status}</dd>

        <dt className="text-[var(--v7-text-muted)]">n</dt>
        <dd
          className="font-mono"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {rule.n}
        </dd>

        <dt className="text-[var(--v7-text-muted)]">ci_lo (Wilson)</dt>
        <dd
          className="font-mono"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {rule.ci_lo === null ? "—" : (rule.ci_lo * 100).toFixed(1) + "%"}
        </dd>
      </dl>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">
          Sample matched emails
        </h4>
        {samples.length === 0 ? (
          <p className="text-[13px] text-[var(--v7-text-muted)]">
            No samples found
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {samples.slice(0, 5).map((s) => (
              <li
                key={s.email_id}
                className="text-[12px] leading-[1.4] border-l-2 pl-2"
                style={{ borderColor: "var(--v7-line)" }}
              >
                <div className="truncate font-medium">
                  {s.subject || "(no subject)"}
                </div>
                <div className="text-[var(--v7-text-muted)] truncate">
                  {s.sender} · {relativeTime(s.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex items-center gap-2 pt-2">
        <form action={promoteRule}>
          <input type="hidden" name="rule_key" value={rule.rule_key} />
          <input type="hidden" name="swarm_type" value={swarmType} />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-[var(--v7-radius-pill)] border text-[13px] font-medium"
            style={{
              background: "var(--v7-brand-secondary-soft)",
              borderColor: "var(--v7-brand-secondary)",
              color: "var(--v7-brand-secondary)",
            }}
          >
            Promote
          </button>
        </form>
        <form action={rejectRule}>
          <input type="hidden" name="rule_key" value={rule.rule_key} />
          <input type="hidden" name="swarm_type" value={swarmType} />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-[var(--v7-radius-pill)] border text-[13px] font-medium"
            style={{
              background: "var(--v7-panel-2)",
              borderColor: "var(--v7-line)",
              color: "var(--v7-text)",
            }}
          >
            Reject
          </button>
        </form>
      </footer>
    </aside>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
