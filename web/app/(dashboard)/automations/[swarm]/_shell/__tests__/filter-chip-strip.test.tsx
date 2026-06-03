// Phase 2 Plan 02-06 — unit tests for the pure `applyFilters` derivation
// in filter-chip-strip.tsx. The dropdown UI itself is exercised end-to-end
// via Playwright; here we lock the URL-state filter semantics.
//
// Hard-separation lock (docs/agentic-pipeline/{stage-1-regex,
// stage-3-coordinator}.md): the filter ONLY reads Stage 1 fields
// (matched_rule_id, category_key). It NEVER reads stage_3 / swarm_intents.
// These tests guard that invariant by constructing rows whose Stage 3
// fields would match the filter value if hard-separation were violated.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { applyFilters, FilterChipStrip } from "../filter-chip-strip";

// Router/searchParams stub for the render-based layout tests (sketch 008).
const replace = vi.fn();
let currentParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => currentParams,
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
  currentParams = new URLSearchParams("");
});

function makeRow(
  id: string,
  opts: {
    ruleId?: string | null;
    categoryKey?: string;
    stage0Verdict?: "safe" | "injection_suspected" | "over_budget" | null;
    /** Phase 5 Plan 05-03 (Topic facet) — Stage 3 top_intent. When set the row
     *  gets a stage_3 slot with this top_intent; the intent guard reads it. */
    topIntent?: string;
    /** Sketch 008 — Stage 1 predictor (regex | llm_2nd_pass). Drives the
     *  Match-type facet alongside matched_rule_id. */
    predictor?: "regex" | "llm_2nd_pass" | null;
    /** Sketch 008 — Stage 2 resolver_source + account number. */
    resolverSource?: "sender_map" | "identifier_match" | "llm_tiebreaker" | null;
    accountId?: string | null;
    /** Sketch 008 — Stage 4 handler_output_kind. */
    actionKind?: string | null;
  } = {},
): BulkReviewRow {
  return {
    email_label_id: id,
    swarm_type: "debtor-email",
    email_id: null,
    context_version: "1.0.0",
    stage_0:
      opts.stage0Verdict === undefined
        ? null
        : opts.stage0Verdict === null
          ? null
          : {
              verdict: opts.stage0Verdict,
              cost_cents: null,
              confidence: null,
              pipeline_event_id: null,
            },
    stage_1: {
      category_key: opts.categoryKey ?? "unknown",
      matched_rule_id: opts.ruleId ?? null,
      regex_verdict: "unknown",
      llm_second_pass_verdict: null,
      pipeline_event_id: null,
      llm_invoked: false,
      llm_category_key: null,
      llm_confidence: null,
      llm_reasoning: null,
      llm_error: null,
      predictor: opts.predictor === undefined ? "regex" : opts.predictor,
      llm_model_key: null,
      category_display_label: null,
      llm_category_display_label: null,
      agent_run_id: null,
    },
    stage_2:
      opts.resolverSource === undefined && opts.accountId === undefined
        ? null
        : {
            entity_brand: null,
            resolver_source: opts.resolverSource ?? null,
            customer_account_id: opts.accountId ?? null,
            corrected_customer_account_id: null,
            confidence: null,
            pipeline_event_id: null,
            resolver_steps: null,
            winner_step: null,
            customer_name: null,
            sender_map_lineage: null,
            inputs: null,
          },
    stage_3:
      opts.topIntent === undefined
        ? null
        : {
            top_intent: opts.topIntent as never,
            ranked_intents: [
              {
                intent_key: opts.topIntent as never,
                confidence: 0.9,
                display_label: null,
              },
            ],
            pipeline_event_id: null,
          },
    stage_3p5: null,
    stage_4:
      opts.actionKind === undefined
        ? null
        : {
            handler_key: null,
            draft_quality: null,
            feedback_reason: null,
            handler_output_kind: opts.actionKind,
            pipeline_event_id: null,
          },
    overrides: {
      axis_1_corrected_category: null,
      axis_1_human_verdict: null,
      axis_2_corrected_customer_account_id: null,
      axis_2_reviewed_by: null,
      axis_2_reviewed_at: null,
      axis_4_draft_quality: null,
      axis_4_feedback_reason: null,
      axis_3_event_ids: [],
    },
  };
}

