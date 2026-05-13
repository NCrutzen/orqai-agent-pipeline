import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());

import { StageDetailExpander } from "../StageDetailExpander";

describe("StageDetailExpander", () => {
  it("renders 'Show details' label and hides content by default", () => {
    render(
      <StageDetailExpander stage={1}>
        <div data-testid="child-content">child</div>
      </StageDetailExpander>,
    );
    const trigger = screen.getByRole("button", { name: /show details/i });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // Radix renders content with hidden when collapsed (or omits entirely).
    expect(screen.queryByTestId("child-content")).toBeNull();
  });

  it("flips to 'Hide details' and reveals content on click", async () => {
    const user = userEvent.setup();
    render(
      <StageDetailExpander stage={2}>
        <div data-testid="child-content">child</div>
      </StageDetailExpander>,
    );
    const trigger = screen.getByRole("button", { name: /show details/i });
    await user.click(trigger);
    expect(
      screen.getByRole("button", { name: /hide details/i }),
    ).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("collapses back when clicked again", async () => {
    const user = userEvent.setup();
    render(
      <StageDetailExpander stage={0}>
        <div data-testid="child-content">child</div>
      </StageDetailExpander>,
    );
    const trigger = screen.getByRole("button", { name: /show details/i });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: /hide details/i }),
    );
    expect(
      screen.getByRole("button", { name: /show details/i }),
    ).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles via keyboard Enter", async () => {
    const user = userEvent.setup();
    render(
      <StageDetailExpander stage={3}>
        <div data-testid="child-content">child</div>
      </StageDetailExpander>,
    );
    const trigger = screen.getByRole("button", { name: /show details/i });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: /hide details/i }),
    ).toBeTruthy();
  });

  it("exposes data-testid stage-detail-expander-{stage} on root", () => {
    render(
      <StageDetailExpander stage={2}>
        <div>child</div>
      </StageDetailExpander>,
    );
    expect(screen.getByTestId("stage-detail-expander-2")).toBeTruthy();
  });
});
