// Phase 64-05 (BUDG-03 / D-17). AXIS 4 · COST OUTLIER card. Server component.
// Slots into the existing 4-axis override layout in detail-pane.tsx; same
// card frame as axes 1-3 (1px V7-line border, var(--v7-radius-sm) corners),
// pink-soft accent.
//
// Three render states (per 64-UI-SPEC.md "Override-axis 4 card" section):
//   1. Bootstrap (sample_count < 100): "Outlier detection warming up — N/100 samples in window"
//   2. Median is zero: same bootstrap copy (avoid divide-by-zero ratio)
//   3. Outlier: "{n} cents — {ratio}× rolling 7-day median" + sub-line.
//
// Pure read-time computation: the loader gets a pre-computed is_cost_outlier
// flag from automation_runs_with_outlier; this card adds the human readout.

interface CostOutlierAxisCardProps {
  cost_cents: number;
  median_cost_cents: number | null;
  sample_count: number;
}

const BOOTSTRAP_MIN_SAMPLES = 100;

export function CostOutlierAxisCard({
  cost_cents,
  median_cost_cents,
  sample_count,
}: CostOutlierAxisCardProps) {
  const isBootstrap =
    sample_count < BOOTSTRAP_MIN_SAMPLES ||
    median_cost_cents == null ||
    median_cost_cents === 0;
  const ratio =
    !isBootstrap && median_cost_cents
      ? (cost_cents / median_cost_cents).toFixed(1)
      : null;

  return (
    <section
      aria-label="Cost outlier axis"
      style={{
        background: "var(--v7-pink-soft)",
        color: "var(--v7-text)",
        border: "1px solid var(--v7-line)",
        borderRadius: "var(--v7-radius-sm)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--v7-pink)",
        }}
      >
        AXIS 4 · COST OUTLIER
      </div>
      {isBootstrap ? (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--v7-text)",
          }}
        >
          Outlier detection warming up — {sample_count}/{BOOTSTRAP_MIN_SAMPLES}{" "}
          samples in window
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              fontVariantNumeric: "tabular-nums",
              color: "var(--v7-text)",
            }}
          >
            {cost_cents} cents — {ratio}× rolling 7-day median
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--v7-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Median across last 7 days: {median_cost_cents} cents (n=
            {sample_count} runs)
          </div>
        </>
      )}
    </section>
  );
}
