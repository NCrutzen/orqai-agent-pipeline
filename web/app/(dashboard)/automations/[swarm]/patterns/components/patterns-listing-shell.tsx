"use client";

// Phase 4 Plan 02 Task 2 — Patterns listing shell.
//
// Owns the Patterns-mode chrome (ModeBar with patterns active), the
// aggregate header (count + total est. €/mo across visible candidates),
// the URL-state status filter chip strip, and the stage-grouped sections
// of cluster cards. Renders the UI-SPEC §5 empty state when no candidates
// survive the swarm filter.
//
// Hard-separation guarantee: this component never reads
// swarm_noise_categories or swarm_intents. Everything it surfaces lives in
// promotion_candidates.proposed_change.display_signature (server-rendered
// at cron time by Plan 01).

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ModeBar, type ModeBarCounts } from "../../_shell/mode-bar";
import type { PromotionCandidateRow, PromotionStage } from "@/lib/promotion-recommender/types";
import { AggregateHeader } from "./aggregate-header";
import { StatusFilterChipStrip, STATUS_FILTER_VALUES } from "./status-filter-chip-strip";
import { ClusterCard } from "./cluster-card";
import { suggestionsLabel } from "../_lib/pluralize";

interface SwarmShape {
  swarm_type: string;
  enabled: boolean;
}

export interface PatternsListingShellProps {
  swarm: SwarmShape;
  candidates: PromotionCandidateRow[];
  modeBarCounts?: ModeBarCounts;
}

// Sketch 006 lock — full stage names ("Noise filter" not "Noise" etc.) per
// the locked sketch-001 5-stage strip (Safety · Noise · Customer · Topic ·
// Action) + sketch-006 stage-group head ("Stage 1 · Noise filter").
const STAGE_LABEL: Record<PromotionStage, string> = {
  "1-noise": "Stage 1 · Noise filter",
  "2-customer": "Stage 2 · Customer",
  "3-coordinator": "Stage 3 · Topic",
  "4-handler": "Stage 4 · Action",
};

const STAGE_ORDER: ReadonlyArray<PromotionStage> = [
  "1-noise",
  "2-customer",
  "3-coordinator",
  "4-handler",
];

function readStatusFilter(raw: string | null): string {
  if (!raw) return "all";
  if ((STATUS_FILTER_VALUES as ReadonlyArray<string>).includes(raw)) return raw;
  return "all";
}

export function PatternsListingShell({ swarm, candidates, modeBarCounts }: PatternsListingShellProps) {
  const searchParams = useSearchParams();
  const statusFilter = readStatusFilter(searchParams?.get("status") ?? null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return candidates;
    return candidates.filter((c) => c.status === statusFilter);
  }, [candidates, statusFilter]);

  const byStage = useMemo(() => {
    const out: Record<PromotionStage, PromotionCandidateRow[]> = {
      "1-noise": [],
      "2-customer": [],
      "3-coordinator": [],
      "4-handler": [],
    };
    for (const c of filtered) {
      if (out[c.stage]) out[c.stage].push(c);
    }
    return out;
  }, [filtered]);

  const isEmptyDefault = filtered.length === 0 && statusFilter === "all";
  const isEmptyFiltered = filtered.length === 0 && statusFilter !== "all";

  return (
    <div data-testid="patterns-listing-shell">
      <ModeBar activeMode="patterns" swarmType={swarm.swarm_type} counts={modeBarCounts} />

      <div
        style={{
          padding: "var(--space-5) var(--space-5) var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <AggregateHeader candidates={candidates} swarmType={swarm.swarm_type} />
        <StatusFilterChipStrip candidates={candidates} />
      </div>

      {isEmptyDefault ? (
        <div
          data-testid="patterns-empty-state"
          style={{
            padding: "var(--space-7) var(--space-5)",
            textAlign: "center",
            color: "var(--v7-muted)",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--v7-text)",
              marginBottom: "var(--space-3)",
            }}
          >
            Suggestions will appear here as you correct rows
          </h2>
          <p style={{ fontSize: 14, maxWidth: 560, margin: "0 auto" }}>
            As you confirm and override decisions in Queue, we cluster patterns
            and surface them as suggestions. Nothing to review yet.
          </p>
        </div>
      ) : isEmptyFiltered ? (
        <div
          data-testid="patterns-empty-filtered"
          style={{
            padding: "var(--space-5)",
            textAlign: "center",
            color: "var(--v7-muted)",
            fontSize: 13,
          }}
        >
          No suggestions match this filter
        </div>
      ) : (
        <div
          data-testid="patterns-stage-sections"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
            padding: "var(--space-3) var(--space-5) var(--space-6)",
          }}
        >
          {STAGE_ORDER.map((stage) => {
            const rows = byStage[stage];
            if (rows.length === 0) return null;
            const subtotalCents = rows.reduce(
              (acc, r) => acc + (r.expected_savings_cents_per_month ?? 0),
              0,
            );
            const subtotalEur = Math.round(subtotalCents / 100);
            return (
              <section
                key={stage}
                data-testid={`patterns-stage-section-${stage}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <header
                  data-testid={`patterns-stage-header-${stage}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--v7-muted)",
                    paddingBottom: "var(--space-2)",
                    borderBottom: "1px solid var(--v7-line)",
                  }}
                >
                  <span style={{ color: "var(--v7-brand-patterns)" }}>
                    {STAGE_LABEL[stage]}
                  </span>
                  <span>
                    {suggestionsLabel(rows.length)} · est. €{subtotalEur}/mo
                  </span>
                </header>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  {rows.map((c) => (
                    <ClusterCard
                      key={c.id}
                      candidate={c}
                      swarmType={swarm.swarm_type}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer
        data-testid="patterns-reversibility-footer"
        style={{
          padding: "var(--space-4) var(--space-5)",
          color: "var(--v7-faint)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        All actions on suggestions are logged · an engineer can reverse Apply
        if it misbehaves
      </footer>
    </div>
  );
}
