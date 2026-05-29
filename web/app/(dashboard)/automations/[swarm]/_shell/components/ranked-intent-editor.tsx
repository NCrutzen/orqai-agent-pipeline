"use client";

// Phase 3 Plan 03 Task 1 — RankedIntentEditor.
//
// Sketch 005 Variants A + B lock + UI-SPEC §2 row 3 + §13 anti-drift #2/#8.
//
// Pure controlled component. The parent (stage-3-decide.tsx) owns the
// ranked-list state + the Submit/Escalate wiring; this editor renders the
// list, swaps positions on ▲▼ clicks, and surfaces dirty state via the
// position-1 pill (green DISPATCH WINNER → amber YOUR PICK).
//
// Hard-separation lock (RFC stage-3-coordinator.md): Stage 3 vocabulary =
// swarm_intents.intent_key. This component validates each intent_key against
// the codegen'd SWARM_INTENTS literal-union (intent.generated.ts) — Stage 1's
// swarm_noise_categories is NEVER consulted. Unknown intent_keys render with
// a ⚠ unknown intent warning pill rather than crashing.
//
// Anti-drift gates honored:
//   #2 — only 0.6s animation timing (moved-pulse keyframe in module CSS).
//   #8 — NO HTML5 drag-and-drop attributes (grep-asserted in
//        ranked-intent-editor.test.tsx). The ⠿ glyph is aria-hidden and
//        non-interactive (no tabIndex, no onClick, no cursor change).
//  Tokens-only colors; no raw hex.

import { useEffect, useMemo, useRef, useState } from "react";

import { SWARM_INTENTS } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import type { RankedIntent } from "@/lib/bulk-review/types";

import styles from "./ranked-intent-editor.module.css";

export interface RankedIntentEditorProps {
  /** Controlled ranked list. Parent owns state. */
  value: RankedIntent[];
  onChange: (next: RankedIntent[]) => void;
  /**
   * Optional override for the codegen registry membership check. Test fixtures
   * supply this so they don't have to round-trip through the real generated
   * file. Production callers omit it — defaults to SWARM_INTENTS from
   * intent.generated.ts.
   */
  intentKeyRegistry?: ReadonlyArray<string>;
  /** Disable all controls (e.g. while a server action is in-flight). */
  disabled?: boolean;
  /** data-testid prefix. Default: "ranked-intent-editor". */
  testId?: string;
}

interface InitialEntry {
  intent_key: string;
  pos: number;
}

function arraysEqualByIntentKey(a: RankedIntent[], b: RankedIntent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].intent_key !== b[i].intent_key) return false;
  }
  return true;
}