describe("applyFilters", () => {
  const a = makeRow("a", { ruleId: "rule-1", categoryKey: "auto_reply" });
  const b = makeRow("b", { ruleId: "rule-2", categoryKey: "newsletter" });
  const c = makeRow("c", { ruleId: null, categoryKey: "unknown" });
  const rows = [a, b, c];

  const mailboxLabels: Record<string, string> = {
    a: "Smeba",
    b: "Fire-Control",
    c: "Smeba",
  };
  const timestamps: Record<string, string> = {
    a: "2026-05-10T10:00:00Z",
    b: "2026-05-15T10:00:00Z",
    c: "2026-05-20T10:00:00Z",
  };

  it("returns all rows when every filter is null", () => {
    const out = applyFilters(
      rows,
      { rule: null, mailbox: null, category: null, from: null, to: null },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["a", "b", "c"]);
  });

  it("filters by Stage 1 matched_rule_id", () => {
    const out = applyFilters(
      rows,
      { rule: "rule-1", mailbox: null, category: null, from: null, to: null },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["a"]);
  });

  it("filters by Stage 1 category_key (noise-vocabulary only)", () => {
    const out = applyFilters(
      rows,
      {
        rule: null,
        mailbox: null,
        category: "newsletter",
        from: null,
        to: null,
      },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["b"]);
  });

  it("filters by mailbox label", () => {
    const out = applyFilters(
      rows,
      { rule: null, mailbox: "Smeba", category: null, from: null, to: null },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["a", "c"]);
  });

  it("filters by date range (inclusive bounds)", () => {
    const out = applyFilters(
      rows,
      {
        rule: null,
        mailbox: null,
        category: null,
        from: "2026-05-12",
        to: "2026-05-18",
      },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["b"]);
  });

  it("composes filters with AND", () => {
    const out = applyFilters(
      rows,
      {
        rule: null,
        mailbox: "Smeba",
        category: "auto_reply",
        from: null,
        to: null,
      },
      mailboxLabels,
      timestamps,
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["a"]);
  });

  it("keeps undated rows visible when a date filter is active (WR-02)", () => {
    // Undated rows cannot be range-tested; they fall through rather than being
    // silently dropped for a missing-timestamp reason posing as a date-range
    // exclusion. Operators would otherwise lose rows with no signal why.
    const out = applyFilters(
      rows,
      {
        rule: null,
        mailbox: null,
        category: null,
        from: "2026-05-01",
        to: "2026-05-31",
      },
      mailboxLabels,
      {}, // no timestamps known → every row is undated
    );
    expect(out.map((r) => r.email_label_id)).toEqual(["a", "b", "c"]);
  });
});

// Phase 5 Plan 05-02 Task 1 (D-03) — Safety facet semantics. The safety
// guard reads EXACTLY r.stage_0?.verdict (single stage slot, hard-sep). A
// null stage_0 falls through to "safe" (Pitfall 5 — Phase 64 unshipped).
describe("applyFilters — Safety facet (Stage 0 only)", () => {
  const inj = makeRow("inj", { stage0Verdict: "injection_suspected" });
  const tooLarge = makeRow("big", { stage0Verdict: "over_budget" });
  const explicitSafe = makeRow("safe", { stage0Verdict: "safe" });
  const nullStage0 = makeRow("null", { stage0Verdict: null }); // null → safe
  const rows = [inj, tooLarge, explicitSafe, nullStage0];

  const NO_LABELS: Record<string, string> = {};
  const NO_TS: Record<string, string> = {};

  function run(safety: string | null) {
    return applyFilters(
      rows,
      {
        rule: null,
        mailbox: null,
        category: null,
        from: null,
        to: null,
        safety,
      },
      NO_LABELS,
      NO_TS,
    ).map((r) => r.email_label_id);
  }

  it("safety='injection' keeps only injection_suspected rows", () => {
    expect(run("injection")).toEqual(["inj"]);
  });

  it("safety='too-large' keeps only over_budget rows", () => {
    expect(run("too-large")).toEqual(["big"]);
  });

  it("safety='safe' keeps explicit-safe rows AND null-stage_0 rows", () => {
    expect(run("safe")).toEqual(["safe", "null"]);
  });

  it("safety='all' / unset → no safety filtering", () => {
    expect(run("all")).toEqual(["inj", "big", "safe", "null"]);
    expect(run(null)).toEqual(["inj", "big", "safe", "null"]);
  });

  it("hard-separation: a stage_0=safe row whose stage_1.category_key equals the injection option value is STILL excluded under safety='injection'", () => {
    // This row is safe at Stage 0 but carries a Stage 1 category named
    // exactly "injection" — if the guard leaked into stage_1 it would match.
    const decoy = makeRow("decoy", {
      stage0Verdict: "safe",
      categoryKey: "injection",
    });
    const out = applyFilters(
      [decoy],
      {
        rule: null,
        mailbox: null,
        category: null,
        from: null,
        to: null,
        safety: "injection",
      },
      NO_LABELS,
      NO_TS,
    );
    expect(out).toEqual([]);
  });
});

