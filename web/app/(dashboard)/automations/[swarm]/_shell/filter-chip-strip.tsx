"use client";

// Sketch 008 (variant C, locked 2026-05-28) — two-tier filter bar:
// a calm always-visible MAIN ROW of genuinely global filters, plus a
// PERSISTENT STAGE RAIL beneath it. Clicking a stage pill opens EXACTLY ONE
// facet panel at a time (mirrors the locked "one detail open at a time" rule
// from sketches 002-005).
//
// MAIN ROW (global / cross-stage only): Mailbox · Date (From/To) · Mode
//   (segmented All · Live · Dry-run). Nothing stage-specific lives here.
// STAGE RAIL (every stage-specific facet nests under the stage that produced
//   it):
//   Stage 0 · Safety   → Safety verdict           (filter_safety)
//   Stage 1 · Noise    → Noise category           (filter_category)
//                      + Matched rule             (filter_rule)
//                      + Match type               (filter_match_type)
//   Stage 2 · Customer → Match source             (filter_match_source)
//                      + Account number           (filter_account)
//   Stage 3 · Topic    → Topic / intent           (filter_intent)
//   Stage 4 · Action   → Handler outcome          (filter_action)
//
// URL-param state model is PRESERVED (filter_mode/_rule/_mailbox/_category/
// _safety/_intent/_from/_to keep their names + semantics) and EXTENDED
// additively with three new stage-scoped keys (filter_match_type,
// filter_match_source, filter_account, filter_action) — each composes with AND
// following the same pattern. Filters compose with AND; state lives in URL
// query params ONLY (no localStorage / sessionStorage).
//
// Hard-separation lock (docs/agentic-pipeline/{stage-1-regex,
// stage-3-coordinator}.md): the Stage 1 facets (category, rule, match type)
// read ONLY Stage 1 noise-filter vocabulary (stage_1.*). The Stage 3 Topic
// facet reads ONLY swarm_intents (stage_3.top_intent). They NEVER cross —
// a row exists in exactly one of the two registries.
//
// V7 tokens only — no raw hex. Active filters surface as removable,
// stage-tinted chips via the existing <ChipStrip> primitive; the global Mode
// chip is amber (Dry-run) / brand-primary (Live), visually distinct from the
// stage-tinted facet chips.

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type {
  SwarmNoiseCategoryRow,
  SwarmIntentRow,
} from "@/lib/swarms/types";
import { ChipStrip } from "./chip-strip";

/** Single source of truth for URL-key naming. The `filter_` prefix avoids
 *  collision with `?bulk_review_focus`, `?kanban_focus`, and any future
 *  surface-level query params. */
const URL_KEYS = {
  // Global / cross-stage main-row filters --------------------------------
  mode: "filter_mode",
  mailbox: "filter_mailbox",
  from: "filter_from",
  to: "filter_to",
  // Stage 1 · Noise (demoted from the old main row) ----------------------
  // VISIBLE label is "Noise" (Stage 1 noise category) — URL key retained as
  // filter_category for back-compat with existing bookmarks.
  category: "filter_category",
  rule: "filter_rule",
  matchType: "filter_match_type",
  // Stage 0 · Safety. Slices ONLY stage_0.verdict.
  safety: "filter_safety",
  // Stage 2 · Customer. Slice stage_2.resolver_source + customer_account_id.
  matchSource: "filter_match_source",
  account: "filter_account",
  // Stage 3 · Topic. Slices ONLY stage_3.top_intent (Stage 3 vocabulary).
  // NEVER merged into the Noise dropdown (hard-separation).
  intent: "filter_intent",
  // Stage 4 · Action. Slices stage_4.handler_output_kind.
  action: "filter_action",
} as const;

/** Phase 5 Plan 05-02 (D-03) — operator-facing copy for the Safety lane
 *  empty state. Exported so the shell renders it when a safety filter is
 *  active and the filtered set is empty (an empty Safety result is correct,
 *  not a bug — RESEARCH Pitfall 5). Copy locked by UI-SPEC § Copywriting. */
export const SAFETY_EMPTY_HEADING = "Nothing flagged for safety.";
export const SAFETY_EMPTY_BODY =
  "No emails were held back for injection or size in this range. Widen the date range to look further back.";

