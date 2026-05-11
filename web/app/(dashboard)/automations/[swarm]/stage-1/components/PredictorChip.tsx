// Phase 999.8 Plan 08 (D-08, D-12). Per-row predictor chip on Stage 1 row card.
//
// Hard-separation lock (docs/agentic-pipeline/README.md + stage-1-regex.md):
//   Stage 1 is the noise filter. The two predictors that can decide a Stage 1
//   row are 'regex' (Pass 1) and 'llm_2nd_pass' (Pass 2 LLM on the 'unknown'
//   bucket). The chip surfaces ONLY which Stage-1 predictor decided the row.
//   It does NOT reference swarm_intents / Stage 3 — those are a separate
//   classifier wave gated to a different surface.
//
// Render rules (D-08, D-12 locked):
//   - predictor === 'llm_2nd_pass'  → `LLM · <confidence>` (e.g. "LLM · medium")
//   - predictor === 'regex'         → `regex` (lowercase, no rule_key — D-12
//                                     compact lock; detail pane shows the rule)
//   - predictor === null/undefined  → render nothing (pre-cutover row;
//                                     forward-only per Phase 999.8 D-09)
//
// Visual idiom mirrors BudgetBreachBadge / TaggingFailureBadge — small rounded
// pill, single line, sits alongside them in the row composition slot.

export type Predictor = "regex" | "llm_2nd_pass" | null | undefined;
export type LlmConfidence = "low" | "medium" | "high" | null | undefined;

export interface PredictorChipProps {
  predictor: Predictor;
  llmConfidence?: LlmConfidence;
}

export function PredictorChip({ predictor, llmConfidence }: PredictorChipProps) {
  if (!predictor) return null;

  const label =
    predictor === "llm_2nd_pass"
      ? `LLM · ${llmConfidence ?? "?"}`
      : "regex";

  return (
    <span
      data-testid="predictor-chip"
      data-predictor={predictor}
      aria-label={`Predictor: ${label}`}
      className="inline-flex items-center px-2 py-0.5 border"
      style={{
        background: "var(--v7-panel-2)",
        color: "var(--v7-text-muted)",
        borderColor: "var(--v7-line)",
        borderRadius: "var(--v7-radius-pill)",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        lineHeight: 1.3,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