// Phase 5 Plan 05-03 Task 1 (D-06) — Status (mode) facet. The mode guard reads
// the per-row dryRunByRow map ARG (keyed by email_label_id), NOT a row field.
// dry_run default true (Plan 01 A3) — an unresolved row counts as dry_run.
describe("applyFilters — Status (mode) facet (dryRunByRow arg only)", () => {
  const liveRow = makeRow("live");
  const dryRow = makeRow("dry");
  const unresolvedRow = makeRow("unres"); // absent from dryRunByRow → default dry_run
  const rows = [liveRow, dryRow, unresolvedRow];

  const NO_LABELS: Record<string, string> = {};
  const NO_TS: Record<string, string> = {};
  // live → dry_run=false; dry → dry_run=true; unres → not present (default true)
  const dryRunByRow: Record<string, boolean> = { live: false, dry: true };

  function run(mode: string | null) {
    return applyFilters(
      rows,
      { rule: null, mailbox: null, category: null, from: null, to: null, mode },
      NO_LABELS,
      NO_TS,
      dryRunByRow,
    ).map((r) => r.email_label_id);
  }

  it("mode='live' keeps only rows where dryRunByRow === false", () => {
    expect(run("live")).toEqual(["live"]);
  });

  it("mode='dry_run' keeps explicit-true rows AND unresolved-default-true rows", () => {
    expect(run("dry_run")).toEqual(["dry", "unres"]);
  });

  it("mode='all' / unset → no mode filtering", () => {
    expect(run("all")).toEqual(["live", "dry", "unres"]);
    expect(run(null)).toEqual(["live", "dry", "unres"]);
  });
});

// Phase 5 Plan 05-03 Task 1 (Topic facet) — intent guard reads EXACTLY
// r.stage_3?.top_intent (Stage 3 vocabulary ONLY). Hard-separation: a row
// whose stage_1.category_key equals the intent value is excluded.
describe("applyFilters — Topic (intent) facet (Stage 3 only)", () => {
  const invoiceReq = makeRow("inv", { topIntent: "invoice_copy_request" });
  const labelReq = makeRow("lbl", { topIntent: "label_request" });
  const noStage3 = makeRow("none"); // stage_3 null
  const rows = [invoiceReq, labelReq, noStage3];

  const NO_LABELS: Record<string, string> = {};
  const NO_TS: Record<string, string> = {};

  function run(intent: string | null) {
    return applyFilters(
      rows,
      {
        rule: null,
        mailbox: null,
        category: null,
        from: null,
        to: null,
        intent,
      },
      NO_LABELS,
      NO_TS,
    ).map((r) => r.email_label_id);
  }

  it("intent='invoice_copy_request' keeps only rows with that stage_3.top_intent", () => {
    expect(run("invoice_copy_request")).toEqual(["inv"]);
  });

  it("intent unset → no intent filtering", () => {
    expect(run(null)).toEqual(["inv", "lbl", "none"]);
  });

  it("hard-separation: a row whose stage_1.category_key equals the intent value but has NO matching stage_3.top_intent is EXCLUDED under that intent filter", () => {
    // decoy: stage_1.category_key === "invoice_copy_request" (a Stage 1 noise
    // key collision), but stage_3 is null. If the guard leaked into stage_1 it
    // would match — it must NOT.
    const decoy = makeRow("decoy", { categoryKey: "invoice_copy_request" });
    const out = applyFilters(
      [decoy],
      {
        rule: null,
        mailbox: null,
        category: null,
        from: null,
        to: null,
        intent: "invoice_copy_request",
      },
      NO_LABELS,
      NO_TS,
    );
    expect(out).toEqual([]);
  });
});

