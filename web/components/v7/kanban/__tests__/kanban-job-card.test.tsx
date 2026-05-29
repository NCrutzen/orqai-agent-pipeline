// Phase 3 Plan 01 Task 0c — Regression coverage for the kanban "Open review"
// link target. The href was previously hardcoded to /automations/debtor-email/review
// which 404'd because the route did not exist (Task 0b mounts it). This test
// locks the link target so a future refactor cannot silently break it.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next/link with a passthrough so href resolves on the rendered <a>.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// dnd-kit primitives mocked to no-ops — the link logic does not depend on
// drag state beyond the isDragOverlay branch which we gate explicitly.
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

import { KanbanJobCard } from "../kanban-job-card";
import type { SwarmJob } from "@/lib/v7/types";

function makeJob(overrides: Partial<SwarmJob> = {}): SwarmJob {
  return {
    id: "job-1",
    swarm_id: "swarm-1",
    title: "Test job",
    description: null,
    stage: "review",
    priority: "normal",
    assigned_agent: null,
    tags: [],
    position: 0,
    created_at: "2026-05-24T00:00:00Z",
    updated_at: "2026-05-24T00:00:00Z",
    ...overrides,
  };
}

describe("KanbanJobCard — 'Open review' link target (Phase 3 Plan 01 Task 0c)", () => {
  afterEach(() => cleanup());

  it("defaults the href to /automations/debtor-email/review when swarmType is omitted", () => {
    render(<KanbanJobCard job={makeJob()} />);
    const link = screen.getByTestId("kanban-job-card-open-review-link");
    expect(link.getAttribute("href")).toBe("/automations/debtor-email/review");
  });

  it("uses the provided swarmType for the href (cross-swarm support)", () => {
    render(<KanbanJobCard job={makeJob()} swarmType="sales-email" />);
    const link = screen.getByTestId("kanban-job-card-open-review-link");
    expect(link.getAttribute("href")).toBe("/automations/sales-email/review");
  });

  it("does NOT render the Open-review link when stage !== 'review'", () => {
    render(<KanbanJobCard job={makeJob({ stage: "done" })} />);
    expect(
      screen.queryByTestId("kanban-job-card-open-review-link"),
    ).toBeNull();
  });

  it("does NOT render the Open-review link in the DragOverlay portal (prevents id duplication)", () => {
    render(<KanbanJobCard job={makeJob()} isDragOverlay />);
    expect(
      screen.queryByTestId("kanban-job-card-open-review-link"),
    ).toBeNull();
  });
});

