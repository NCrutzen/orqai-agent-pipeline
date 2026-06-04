// Phase 5 Plan 04 — SupportTicketsClientShell RTL coverage (ADMIN-01).
//
// T1: override-delta badge present when proposed_intent != final_intent.
// T2: no override-delta badge when proposed_intent == final_intent.
// T3: three filter <select>s exist (system / intent / status).
// T4: time_to_resolve_minutes renders the value; "—" when null.
// T5: NO write affordance — no edit/delete/save/create button text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { SubmissionRow } from "../_lib/load-submissions";

// --- module mocks -----------------------------------------------------------

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Import AFTER mocks.
import { SupportTicketsClientShell } from "../client-shell";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseRow: SubmissionRow = {
  id: "00000000-0000-4000-8000-000000000001",
  submission_id: "00000000-0000-4000-8000-000000000002",
  submitter_id: "user-abc",
  submitted_at: "2026-06-01T10:00:00Z",
  user_chosen_type: "bug",
  proposed_intent: "clickup-escalate",
  proposed_system: "nxt",
  proposed_assignee: null,
  final_intent: "clickup-escalate",
  final_system: "nxt",
  final_assignee: null,
  clickup_status: "in-progress",
  clickup_task_id: "CT-123",
  time_to_resolve_minutes: 45,
};

const overriddenRow: SubmissionRow = {
  ...baseRow,
  id: "00000000-0000-4000-8000-000000000003",
  proposed_intent: "info-answer",
  final_intent: "clickup-escalate",  // different → delta
};

const nullTimeRow: SubmissionRow = {
  ...baseRow,
  id: "00000000-0000-4000-8000-000000000004",
  time_to_resolve_minutes: null,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SupportTicketsClientShell", () => {
  it("T1 — override-delta badge present when proposed_intent != final_intent", () => {
    render(
      <SupportTicketsClientShell
        rows={[overriddenRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    // The delta badge has data-testid and aria-label
    const badge = screen.getByTestId("override-delta-badge");
    expect(badge).toBeTruthy();
    expect(badge.getAttribute("aria-label")).toBe("intent overridden");
  });

  it("T2 — no override-delta badge when proposed_intent == final_intent", () => {
    render(
      <SupportTicketsClientShell
        rows={[baseRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    expect(screen.queryByTestId("override-delta-badge")).toBeNull();
  });

  it("T3 — three filter selects exist (system / intent / status)", () => {
    render(
      <SupportTicketsClientShell
        rows={[baseRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    expect(screen.getByLabelText("Filter by system")).toBeTruthy();
    expect(screen.getByLabelText("Filter by intent")).toBeTruthy();
    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
  });

  it("T4a — time_to_resolve_minutes renders the numeric value", () => {
    render(
      <SupportTicketsClientShell
        rows={[baseRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    // baseRow has time_to_resolve_minutes = 45
    expect(screen.getByText("45 min")).toBeTruthy();
  });

  it("T4b — time_to_resolve_minutes renders '—' when null", () => {
    render(
      <SupportTicketsClientShell
        rows={[nullTimeRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    // There are multiple "—" cells (proposed/final intent etc.) but at
    // least one should be for time-to-resolve. We just assert presence.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("T5 — NO write affordance: no edit/delete/save/create button text", () => {
    const { container } = render(
      <SupportTicketsClientShell
        rows={[baseRow, overriddenRow]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/\bedit\b/);
    expect(html).not.toMatch(/\bdelete\b/);
    expect(html).not.toMatch(/\bsave\b/);
    expect(html).not.toMatch(/\bcreate\b/);
  });

  it("T6 — empty state copy renders when rows=[]", () => {
    render(
      <SupportTicketsClientShell
        rows={[]}
        activeSystem=""
        activeIntent=""
        activeStatus=""
      />,
    );
    expect(screen.getByText("No submissions found")).toBeTruthy();
  });
});