// Sketch 008 — new stage-scoped facets. Match-type (Stage 1) reads
// predictor + matched_rule_id ONLY; Match-source + Account (Stage 2) read
// stage_2 ONLY; Action (Stage 4) reads stage_4.handler_output_kind ONLY.
describe("applyFilters — sketch 008 stage facets", () => {
  const NO_LABELS: Record<string, string> = {};
  const NO_TS: Record<string, string> = {};
  function run(filters: Parameters<typeof applyFilters>[1], rows: BulkReviewRow[]) {
    return applyFilters(rows, filters, NO_LABELS, NO_TS).map((r) => r.email_label_id);
  }

  it("Match-type 'pattern' keeps regex rows with a matched rule", () => {
    const pat = makeRow("pat", { ruleId: "auto-reply", predictor: "regex" });
    const ai = makeRow("ai", { ruleId: null, predictor: "llm_2nd_pass" });
    const none = makeRow("none", { ruleId: null, predictor: "regex" });
    const base = { rule: null, mailbox: null, category: null, from: null, to: null };
    expect(run({ ...base, matchType: "pattern" }, [pat, ai, none])).toEqual(["pat"]);
    expect(run({ ...base, matchType: "ai" }, [pat, ai, none])).toEqual(["ai"]);
    expect(run({ ...base, matchType: "none" }, [pat, ai, none])).toEqual(["none"]);
  });

  it("Match-source maps operator option → resolver_source; 'none' = unresolved", () => {
    const sender = makeRow("snd", { resolverSource: "sender_map" });
    const ref = makeRow("ref", { resolverSource: "identifier_match" });
    const ai = makeRow("ai", { resolverSource: "llm_tiebreaker" });
    const unr = makeRow("unr", { resolverSource: null });
    const noStage2 = makeRow("nos"); // stage_2 null → counts as no match
    const base = { rule: null, mailbox: null, category: null, from: null, to: null };
    const rows = [sender, ref, ai, unr, noStage2];
    expect(run({ ...base, matchSource: "sender" }, rows)).toEqual(["snd"]);
    expect(run({ ...base, matchSource: "reference" }, rows)).toEqual(["ref"]);
    expect(run({ ...base, matchSource: "ai" }, rows)).toEqual(["ai"]);
    expect(run({ ...base, matchSource: "none" }, rows)).toEqual(["unr", "nos"]);
  });

  it("Account-number does a substring match on the Stage 2 account id", () => {
    const a = makeRow("a", { accountId: "0421" });
    const b = makeRow("b", { accountId: "1042" });
    const c = makeRow("c", { accountId: null });
    const base = { rule: null, mailbox: null, category: null, from: null, to: null };
    expect(run({ ...base, account: "042" }, [a, b, c])).toEqual(["a", "b"]);
    expect(run({ ...base, account: "21" }, [a, b, c])).toEqual(["a"]);
  });

  it("Action keeps only rows with the matching handler_output_kind", () => {
    const draft = makeRow("d", { actionKind: "draft_body" });
    const done = makeRow("o", { actionKind: "action_confirmation" });
    const noStage4 = makeRow("n"); // stage_4 null
    const base = { rule: null, mailbox: null, category: null, from: null, to: null };
    expect(run({ ...base, action: "draft_body" }, [draft, done, noStage4])).toEqual(["d"]);
  });

  it("hard-separation: Match-source 'none' does NOT match a Stage 1 category named 'none'", () => {
    const decoy = makeRow("decoy", { categoryKey: "none", resolverSource: "sender_map" });
    const base = { rule: null, mailbox: null, category: null, from: null, to: null };
    // decoy IS sender_map at Stage 2, so 'none' must exclude it (proves the
    // guard reads stage_2, not stage_1.category_key).
    expect(run({ ...base, matchSource: "none" }, [decoy])).toEqual([]);
  });
});

