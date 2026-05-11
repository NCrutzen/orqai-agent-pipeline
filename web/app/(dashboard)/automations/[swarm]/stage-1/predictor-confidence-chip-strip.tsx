"use client";

/**
 * Phase 999.8 Plan 07 Task 1 — Predictor + confidence filter chip strip.
 *
 * Sibling component to `noise-category-chip-strip.tsx`. Renders two compact
 * filter rows on the Stage 1 surface:
 *   - predictor: All | regex | LLM    → ?predictor=(regex|llm_2nd_pass)
 *   - confidence: All | high | medium | low → ?confidence=(high|medium|low)
 *
 * Hard-separation lock (RFC docs/agentic-pipeline/README.md): this file is
 * Stage 1 only. The chips filter `pipeline_events.stage=1` rows by
 * `decision_details->>predictor` (D-11 denormalization, Plan 02) and
 * `decision_details->>llm_confidence`. No `swarm_intents` reference, no
 * Stage 3 crossings.
 *
 * Post-Phase-82 architecture note: the original plan's anti-pattern lock said
 * "do NOT extract a generic ChipStrip — duplicate styling, keep types per
 * surface." Phase 82 Plan 01 SUPERSEDED that lock by extracting
 * `_shell/chip-strip.tsx` as a pure-presentation primitive used by all stage
 * chip-strip wrappers. This file therefore follows the post-82 pattern
 * mirrored by `noise-category-chip-strip.tsx`: delegate chip rendering to
 * `_shell/ChipStrip`, keep the URL contract (predictor/confidence axes) and
 * the Stage-1-specific axis labels INLINE in this wrapper.
 *
 * URL contract:
 *   - "All" predictor chip → qs.delete("predictor")
 *   - "regex" predictor chip → qs.set("predictor", "regex")
 *   - "LLM" predictor chip → qs.set("predictor", "llm_2nd_pass")
 *   - "All" confidence chip → qs.delete("confidence")
 *   - "high|medium|low" → qs.set("confidence", "<value>")
 *   - Both axes are orthogonal — they can be active simultaneously
 *     (e.g. ?predictor=llm_2nd_pass&confidence=medium).
 *   - Default (no params) → both strips show "All" active (D-06).
 */

import { useCallback } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { ChipStrip, type ChipStripChip } from "../_shell/chip-strip";

interface PredictorConfidenceChipStripProps {
  /** sp.predictor — drives the predictor row active state. */
  activePredictor: string | null;
  /** sp.confidence — drives the confidence row active state. */
  activeConfidence: string | null;
}

const PREDICTOR_CHIPS: ChipStripChip[] = [
  { key: "all", label: "All" },
  { key: "regex", label: "regex" },
  { key: "llm_2nd_pass", label: "LLM" },
];

const CONFIDENCE_CHIPS: ChipStripChip[] = [
  { key: "all", label: "All" },
  { key: "high", label: "high" },
  { key: "medium", label: "medium" },
  { key: "low", label: "low" },
];

export function PredictorConfidenceChipStrip({
  activePredictor,
  activeConfidence,
}: PredictorConfidenceChipStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const navigatePredictor = useCallback(
    (next: string) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (next === "all") qs.delete("predictor");
      else qs.set("predictor", next);
      const q = qs.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    },
    [router, pathname, search],
  );

  const navigateConfidence = useCallback(
    (next: string) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (next === "all") qs.delete("confidence");
      else qs.set("confidence", next);
      const q = qs.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    },
    [router, pathname, search],
  );

  const activePredictorKey =
    activePredictor === "regex" || activePredictor === "llm_2nd_pass"
      ? activePredictor
      : "all";
  const activeConfidenceKey =
    activeConfidence === "high" ||
    activeConfidence === "medium" ||
    activeConfidence === "low"
      ? activeConfidence
      : "all";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
      aria-label="Filter Stage 1 by predictor and confidence"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--v7-font-mono, monospace)",
            color: "var(--v7-text-muted)",
            minWidth: 80,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Predictor
        </span>
        <ChipStrip
          chips={PREDICTOR_CHIPS}
          active={activePredictorKey}
          onChange={navigatePredictor}
          ariaLabel="Filter Stage 1 by predictor"
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--v7-font-mono, monospace)",
            color: "var(--v7-text-muted)",
            minWidth: 80,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Confidence
        </span>
        <ChipStrip
          chips={CONFIDENCE_CHIPS}
          active={activeConfidenceKey}
          onChange={navigateConfidence}
          ariaLabel="Filter Stage 1 by LLM confidence"
        />
      </div>
    </div>
  );
}