/** Maps the Safety facet option value to the Stage0Verdict it slices.
 *  Operator-facing option values avoid the raw enum (anti-drift #3). */
function mapSafetyOption(opt: string): "safe" | "injection_suspected" | "over_budget" | null {
  if (opt === "injection") return "injection_suspected";
  if (opt === "too-large") return "over_budget";
  if (opt === "safe") return "safe";
  return null;
}

/** Maps the Stage 2 Match-source facet option value to the row's
 *  resolver_source. Operator-facing labels (operator-language.md): Matched by
 *  sender / Matched by reference / AI picked. "none" matches an unresolved
 *  Stage 2 (null resolver_source). */
function mapMatchSourceOption(
  opt: string,
): "sender_map" | "identifier_match" | "llm_tiebreaker" | "none" | null {
  if (opt === "sender") return "sender_map";
  if (opt === "reference") return "identifier_match";
  if (opt === "ai") return "llm_tiebreaker";
  if (opt === "none") return "none";
  return null;
}

/** The five locked stage groups for the persistent rail (variant C). Each
 *  holds the facets that the stage produced. `color` = the V7 stage-tint
 *  token applied to the active pill border + chip left-border. */
type StageKey = "safety" | "noise" | "customer" | "topic" | "action";

interface StageSpec {
  key: StageKey;
  num: string;
  /** Operator-facing stage name (operator-language.md). */
  name: string;
  /** V7 stage-tint token (no raw hex). */
  color: string;
}

const STAGES: ReadonlyArray<StageSpec> = [
  { key: "safety", num: "0", name: "Safety", color: "var(--v7-red)" },
  { key: "noise", num: "1", name: "Noise", color: "var(--v7-lime)" },
  { key: "customer", num: "2", name: "Customer", color: "var(--v7-blue)" },
  { key: "topic", num: "3", name: "Topic", color: "var(--v7-brand-patterns)" },
  { key: "action", num: "4", name: "Action", color: "var(--v7-amber)" },
];

export interface FilterChipStripProps {
  /** Rows used to derive distinct rule ids for the rule dropdown. */
  rows: BulkReviewRow[];
  /** swarm_noise_categories registry rows — Stage 1 vocabulary only. */
  categories: SwarmNoiseCategoryRow[];
  /**
   * Phase 5 Plan 05-03 — swarm_intents registry rows. Stage 3 vocabulary ONLY,
   * hydrating the Topic dropdown. Loaded disjointly from `categories`
   * (mirrors the noiseCategories prop); NEVER merged into the Noise dropdown
   * (hard-separation: a row lives in exactly one of swarm_noise_categories or
   * swarm_intents). Optional → defaults to [] so existing callers keep working.
   */
  intents?: SwarmIntentRow[];
  /** Per-row mailbox label (email_label_id → label). Distinct labels feed
   *  the mailbox dropdown. */
  mailboxLabels: Record<string, string>;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// ---- shared inline styles (V7 tokens only) ----------------------------------
const selectStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "var(--space-1) var(--space-2)",
  background: "var(--v7-panel-2)",
  color: "var(--v7-text)",
  border: "1px solid var(--v7-line)",
  borderRadius: "var(--v7-radius-sm)",
};

const ctlLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--v7-faint)",
  fontWeight: 600,
};