// Sketch 008 (variant C) — layout/interaction locks rendered via RTL.
describe("FilterChipStrip — sketch 008 layout (variant C)", () => {
  const rows = [
    makeRow("a", { ruleId: "auto-reply", actionKind: "draft_body" }),
  ];
  const props = {
    rows,
    categories: [
      { category_key: "auto_reply", display_label: "Auto-reply" },
    ] as never,
    intents: [{ intent_key: "invoice_copy_request" }] as never,
    mailboxLabels: { a: "Smeba" },
  };

  it("main row contains ONLY Date(From/To) + Mode — no Mailbox, no stage facets", () => {
    render(<FilterChipStrip {...props} />);
    const mainRow = screen.getByTestId("filter-main-row");
    expect(mainRow.querySelector('[data-testid="filter-from-input"]')).toBeTruthy();
    expect(mainRow.querySelector('[data-testid="filter-to-input"]')).toBeTruthy();
    expect(mainRow.querySelector('[data-testid="filter-mode-seg"]')).toBeTruthy();
    // Operator UAT 2026-05-28: Mailbox control removed from the bar entirely.
    expect(mainRow.querySelector('[data-testid="filter-mailbox-select"]')).toBeNull();
    // Stage-specific controls must NOT be in the main row.
    expect(mainRow.querySelector('[data-testid="filter-rule-select"]')).toBeNull();
    expect(mainRow.querySelector('[data-testid="filter-category-select"]')).toBeNull();
    expect(mainRow.querySelector('[data-testid="filter-safety-select"]')).toBeNull();
    expect(mainRow.querySelector('[data-testid="filter-intent-select"]')).toBeNull();
  });

  it("stage rail is always visible with all 5 stage pills", () => {
    render(<FilterChipStrip {...props} />);
    expect(screen.getByTestId("filter-stage-rail")).toBeTruthy();
    for (const k of ["safety", "noise", "customer", "topic", "action"]) {
      expect(screen.getByTestId(`stage-pill-${k}`)).toBeTruthy();
    }
    // No panel open by default.
    expect(screen.queryByTestId("stage-panel-noise")).toBeNull();
  });

  it("Safety facet lives under Stage 0; Rule + Noise category under Stage 1; Topic under Stage 3", () => {
    render(<FilterChipStrip {...props} />);
    // Stage 0 → Safety
    fireEvent.click(screen.getByTestId("stage-pill-safety"));
    expect(screen.getByTestId("stage-panel-safety").querySelector('[data-testid="filter-safety-select"]')).toBeTruthy();
    // Stage 1 → Noise category + Matched rule + Match type
    fireEvent.click(screen.getByTestId("stage-pill-noise"));
    const noise = screen.getByTestId("stage-panel-noise");
    expect(noise.querySelector('[data-testid="filter-category-select"]')).toBeTruthy();
    expect(noise.querySelector('[data-testid="filter-rule-select"]')).toBeTruthy();
    expect(noise.querySelector('[data-testid="filter-match-type-select"]')).toBeTruthy();
    // Stage 3 → Topic
    fireEvent.click(screen.getByTestId("stage-pill-topic"));
    expect(screen.getByTestId("stage-panel-topic").querySelector('[data-testid="filter-intent-select"]')).toBeTruthy();
  });

  it("opens EXACTLY ONE stage panel at a time", () => {
    render(<FilterChipStrip {...props} />);
    fireEvent.click(screen.getByTestId("stage-pill-noise"));
    expect(screen.getByTestId("stage-panel-noise")).toBeTruthy();
    expect(screen.queryByTestId("stage-panel-customer")).toBeNull();
    // Opening another closes the first.
    fireEvent.click(screen.getByTestId("stage-pill-customer"));
    expect(screen.getByTestId("stage-panel-customer")).toBeTruthy();
    expect(screen.queryByTestId("stage-panel-noise")).toBeNull();
    // Clicking the open pill again closes it.
    fireEvent.click(screen.getByTestId("stage-pill-customer"));
    expect(screen.queryByTestId("stage-panel-customer")).toBeNull();
  });

  it("active facets surface as removable chips and clicking one clears its URL param", () => {
    currentParams = new URLSearchParams("filter_intent=invoice_copy_request");
    render(<FilterChipStrip {...props} />);
    const active = screen.getByTestId("filter-chip-strip-active");
    const chip = active.querySelector('[role="tab"]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain("Topic:");
    fireEvent.click(chip as Element);
    expect(replace).toHaveBeenCalled();
    expect(replace.mock.calls[0][0]).not.toContain("filter_intent");
  });

  it("Stage 4 Action group renders present-but-empty when no row reached a handler", () => {
    render(<FilterChipStrip {...props} rows={[makeRow("x")]} />);
    fireEvent.click(screen.getByTestId("stage-pill-action"));
    const panel = screen.getByTestId("stage-panel-action");
    expect(panel.querySelector('[data-testid="filter-action-select"]')).toBeTruthy();
    expect(screen.getByTestId("filter-action-empty")).toBeTruthy();
  });
});
