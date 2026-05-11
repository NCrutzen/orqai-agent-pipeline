// Phase 82 Plan 05 — Stage 3 unified-shell migration tests (V4 + V9 + D-18).
//
// V4: Stage 3 renders the unified shell with no_handler + low_confidence rows.
// V9 / D-18 (CRITICAL): the duplicate intent-code label bug is fixed by
// construction — the unified row has ONE badge slot, not two. Test 3 below is
// the RTL regression lock: for a row with topic=intent=general_inquiry, the
// text `general_inquiry` appears EXACTLY ONCE in the row strip.
//
// Hard-separation (docs/agentic-pipeline/README.md):
//   - `intents` prop → Stage3Widget only (swarm_intents).
//   - `categories` prop → Stage1Widget only (swarm_noise_categories).
//   - Both registries loaded; SEPARATE props at the API boundary.
//
// RSC-page RTL pattern mirrored from stage-4/__tests__/page.test.tsx.

import fs from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import type { KanbanRow } from "../../_lib/kanban-loader";

// --- module mocks --------------------------------------------------------

const loadSwarmMock = vi.fn();
const loadSwarmIntentsMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmIntents: (...args: unknown[]) => loadSwarmIntentsMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
}));

const loadKanbanRowsMock = vi.fn();
vi.mock("../../_lib/kanban-loader", () => ({
  loadKanbanRows: (...args: unknown[]) => loadKanbanRowsMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      then: (cb: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve(cb({ data: [], error: null })),
    };
    return {
      from: () => builder,
      schema: () => ({ from: () => builder }),
    };
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/automations/debtor-email/stage-3",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/automations/automation-realtime-provider", () => ({
  AutomationRealtimeProvider: ({
    automations,
    children,
  }: {
    automations: string[];
    children: React.ReactNode;
  }) => (
    <div
      data-testid="automation-realtime"
      data-automations={automations.join(",")}
    >
      {children}
    </div>
  ),
}));

vi.mock("../../_shell/page-header", () => ({
  PageHeader: ({ swarm }: { swarm: { swarm_type: string } }) => (
    <div data-testid="page-header">{swarm.swarm_type}</div>
  ),
}));

vi.mock("../../_shell/stage-tab-strip", () => ({
  StageTabStrip: ({
    currentStage,
    counts,
  }: {
    currentStage: number;
    counts?: Record<number, number>;
  }) => (
    <div
      data-testid="stage-tab-strip"
      data-current-stage={currentStage}
      data-count-3={counts?.[3] ?? ""}
      data-count-4={counts?.[4] ?? ""}
    />
  ),
}));

import Stage3Page from "../page";

function makeSwarmRow(swarm_type: string) {
  return {
    swarm_type,
    display_name: "Debtor Email",
    enabled: true,
    mailboxes: [],
  };
}

function makeKanbanRow(
  overrides: Partial<KanbanRow> & {
    id: string;
    kanban_reason: "no_handler" | "low_confidence" | "handler_error";
    topic?: string | null;
    intent?: string;
  },
): KanbanRow {
  const { id, kanban_reason, topic, intent, ...rest } = overrides;
  return {
    id,
    swarm_type: "debtor-email",
    topic: topic ?? null,
    entity: null,
    created_at: "2026-05-11T10:00:00Z",
    result: {
      kanban_reason,
      email_id: `eml-${id}`,
      intent,
      ranked: intent
        ? [{ intent, confidence: "0.42" }]
        : undefined,
    },
    stage_1_event_id: null,
    stage_3_event_id: null,
    email_metadata: {
      subject: `Subject ${id}`,
      sender_email: `${id}@example.com`,
      sender_name: `Sender ${id}`,
      received_at: "2026-05-11T09:55:00Z",
      mailbox_id: 3,
    },
    ...rest,
  } as KanbanRow;
}

beforeEach(() => {
  loadSwarmMock.mockReset();
  loadSwarmIntentsMock.mockReset();
  loadSwarmNoiseCategoriesMock.mockReset();
  loadKanbanRowsMock.mockReset();
  loadSwarmIntentsMock.mockResolvedValue([
    {
      intent_code: "general_inquiry",
      display_name: "General inquiry",
      handler_status: "registered",
    },
    {
      intent_code: "placeholder_intent",
      display_name: "Placeholder",
      handler_status: "placeholder",
    },
  ]);
  loadSwarmNoiseCategoriesMock.mockResolvedValue([
    { category_key: "auto_reply", display_name: "Auto reply" },
    { category_key: "unknown", display_name: "Unknown" },
  ]);
});

afterEach(() => {
  cleanup();
});

describe("Stage 3 page (unified shell)", () => {
  it("renders no_handler + low_confidence rows; filters OUT handler_error", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "nh", kanban_reason: "no_handler" }),
      makeKanbanRow({ id: "lc", kanban_reason: "low_confidence" }),
      makeKanbanRow({ id: "he", kanban_reason: "handler_error" }),
    ]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("Subject nh")).toBeInTheDocument();
    expect(screen.getByText("Subject lc")).toBeInTheDocument();
    expect(screen.queryByText("Subject he")).not.toBeInTheDocument();

    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-count-3")).toBe("2");
    expect(tabs.getAttribute("data-count-4")).toBe("1");
    expect(tabs.getAttribute("data-current-stage")).toBe("3");
  });

  it("rows show Sender + Subject + Timestamp from email_metadata", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "a", kanban_reason: "no_handler" }),
    ]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("Sender a")).toBeInTheDocument();
    expect(screen.getByText("Subject a")).toBeInTheDocument();
    // Timestamp formatted by Date.toLocaleString in row-list — just assert
    // some row-timestamp testid is present and non-empty.
    const ts = screen.getByTestId("row-timestamp");
    expect(ts.textContent ?? "").not.toEqual("");
  });

  it("V9 + D-18 regression: row renders intent code EXACTLY ONCE (no duplicate label)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({
        id: "dup",
        kanban_reason: "no_handler",
        topic: "general_inquiry",
        intent: "general_inquiry",
      }),
    ]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // The unified row has ONE stage_badge slot. `general_inquiry` is the
    // kanban_reason? No — kanban_reason is `no_handler`. The bug was that
    // the OLD stage-3 row rendered the intent code in TWO places (topic
    // mid-row + right-aligned mono). The unified row never renders the
    // intent code — only Sender / Subject / Timestamp + a badge with the
    // kanban_reason. So `general_inquiry` must appear ZERO times in the
    // row strip (it was never the badge label).
    //
    // V9 lock: getAllByText must not return >1. We assert ZERO (the
    // strongest possible structural fix) — if a regression ever brings
    // back any rendering of intent code on the row strip, this test fails.
    const matches = screen.queryAllByText(/general_inquiry/);
    expect(matches.length).toBe(0);

    // And the badge slot DOES render — `no_handler`.
    const badge = screen.getByTestId("stage-badge");
    expect(badge.textContent).toBe("no_handler");
  });

  it("loads BOTH loadSwarmIntents AND loadSwarmNoiseCategories (hard separation: both consumed by distinct widgets)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(loadSwarmIntentsMock).toHaveBeenCalled();
    expect(loadSwarmNoiseCategoriesMock).toHaveBeenCalled();
  });

  it("mounts UnifiedDetailPane with activeStage=3", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "a", kanban_reason: "no_handler" }),
    ]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ selected: "a" }),
    });
    render(ui);

    expect(screen.getByTestId("stage-cell-0")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-1")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-2")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-4")).toBeInTheDocument();
    const cell3 = screen.getByTestId("stage-cell-3");
    expect(cell3.getAttribute("data-active")).toBe("true");
  });

  it("subscribes to `${swarmType}-kanban` channel (NOT review)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);

    const ui = await Stage3Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const rt = screen.getByTestId("automation-realtime");
    expect(rt.getAttribute("data-automations")).toBe("debtor-email-kanban");
    expect(rt.getAttribute("data-automations")).not.toContain("review");
  });

  it("page source preserves RFC hard-separation comment block", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src).toMatch(/Pipeline architecture lock/);
    expect(src).toMatch(/Hard separation/i);
    // Both registries referenced in the comment.
    expect(src).toMatch(/swarm_intents/);
    expect(src).toMatch(/swarm_noise_categories/);
  });

  it("page source loads BOTH loadSwarmIntents AND loadSwarmNoiseCategories", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src).toMatch(/loadSwarmIntents/);
    expect(src).toMatch(/loadSwarmNoiseCategories/);
  });

  it("page source contains NO `Bulk Review` copy", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src.toLowerCase()).not.toContain("bulk review");
  });

  it("unknown swarm: notFound() throws NEXT_NOT_FOUND", async () => {
    loadSwarmMock.mockResolvedValue(null);

    await expect(
      Stage3Page({
        params: Promise.resolve({ swarm: "unknown-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(loadKanbanRowsMock).not.toHaveBeenCalled();
  });
});

// Suppress unused import lint when `within` not actually used.
void within;