export function RankedIntentEditor({
  value,
  onChange,
  intentKeyRegistry,
  disabled = false,
  testId = "ranked-intent-editor",
}: RankedIntentEditorProps) {
  // Snapshot the initial order on first render so we can compute `isDirty`
  // across re-renders (parent-owned state).
  const initialRef = useRef<InitialEntry[] | null>(null);
  if (initialRef.current === null) {
    initialRef.current = value.map((v, i) => ({
      intent_key: v.intent_key,
      pos: i,
    }));
  }
  const initial = initialRef.current;
  const initialAsRanked = useMemo<RankedIntent[]>(
    () =>
      initial.map((e) => {
        const found = value.find((v) => v.intent_key === e.intent_key);
        return (
          found ?? {
            intent_key: e.intent_key as RankedIntent["intent_key"],
            confidence: null,
            display_label: null,
          }
        );
      }),
    // We deliberately depend ONLY on `initial` here — `value` shifts as the
    // operator reorders, but `initial` is captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial],
  );

  const isDirty = !arraysEqualByIntentKey(initialAsRanked, value);

  // Pulse-tracking — set the intent_key of the most-recently moved row; clear
  // it after 600ms so the CSS keyframe fires once. The CSS animation handles
  // the visual; we just toggle the class via state.
  const [movedKey, setMovedKey] = useState<string | null>(null);
  useEffect(() => {
    if (movedKey === null) return;
    const t = window.setTimeout(() => setMovedKey(null), 600);
    return () => window.clearTimeout(t);
  }, [movedKey]);

  const registry = useMemo<ReadonlySet<string>>(
    () => new Set(intentKeyRegistry ?? SWARM_INTENTS),
    [intentKeyRegistry],
  );

  function swap(i: number, j: number) {
    if (disabled) return;
    if (i < 0 || j < 0 || i >= value.length || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setMovedKey(next[j].intent_key);
  }

  function reset() {
    if (disabled || !isDirty) return;
    onChange(initialAsRanked.slice());
    setMovedKey(null);
  }

  return (
    <>
      <div
        className={`${styles.editor} ranked-list${isDirty ? " dirty" : ""}`}
        data-testid={testId}
        data-dirty={isDirty}
      >
        {value.map((row, i) => {
          const isTop = i === 0;
          const isKnown = registry.has(row.intent_key);
          const conf = typeof row.confidence === "number" ? row.confidence : 0;
          const confPct = Math.round(conf * 100);
          const pillKind = isTop
            ? isDirty
              ? "your-pick"
              : "dispatch-winner"
            : null;
          const rowClass = [
            styles.row,
            isTop
              ? isDirty
                ? styles.topRowYourPick
                : styles.topRowDispatch
              : "",
            movedKey === row.intent_key ? styles.rowMoved : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={row.intent_key}
              data-testid={`${testId}-row-${i}`}
              data-position={i}
              data-intent-key={row.intent_key}
              data-top={isTop ? "true" : "false"}
              data-pill={pillKind ?? undefined}
              className={rowClass}
            >
              {/* Visual-only drag-handle glyph (anti-drift #8). */}
              <span aria-hidden="true" className={styles.dragHandle}>
                ⠿
              </span>

              {/* Rank chip — sketch 005 24px column. */}
              <span className={styles.rank} data-testid={`${testId}-rank-${i}`}>
                {i + 1}
              </span>

              <div className={styles.intentBlock}>
                <span
                  className={styles.intentLabel}
                  data-testid={`${testId}-label-${i}`}
                >
                  {row.display_label ?? row.intent_key}
                  {!isKnown ? (
                    <span
                      data-testid={`${testId}-unknown-${i}`}
                      className={`${styles.pill} ${styles.pillUnknown}`}
                      title={`intent_key "${row.intent_key}" is not in the swarm_intents registry`}
                    >
                      ⚠ unknown intent
                    </span>
                  ) : null}
                  {pillKind === "dispatch-winner" ? (
                    <span
                      data-testid={`${testId}-pill-dispatch`}
                      className={`${styles.pill} ${styles.pillDispatch}`}
                    >
                      DISPATCH WINNER
                    </span>
                  ) : null}
                  {pillKind === "your-pick" ? (
                    <span
                      data-testid={`${testId}-pill-your-pick`}
                      className={`${styles.pill} ${styles.pillYourPick}`}
                    >
                      YOUR PICK
                    </span>
                  ) : null}
                </span>
                {/* handler_key sub-line intentionally omitted — RankedIntent
                    carries no handler_key (types.ts line 70-75: NOT a slot
                    field). Per anti-fabrication lock (threat T-03-10-04) we
                    render the intent line without a fabricated "→ {handler}". */}
              </div>

              <div className={styles.confidence}>
                <div className={styles.confidencePct}>
                  {row.confidence === null ? "—" : `${confPct}%`}
                </div>
                <div className={styles.confidenceTrack} aria-hidden="true">
                  <div
                    className={styles.confidenceFill}
                    style={{ width: `${confPct}%` }}
                  />
                </div>
              </div>

              <div className={styles.moveButtons}>
                <button
                  type="button"
                  data-testid={`${testId}-up-${i}`}
                  className={styles.moveBtn}
                  aria-label={`Move ${row.intent_key} up`}
                  disabled={disabled || i === 0}
                  onClick={() => swap(i, i - 1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  data-testid={`${testId}-down-${i}`}
                  className={styles.moveBtn}
                  aria-label={`Move ${row.intent_key} down`}
                  disabled={disabled || i === value.length - 1}
                  onClick={() => swap(i, i + 1)}
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* editor-foot — pipeline_events caption + Reset-order (dirty only). */}
      <div className={styles.editorFoot} data-testid={`${testId}-eval-caption`}>
        <span>
          Each move emits its own <code>pipeline_events</code> row ·{" "}
          <code>eval_type=intent-correction</code>
        </span>
        {isDirty ? (
          <button
            type="button"
            data-testid={`${testId}-reset`}
            className={styles.editorReset}
            disabled={disabled}
            onClick={reset}
          >
            Reset order
          </button>
        ) : null}
      </div>
    </>
  );
}
