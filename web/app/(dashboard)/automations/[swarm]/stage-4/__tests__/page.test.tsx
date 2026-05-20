// Phase 82 Plan 04 — Stage 4 unified-shell migration tests.
//
// V5 verification check: Stage 4 renders the unified shell with
// handler_error rows. Hard separation lock preserved (no swarm_intents
// load; categories-only for the Reclassify-to-noise widget).
//
// Behaviors covered:
//   1. Renders handler_error rows with sender + subject + timestamp from
//      email_metadata (no `(no subject)` for rows whose email exists).
//   2. Filters out rows with kanban_reason !== 'handler_error'.
//   3. UnifiedDetailPane mounted with activeStage=4.
//   4. AutomationRealtimeProvider mounted with `${swarmType}-kanban`.
//   5. NO `${swarmType}-review` channel (hard channel separation per Pitfall 5).
//   6. loadSwarmIntents NOT called (Stage 4 has no Replay path; hard sep lock).
//   7. RFC hard-separation comment block preserved at top of file.
//   8. Unknown swarm → notFound().
//
// RSC-page RTL pattern: await the async component, pass result into render(),
// mock loaders at module boundary.

import fs from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { KanbanRow } from "../../_lib/kanban-loader";

// --- module mocks --------------------------------------------------------

const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
const loadSwarmIntentsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
  loadSwarmIntents: (...args: unknown[]) => loadSwarmIntentsMock(...args),
}));

const loadKanbanRowsMock = vi.fn();
vi.mock("../../_lib/kanban-loader", () => ({
  loadKanbanRows: (...args: unknown[]) => loadKanbanRowsMock(...args),
}));

// Phase 82.8-05 — Stage 4 page now also loads pipeline_events auto-archived rows.
const loadAutoArchivedNoiseRowsMock = vi.fn();
vi.mock("../_lib/load-auto-archived-noise-rows", () => ({
  loadAutoArchivedNoiseRows: (...args: unknown[]) =>
    loadAutoArchivedNoiseRowsMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    // Stub admin for the body/timeline pre-fetch. Returns empty arrays.
    // Plan 88-04: added `.not()` + `.limit()` to support loadMailboxLabels
    // chain (loadMailboxLabels uses .eq().not().not().limit()).
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (cb: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve(cb({ data: [], error: null })),
    });
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
  usePathname: () => "/automations/debtor-email/stage-4",
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

import Stage4Page from "../page";

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
  },
): KanbanRow {
  const { id, kanban_reason, ...rest } = overrides;
  return {
    id,
    swarm_type: "debtor-email",
    topic: null,
    entity: null,
    created_at: "2026-05-10T10:00:00Z",
    result: {
      kanban_reason,
      email_id: `eml-${id}`,
      error_name: "TestError",
      error_detail: "stack trace…",
    },
    stage_1_event_id: null,
    stage_3_event_id: null,
    email_metadata: {
      subject: `Subject ${id}`,
      sender_email: `${id}@example.com`,
      sender_name: `Sender ${id}`,
      received_at: "2026-05-10T09:55:00Z",
      mailbox_id: 4,
    },
    ...rest,
  } as KanbanRow;
}

