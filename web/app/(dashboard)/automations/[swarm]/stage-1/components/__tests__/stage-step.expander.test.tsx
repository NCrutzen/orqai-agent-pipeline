import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import { StageStep } from "../stage-step";
import type { StageData } from "../pipeline-flow";

const base: Omit<StageData, "n"> = {
  title: "Test",
  axis: null,
  state: "ok",
  currentValue: "noise",
};

describe("StageStep — Phase 82.3 Plan 07 expander wiring", () => {
  it("renders expander for Stage 1 when auditDetails provided", () => {
    const stage: StageData = {
      ...base,
      n: 1,
      auditDetails: <div data-testid="stage-1-audit">audit body</div>,
    };
    render(<StageStep stage={stage} onMarkDirty={() => {}} />);
    expect(screen.getByTestId("stage-detail-expander-1")).toBeTruthy();
  });

  it("renders expander for Stage 0, 2, 3 when auditDetails provided", () => {
    for (const n of [0, 2, 3] as const) {
      const stage: StageData = {
        ...base,
        n,
        auditDetails: <div>body</div>,
      };
      const { unmount } = render(
        <StageStep stage={stage} onMarkDirty={() => {}} />,
      );
      expect(screen.getByTestId(`stage-detail-expander-${n}`)).toBeTruthy();
      unmount();
    }
  });

  it("does NOT render expander for Stage 4 even if auditDetails set", () => {
    const stage: StageData = {
      ...base,
      n: 4,
      auditDetails: <div>defensive — should not render</div>,
    };
    render(<StageStep stage={stage} onMarkDirty={() => {}} />);
    expect(screen.queryByTestId("stage-detail-expander-4")).toBeNull();
  });

  it("does NOT render expander when auditDetails is undefined", () => {
    const stage: StageData = { ...base, n: 1 };
    render(<StageStep stage={stage} onMarkDirty={() => {}} />);
    expect(screen.queryByTestId("stage-detail-expander-1")).toBeNull();
  });

  it("preserves override-stage control when state==='ok'", () => {
    const stage: StageData = {
      ...base,
      n: 2,
      state: "ok",
      auditDetails: <div>body</div>,
    };
    render(<StageStep stage={stage} onMarkDirty={() => {}} />);
    expect(
      screen.getByRole("button", { name: /override stage 2/i }),
    ).toBeTruthy();
  });
});