export function FilterChipStrip({
  rows,
  categories,
  intents = [],
  mailboxLabels,
}: FilterChipStripProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Which stage panel is open. Variant C: exactly ONE open at a time (null =
  // none open). Presentation-only state — the actual filter values live in the
  // URL, so an open/closed panel never affects the result set.
  const [openStage, setOpenStage] = useState<StageKey | null>(null);

  // ---- distinct rule ids derived from the visible rows ------------------
  // Hard-separation: matched_rule_id lives on the Stage 1 noise slot ONLY.
  // We NEVER look at stage_3 here.
  const distinctRules = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const id = r.stage_1?.matched_rule_id;
      if (id) set.add(id);
    }
    return Array.from(set).sort();
  }, [rows]);

  const distinctMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(mailboxLabels)) {
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  }, [mailboxLabels]);

  // Stage 4 · Action — distinct handler_output_kind values present in the
  // visible rows. The data exists on the Stage 4 slot (handler_output_kind:
  // 'draft_body' | 'action_confirmation' | 'data_payload'), so the facet is a
  // real, simple filter following the same URL-param + AND pattern. When the
  // set is empty (no row reached a handler), the group renders present-but-
  // empty rather than faking options.
  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const k = r.stage_4?.handler_output_kind;
      if (k) set.add(k);
    }
    return Array.from(set).sort();
  }, [rows]);

  // ---- URL-state helpers ------------------------------------------------
  const setFilter = useCallback(
    (key: keyof typeof URL_KEYS, value: string | null) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      const urlKey = URL_KEYS[key];
      if (value === null || value === "") {
        next.delete(urlKey);
      } else {
        next.set(urlKey, value);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?");
    },
    [router, searchParams],
  );

  const filterMode = searchParams?.get(URL_KEYS.mode) ?? "";
  const filterRule = searchParams?.get(URL_KEYS.rule) ?? "";
  const filterMailbox = searchParams?.get(URL_KEYS.mailbox) ?? "";
  const filterCategory = searchParams?.get(URL_KEYS.category) ?? "";
  const filterMatchType = searchParams?.get(URL_KEYS.matchType) ?? "";
  const filterSafety = searchParams?.get(URL_KEYS.safety) ?? "";
  const filterMatchSource = searchParams?.get(URL_KEYS.matchSource) ?? "";
  const filterAccount = searchParams?.get(URL_KEYS.account) ?? "";
  const filterIntent = searchParams?.get(URL_KEYS.intent) ?? "";
  const filterAction = searchParams?.get(URL_KEYS.action) ?? "";
  const filterFromRaw = searchParams?.get(URL_KEYS.from) ?? "";
  const filterToRaw = searchParams?.get(URL_KEYS.to) ?? "";
  const filterFrom = filterFromRaw || sevenDaysAgoISO();
  const filterTo = filterToRaw || todayISO();

  // Per-stage active-facet counts → drives the rail-pill orange dot + count.
  const stageActiveCount: Record<StageKey, number> = {
    safety: filterSafety && filterSafety !== "all" ? 1 : 0,
    noise:
      (filterCategory ? 1 : 0) +
      (filterRule ? 1 : 0) +
      (filterMatchType ? 1 : 0),
    customer: (filterMatchSource ? 1 : 0) + (filterAccount ? 1 : 0),
    topic: filterIntent ? 1 : 0,
    action: filterAction ? 1 : 0,
  };

  // ---- active-filter chip set ------------------------------------------
  // `stage` tags a chip with its producing stage so the chip row can apply the
  // stage-tint left-border (null = the global Mode chip, tinted amber/orange).
  const activeChips: {
    urlKey: keyof typeof URL_KEYS;
    label: string;
    stage: StageKey | null;
  }[] = [];
  if (filterMode && filterMode !== "all") {
    const MODE_CHIP_LABEL: Record<string, string> = {
      live: "Live",
      dry_run: "Dry run",
    };
    activeChips.push({
      urlKey: "mode",
      label: `Mode: ${MODE_CHIP_LABEL[filterMode] ?? filterMode} ×`,
      stage: null,
    });
  }
  if (filterMailbox) {
    activeChips.push({
      urlKey: "mailbox",
      label: `Mailbox: ${filterMailbox} ×`,
      stage: null,
    });
  }
  if (filterFromRaw || filterToRaw) {
    activeChips.push({
      urlKey: "from",
      label: `Date: ${filterFrom} → ${filterTo} ×`,
      stage: null,
    });
  }
  if (filterSafety && filterSafety !== "all") {
    const SAFETY_CHIP_LABEL: Record<string, string> = {
      injection: "Injection suspected",
      "too-large": "Too large",
      safe: "Safe",
    };
    activeChips.push({
      urlKey: "safety",
      label: `Safety: ${SAFETY_CHIP_LABEL[filterSafety] ?? filterSafety} ×`,
      stage: "safety",
    });
  }
  if (filterCategory) {
    const cat = categories.find((c) => c.category_key === filterCategory);
    activeChips.push({
      urlKey: "category",
      label: `Noise: ${cat?.display_label ?? filterCategory} ×`,
      stage: "noise",
    });
  }
  if (filterRule) {
    activeChips.push({
      urlKey: "rule",
      label: `Rule: ${filterRule} ×`,
      stage: "noise",
    });
  }
  if (filterMatchType) {
    const MATCH_TYPE_CHIP_LABEL: Record<string, string> = {
      pattern: "Pattern match",
      ai: "AI rescue",
      none: "No rule matched",
    };
    activeChips.push({
      urlKey: "matchType",
      label: `Match type: ${
        MATCH_TYPE_CHIP_LABEL[filterMatchType] ?? filterMatchType
      } ×`,
      stage: "noise",
    });
  }
  if (filterMatchSource) {
    const MATCH_SOURCE_CHIP_LABEL: Record<string, string> = {
      sender: "Matched by sender",
      reference: "Matched by reference",
      ai: "AI picked",
      none: "No match",
    };
    activeChips.push({
      urlKey: "matchSource",
      label: `Match source: ${
        MATCH_SOURCE_CHIP_LABEL[filterMatchSource] ?? filterMatchSource
      } ×`,
      stage: "customer",
    });
  }
  if (filterAccount) {
    activeChips.push({
      urlKey: "account",
      label: `Account: ${filterAccount} ×`,
      stage: "customer",
    });
  }
  if (filterIntent) {
    const it = intents.find((i) => i.intent_key === filterIntent);
    activeChips.push({
      urlKey: "intent",
      label: `Topic: ${it?.intent_key ?? filterIntent} ×`,
      stage: "topic",
    });
  }
  if (filterAction) {
    const ACTION_CHIP_LABEL: Record<string, string> = {
      draft_body: "Drafting",
      action_confirmation: "Done",
      data_payload: "Data lookup",
    };
    activeChips.push({
      urlKey: "action",
      label: `Action: ${ACTION_CHIP_LABEL[filterAction] ?? filterAction} ×`,
      stage: "action",
    });
  }

  const anyActive = activeChips.length > 0;
  const stageColorFor = (s: StageKey | null): string =>
    s ? (STAGES.find((x) => x.key === s)?.color ?? "var(--v7-line)") : "";

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    for (const k of Object.values(URL_KEYS)) next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?");
  }, [router, searchParams]);

  return (
    <div
      data-testid="filter-chip-strip"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
      }}
    >
      {/* ── FILTER ROW — global MAIN filters + per-stage rail on ONE line ──
          Mailbox · Date (From/To) · Mode  |  Filters per stage: 0-4 pills.
          (Operator UAT 2026-05-28: stage rail moved onto the main-filter row;
          "By stage" relabelled "Filters per stage" for clarity.) */}
      <div
        data-testid="filter-row"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "var(--space-5)",
          padding: "var(--space-3) var(--space-5)",
          flexWrap: "wrap",
        }}
      >
      <div
        data-testid="filter-main-row"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        {/* Operator UAT 2026-05-28: "Main" label + Mailbox control removed.
            From · To · Mode sit directly in front of the per-stage rail. */}
        {/* Date range — From (global). */}
        <label style={ctlLabelStyle}>
          From
          <input
            data-testid="filter-from-input"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilter("from", e.target.value || null)}
            style={selectStyle}
          />
        </label>

        {/* Date range — To (global). */}
        <label style={ctlLabelStyle}>
          To
          <input
            data-testid="filter-to-input"
            type="date"
            value={filterTo}
            onChange={(e) => setFilter("to", e.target.value || null)}
            style={selectStyle}
          />
        </label>

        {/* Mode (global, cross-stage) — segmented control All · Live · Dry-run.
            Reads the per-row dryRunByRow map ARG (not a row field). Live =
            brand-orange (Queue mode-pill chrome); Dry-run = amber (not-yet-
            acting warn). Distinct chrome from the stage-tinted facet chips. */}
        <label style={ctlLabelStyle}>
          Mode
          <div
            data-testid="filter-mode-seg"
            role="group"
            aria-label="Filter by mode"
            style={{
              display: "inline-flex",
              background: "var(--v7-panel-2)",
              border: "1px solid var(--v7-line)",
              borderRadius: "var(--v7-radius-sm)",
              padding: 2,
              gap: 2,
            }}
          >
            {(
              [
                { v: "all", label: "All", tint: null },
                { v: "live", label: "Live", tint: "var(--v7-brand-primary)" },
                { v: "dry_run", label: "Dry run", tint: "var(--v7-amber)" },
              ] as const
            ).map((opt) => {
              const on = (filterMode || "all") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  data-testid={`filter-mode-${opt.v}`}
                  aria-pressed={on}
                  onClick={() =>
                    setFilter("mode", opt.v === "all" ? null : opt.v)
                  }
                  style={{
                    padding: "5px 11px",
                    borderRadius: "calc(var(--v7-radius-sm) - 8px)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    background:
                      on && opt.tint
                        ? "var(--v7-panel)"
                        : "transparent",
                    color: on
                      ? opt.tint ?? "var(--v7-text)"
                      : "var(--v7-text-muted)",
                    boxShadow:
                      on && opt.tint
                        ? `inset 0 -2px 0 0 ${opt.tint}`
                        : "none",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </label>
      </div>

      {/* ── PERSISTENT STAGE RAIL (variant C — always visible, no toggle) ──
          Clicking a pill opens EXACTLY ONE facet panel below. */}
      <div
        data-testid="filter-stage-rail"
        role="tablist"
        aria-label="Filter by pipeline stage"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          paddingLeft: "var(--space-5)",
          borderLeft: "1px solid var(--v7-border)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--v7-faint)",
            fontWeight: 600,
            marginRight: 2,
          }}
        >
          Filters per stage
        </span>
        {STAGES.map((s) => {
          const open = openStage === s.key;
          const count = stageActiveCount[s.key];
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={open}
              data-testid={`stage-pill-${s.key}`}
              onClick={() => setOpenStage(open ? null : s.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                background: "var(--v7-panel)",
                border: `1px solid ${open ? s.color : "var(--v7-line)"}`,
                borderRadius: "var(--v7-radius-pill)",
                fontSize: 13,
                color: open ? "var(--v7-text)" : "var(--v7-text-muted)",
                cursor: "pointer",
                boxShadow: open ? `inset 0 -2px 0 0 ${s.color}` : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--v7-text-inverse, #fff)",
                  background: s.color,
                  borderRadius: 4,
                  padding: "1px 5px",
                }}
              >
                {s.num}
              </span>
              {s.name}
              {count > 0 && (
                <span
                  data-testid={`stage-pill-${s.key}-count`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    background: "var(--v7-brand-primary)",
                    color: "var(--v7-text-inverse, #fff)",
                    borderRadius: "var(--v7-radius-pill)",
                    padding: "0 6px",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      {/* ── ONE-AT-A-TIME FACET PANEL ───────────────────────────────────── */}
      {openStage && (
        <div
          data-testid={`stage-panel-${openStage}`}
          style={{
            // Operator UAT 2026-05-28: stage label + its facet controls share
            // ONE row (denser). flex-end baseline-aligns the "1 Noise" label
            // with the select boxes.
            display: "flex",
            alignItems: "flex-end",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            padding: "var(--space-4) var(--space-5)",
            borderTop: "1px solid var(--v7-border)",
            background: "var(--v7-bg-2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexShrink: 0,
              paddingBottom: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--v7-text-inverse, #fff)",
                background: stageColorFor(openStage),
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              {STAGES.find((x) => x.key === openStage)?.num}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--v7-text)" }}>
              {STAGES.find((x) => x.key === openStage)?.name}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            {/* Stage 0 · Safety → Safety verdict. */}
            {openStage === "safety" && (
              <label style={ctlLabelStyle}>
                Safety verdict
                <select
                  data-testid="filter-safety-select"
                  value={filterSafety || "all"}
                  onChange={(e) =>
                    setFilter(
                      "safety",
                      e.target.value === "all" ? null : e.target.value,
                    )
                  }
                  style={selectStyle}
                >
                  <option value="all">Any</option>
                  <option value="injection">Injection suspected</option>
                  <option value="too-large">Too large</option>
                  <option value="safe">Safe</option>
                </select>
              </label>
            )}

            {/* Stage 1 · Noise → Noise category + Matched rule + Match type.
                All three read Stage 1 noise vocabulary ONLY (hard-separation).*/}
            {openStage === "noise" && (
              <>
                <label
                  style={ctlLabelStyle}
                  title="Stage 1 · auto-archive category — not the swarm"
                >
                  Noise category
                  <select
                    data-testid="filter-category-select"
                    value={filterCategory}
                    onChange={(e) => setFilter("category", e.target.value || null)}
                    style={selectStyle}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.category_key} value={c.category_key}>
                        {c.display_label ?? c.category_key}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={ctlLabelStyle}>
                  Matched rule
                  <select
                    data-testid="filter-rule-select"
                    value={filterRule}
                    onChange={(e) => setFilter("rule", e.target.value || null)}
                    style={selectStyle}
                  >
                    <option value="">All rules</option>
                    {distinctRules.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={ctlLabelStyle}>
                  Match type
                  <select
                    data-testid="filter-match-type-select"
                    value={filterMatchType}
                    onChange={(e) =>
                      setFilter("matchType", e.target.value || null)
                    }
                    style={selectStyle}
                  >
                    <option value="">Any</option>
                    <option value="pattern">Pattern match</option>
                    <option value="ai">AI rescue</option>
                    <option value="none">No rule matched</option>
                  </select>
                </label>
              </>
            )}

            {/* Stage 2 · Customer → Match source + Account number. */}
            {openStage === "customer" && (
              <>
                <label style={ctlLabelStyle}>
                  Match source
                  <select
                    data-testid="filter-match-source-select"
                    value={filterMatchSource}
                    onChange={(e) =>
                      setFilter("matchSource", e.target.value || null)
                    }
                    style={selectStyle}
                  >
                    <option value="">Any</option>
                    <option value="sender">Matched by sender</option>
                    <option value="reference">Matched by reference</option>
                    <option value="ai">AI picked</option>
                    <option value="none">No match</option>
                  </select>
                </label>
                <label style={ctlLabelStyle}>
                  Account number
                  <input
                    data-testid="filter-account-input"
                    inputMode="numeric"
                    placeholder="e.g. 0421"
                    value={filterAccount}
                    onChange={(e) => setFilter("account", e.target.value || null)}
                    style={selectStyle}
                  />
                </label>
              </>
            )}

            {/* Stage 3 · Topic → Topic / intent. Stage 3 vocabulary ONLY
                (hard-separation). NEVER merged into the Noise dropdown. */}
            {openStage === "topic" && (
              <label style={ctlLabelStyle}>
                Topic / intent
                <select
                  data-testid="filter-intent-select"
                  value={filterIntent}
                  onChange={(e) => setFilter("intent", e.target.value || null)}
                  style={selectStyle}
                >
                  <option value="">All topics</option>
                  {intents.map((i) => (
                    <option key={i.intent_key} value={i.intent_key}>
                      {i.intent_key}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Stage 4 · Action → Handler outcome. Real filter (data exists on
                stage_4.handler_output_kind). When no row reached a handler the
                dropdown shows only "Any" — present-but-empty, never faked. */}
            {openStage === "action" && (
              <label style={ctlLabelStyle}>
                Handler outcome
                <select
                  data-testid="filter-action-select"
                  value={filterAction}
                  onChange={(e) => setFilter("action", e.target.value || null)}
                  style={selectStyle}
                >
                  <option value="">Any</option>
                  {distinctActions.map((k) => {
                    const ACTION_OPT_LABEL: Record<string, string> = {
                      draft_body: "Drafting",
                      action_confirmation: "Done",
                      data_payload: "Data lookup",
                    };
                    return (
                      <option key={k} value={k}>
                        {ACTION_OPT_LABEL[k] ?? k}
                      </option>
                    );
                  })}
                </select>
                {distinctActions.length === 0 && (
                  <span
                    data-testid="filter-action-empty"
                    style={{
                      fontSize: 10,
                      textTransform: "none",
                      letterSpacing: 0,
                      fontWeight: 400,
                      color: "var(--v7-faint)",
                    }}
                  >
                    No emails have reached a handler yet.
                  </span>
                )}
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── Active-filter chips (stage-tinted; reuses ChipStrip primitive) ── */}
      {anyActive ? (
        <div
          data-testid="filter-chip-strip-active"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "0 var(--space-5) var(--space-2)",
          }}
        >
          <ChipStrip
            chips={activeChips.map((c) => ({
              key: URL_KEYS[c.urlKey],
              label: c.label,
              // Sketch 008 — stage-tinted left-border. Stage facet chips carry
              // their producing stage's color; the global Mode chip carries
              // brand-primary (Live) / amber (Dry-run) — distinct from the
              // stage tints. Other global chips (Mailbox/Date) get no border.
              borderToken:
                c.stage !== null
                  ? stageColorFor(c.stage)
                  : c.urlKey === "mode"
                    ? filterMode === "live"
                      ? "var(--v7-brand-primary)"
                      : "var(--v7-amber)"
                    : null,
            }))}
            active=""
            onChange={(key) => {
              const entry = (
                Object.entries(URL_KEYS) as [keyof typeof URL_KEYS, string][]
              ).find(([, v]) => v === key);
              if (!entry) return;
              const slot = entry[0];
              if (slot === "from" || slot === "to") {
                const next = new URLSearchParams(
                  searchParams?.toString() ?? "",
                );
                next.delete(URL_KEYS.from);
                next.delete(URL_KEYS.to);
                const qs = next.toString();
                router.replace(qs ? `?${qs}` : "?");
              } else {
                setFilter(slot, null);
              }
            }}
            ariaLabel="Active filter — click to remove"
          />
          <button
            type="button"
            data-testid="filter-clear-all"
            onClick={clearAll}
            style={{
              fontSize: 12,
              padding: "var(--space-1) var(--space-2)",
              background: "transparent",
              color: "var(--v7-text-muted)",
              border: "1px solid var(--v7-line)",
              borderRadius: "var(--v7-radius-sm)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pure derivation. Apply the URL-state filter set against a BulkReviewRow
 * list with AND composition. Caller wires URLSearchParams → call →
 * filtered rows → <RowStripList rows={filtered}/>.
 *
 * Hard-separation lock: Stage 1 facets (rule / category / match type) match
 * Stage 1 fields ONLY; the Topic facet matches stage_3.top_intent ONLY. They
 * never cross. Mailbox match uses the loader's per-row mailboxLabels map.
 */
export function applyFilters(
  rows: BulkReviewRow[],
  filters: {
    rule: string | null;
    mailbox: string | null;
    category: string | null;
    from: string | null;
    to: string | null;
    /** Phase 5 Plan 05-02 (D-03) — Safety facet option value
     *  ("injection" | "too-large" | "safe" | "all"). Slices stage_0 ONLY. */
    safety?: string | null;
    /** Phase 5 Plan 05-03 (D-06) — Mode facet ("live" | "dry_run" | "all").
     *  Reads the per-row dryRunByRow map ARG, NOT a row field. */
    mode?: string | null;
    /** Phase 5 Plan 05-03 — Topic facet (a swarm_intents intent_key). Slices
     *  EXACTLY r.stage_3?.top_intent (Stage 3 vocabulary ONLY, hard-sep). */
    intent?: string | null;
    /** Sketch 008 — Stage 1 Match-type facet ("pattern" | "ai" | "none").
     *  Reads stage_1.predictor / matched_rule_id ONLY (Stage 1 vocabulary). */
    matchType?: string | null;
    /** Sketch 008 — Stage 2 Match-source facet
     *  ("sender" | "reference" | "ai" | "none"). Slices stage_2.resolver_source. */
    matchSource?: string | null;
    /** Sketch 008 — Stage 2 Account-number facet (substring of
     *  stage_2.customer_account_id / corrected_customer_account_id). */
    account?: string | null;
    /** Sketch 008 — Stage 4 Action facet (a stage_4.handler_output_kind). */
    action?: string | null;
  },
  mailboxLabels: Record<string, string>,
  rowTimestamps: Record<string, string>,
  /** Phase 5 Plan 05-03 (D-06) — per-row dry_run flag keyed by email_label_id
   *  (Plan 01 loader output, default true when the mailbox is unresolved). The
   *  Mode guard reads this map, never a row field. Default {} keeps the
   *  pre-existing Stage-1-era callers/tests valid. */
  dryRunByRow: Record<string, boolean> = {},
): BulkReviewRow[] {
  return rows.filter((r) => {
    if (filters.rule && r.stage_1?.matched_rule_id !== filters.rule) {
      return false;
    }
    // Mode guard (D-06): reads ONLY the per-row dryRunByRow map arg — NOT a
    // row field. "live" = dry_run flag resolved to false; "dry_run" keeps
    // explicit-true AND unresolved-default-true rows (Plan 01 A3).
    if (filters.mode && filters.mode !== "all") {
      const isLive = dryRunByRow[r.email_label_id] === false;
      if (filters.mode === "live" && !isLive) return false;
      if (filters.mode === "dry_run" && isLive) return false;
    }
    // Topic / intent guard (hard-separation): reads EXACTLY r.stage_3?.top_intent
    // (Stage 3 vocabulary). NEVER consults stage_1 / swarm_noise_categories.
    if (filters.intent && r.stage_3?.top_intent !== filters.intent) {
      return false;
    }
    // Safety guard (hard-separation): reads EXACTLY r.stage_0?.verdict. A null
    // stage_0 falls through to "safe" (Pitfall 5 — Phase 64 unshipped). NEVER
    // consults stage_1 / stage_3.
    if (filters.safety && filters.safety !== "all") {
      const v = r.stage_0?.verdict ?? "safe";
      if (mapSafetyOption(filters.safety) !== v) return false;
    }
    // Match-type guard (Stage 1 ONLY, hard-separation). "pattern" = a regex
    // Pass-1 rule fired (matched_rule_id present, predictor not the LLM pass);
    // "ai" = Stage 1 LLM Pass-2 rescue (predictor === 'llm_2nd_pass');
    // "none" = no rule matched (no matched_rule_id and not an AI rescue).
    if (filters.matchType) {
      const s1 = r.stage_1;
      const isAi = s1?.predictor === "llm_2nd_pass" || s1?.llm_invoked === true;
      const hasRule = !!s1?.matched_rule_id;
      if (filters.matchType === "pattern" && !(hasRule && !isAi)) return false;
      if (filters.matchType === "ai" && !isAi) return false;
      if (filters.matchType === "none" && (hasRule || isAi)) return false;
    }
    // Match-source guard (Stage 2 ONLY). "none" matches an unresolved Stage 2
    // (null resolver_source OR a null stage_2 slot).
    if (filters.matchSource) {
      const want = mapMatchSourceOption(filters.matchSource);
      const src = r.stage_2?.resolver_source ?? null;
      if (want === "none") {
        if (src !== null) return false;
      } else if (src !== want) {
        return false;
      }
    }
    // Account-number guard (Stage 2 ONLY). Substring match against the
    // corrected account id first (operator override wins), else the resolved
    // one. Digits-only operator input; a row with neither id is excluded.
    if (filters.account) {
      const acct =
        r.stage_2?.corrected_customer_account_id ??
        r.stage_2?.customer_account_id ??
        null;
      if (!acct || !acct.includes(filters.account)) return false;
    }
    // Action guard (Stage 4 ONLY). Matches stage_4.handler_output_kind.
    if (filters.action && r.stage_4?.handler_output_kind !== filters.action) {
      return false;
    }
    if (filters.mailbox) {
      const lbl = mailboxLabels[r.email_label_id];
      if (lbl !== filters.mailbox) return false;
    }
    if (filters.category && r.stage_1?.category_key !== filters.category) {
      return false;
    }
    if (filters.from || filters.to) {
      // WR-02: undated rows cannot be range-tested, so they fall through
      // (visible) rather than being silently dropped for a missing-timestamp
      // reason masquerading as a date-range exclusion.
      const ts = rowTimestamps[r.email_label_id];
      if (ts) {
        const dateOnly = ts.slice(0, 10);
        if (filters.from && dateOnly < filters.from) return false;
        if (filters.to && dateOnly > filters.to) return false;
      }
    }
    return true;
  });
}