beforeEach(() => {
  loadSwarmMock.mockReset();
  loadSwarmNoiseCategoriesMock.mockReset();
  loadSwarmIntentsMock.mockReset();
  loadKanbanRowsMock.mockReset();
  loadAutoArchivedNoiseRowsMock.mockReset();
  loadSwarmNoiseCategoriesMock.mockResolvedValue([
    { category_key: "auto_reply", display_name: "Auto reply" },
    { category_key: "unknown", display_name: "Unknown" },
  ]);
  // Phase 82.8-05: default empty auto-archived list so tests focused on
  // handler-error rendering keep their assertions stable.
  loadAutoArchivedNoiseRowsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("Stage 4 page (unified shell)", () => {
  it("renders handler_error rows with sender + subject from email_metadata", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "a", kanban_reason: "handler_error" }),
      makeKanbanRow({ id: "b", kanban_reason: "handler_error" }),
    ]);

    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("Subject a")).toBeInTheDocument();
    expect(screen.getByText("Subject b")).toBeInTheDocument();
    expect(screen.getByText("Sender a")).toBeInTheDocument();
    expect(screen.getByText("Sender b")).toBeInTheDocument();
  });

  it("filters OUT non-handler_error rows (Stage 4 only shows handler errors)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "ok-1", kanban_reason: "handler_error" }),
      makeKanbanRow({ id: "skip-1", kanban_reason: "no_handler" }),
      makeKanbanRow({ id: "skip-2", kanban_reason: "low_confidence" }),
    ]);

    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("Subject ok-1")).toBeInTheDocument();
    expect(screen.queryByText("Subject skip-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Subject skip-2")).not.toBeInTheDocument();

    // Tab strip should show stage-3 count = 2 (skipped rows) and stage-4 = 1.
    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-count-3")).toBe("2");
    expect(tabs.getAttribute("data-count-4")).toBe("1");
    expect(tabs.getAttribute("data-current-stage")).toBe("4");
  });

  it("subscribes ONLY to `${swarmType}-kanban` channel (NOT review)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);

    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const rt = screen.getByTestId("automation-realtime");
    expect(rt.getAttribute("data-automations")).toBe("debtor-email-kanban");
    expect(rt.getAttribute("data-automations")).not.toContain("review");
  });

  it("does NOT call loadSwarmIntents (Stage 4 has no Replay path — hard sep)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);

    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(loadSwarmIntentsMock).not.toHaveBeenCalled();
  });

  it("mounts UnifiedDetailPane (5-cell pipeline-section + activeStage=4)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "a", kanban_reason: "handler_error" }),
    ]);

    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      // Pre-select first row so the inner DetailPane renders the
      // activeStage=4 cells.
      searchParams: Promise.resolve({ selected: "a" }),
    });
    render(ui);

    // Each of 5 stage-cell-{n} markers exists; stage-cell-4 is active.
    expect(screen.getByTestId("stage-cell-0")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-1")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-2")).toBeInTheDocument();
    expect(screen.getByTestId("stage-cell-3")).toBeInTheDocument();
    const cell4 = screen.getByTestId("stage-cell-4");
    expect(cell4.getAttribute("data-active")).toBe("true");
  });

  it("preserves RFC hard-separation comment block at top of file", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src).toMatch(/Pipeline architecture lock/);
    expect(src).toMatch(/Hard separation/i);
    expect(src).toMatch(/Stage 4 has NO Replay-edit path/);
  });

  it("page source does NOT import loadSwarmIntents", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src).not.toMatch(/loadSwarmIntents/);
  });

  it("page source contains NO `Bulk Review` copy", () => {
    const pagePath = path.join(__dirname, "..", "page.tsx");
    const src = fs.readFileSync(pagePath, "utf-8");
    expect(src.toLowerCase()).not.toContain("bulk review");
  });

  // -- Phase 88 Plan 04 D-03 — outcome-state chip-strip ---------------------

  it("D-03 [Task 2 — outcome parse]: ?outcome=handler_error → handler_error chip is active and only handler-error rows render", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "he-1", kanban_reason: "handler_error" }),
      makeKanbanRow({ id: "skip-1", kanban_reason: "no_handler" }),
    ]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ outcome: "handler_error" }),
    });
    render(ui);
    // Chip with key "handler_error" should be aria-selected=true.
    const chip = screen.getByRole("tab", { name: /Handler error/i });
    expect(chip.getAttribute("aria-selected")).toBe("true");
    // Handler-error row visible.
    expect(screen.getByText("Subject he-1")).toBeInTheDocument();
  });

  it("D-03 [Task 2 — outcome parse]: ?outcome=needs_review → needs_review chip active", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ outcome: "needs_review" }),
    });
    render(ui);
    const chip = screen.getByRole("tab", { name: /Needs review/i });
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  it("D-03 [Task 2 — outcome parse]: ?outcome=auto_archived → auto_archived chip active", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ outcome: "auto_archived" }),
    });
    render(ui);
    const chip = screen.getByRole("tab", { name: /Auto-archived/i });
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  it("D-03 [Task 2 — outcome parse]: missing ?outcome → 'All' chip active (default)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);
    const chip = screen.getByRole("tab", { name: /^All/i });
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  it("D-03 [Task 2 — outcome parse]: ?outcome=foo (unknown) coerces to 'All'", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ outcome: "foo" }),
    });
    render(ui);
    const chip = screen.getByRole("tab", { name: /^All/i });
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  it("D-03 [Task 3 — chips render]: four chips render with brand-token dots on non-All chips", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadKanbanRowsMock.mockResolvedValue([
      makeKanbanRow({ id: "he-1", kanban_reason: "handler_error" }),
    ]);
    const ui = await Stage4Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);
    // Four chips total.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(4);
    // Labels in order.
    expect(tabs[0].textContent).toMatch(/All/);
    expect(tabs[1].textContent).toMatch(/Handler error/);
    expect(tabs[2].textContent).toMatch(/Needs review/);
    expect(tabs[3].textContent).toMatch(/Auto-archived/);
  });

  it("D-03 [Task 3 — hard-sep]: client-shell.tsx contains NO swarm_intents references", () => {
    const csPath = path.join(__dirname, "..", "client-shell.tsx");
    const src = fs.readFileSync(csPath, "utf-8");
    expect(src).not.toMatch(/swarm_intents/);
    expect(src).not.toMatch(/SwarmIntentRow/);
    // intents={[]} preserved on UnifiedDetailPane mount.
    expect(src).toMatch(/intents=\{\[\]\}/);
  });

  it("D-03 [Task 3 — chip-strip]: client-shell.tsx has NO Collapsible imports/usages", () => {
    const csPath = path.join(__dirname, "..", "client-shell.tsx");
    const src = fs.readFileSync(csPath, "utf-8");
    expect(src).not.toMatch(/Collapsible/);
    expect(src).toMatch(/ChipStrip/);
  });

  it("unknown swarm: notFound() throws NEXT_NOT_FOUND", async () => {
    loadSwarmMock.mockResolvedValue(null);

    await expect(
      Stage4Page({
        params: Promise.resolve({ swarm: "unknown-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(loadKanbanRowsMock).not.toHaveBeenCalled();
  });
});
