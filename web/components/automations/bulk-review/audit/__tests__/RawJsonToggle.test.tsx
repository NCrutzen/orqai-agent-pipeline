import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());

import { RawJsonToggle } from "../RawJsonToggle";

describe("RawJsonToggle", () => {
  it("renders 'Show raw JSON' label and hides content by default", () => {
    render(<RawJsonToggle raw={{ foo: 1 }} />);
    const trigger = screen.getByRole("button", { name: /show raw json/i });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("raw-json-content")).toBeNull();
  });

  it("flips to 'Hide raw JSON' and renders 2-space-indented JSON on click", async () => {
    const user = userEvent.setup();
    render(<RawJsonToggle raw={{ foo: 1 }} />);
    const trigger = screen.getByRole("button", { name: /show raw json/i });
    await user.click(trigger);
    expect(
      screen.getByRole("button", { name: /hide raw json/i }),
    ).toBeTruthy();
    const content = screen.getByTestId("raw-json-content");
    expect(content).toBeTruthy();
    expect(content.textContent).toContain('"foo": 1');
  });

  it("renders empty object as {}", async () => {
    const user = userEvent.setup();
    render(<RawJsonToggle raw={{}} />);
    await user.click(screen.getByRole("button", { name: /show raw json/i }));
    const content = screen.getByTestId("raw-json-content");
    expect(content.textContent?.trim()).toBe("{}");
  });

  it("toggles via keyboard Enter", async () => {
    const user = userEvent.setup();
    render(<RawJsonToggle raw={{ a: 2 }} />);
    const trigger = screen.getByRole("button", { name: /show raw json/i });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: /hide raw json/i }),
    ).toBeTruthy();
    expect(screen.getByTestId("raw-json-content")).toBeTruthy();
  });

  it("exposes data-testid raw-json-toggle on root", () => {
    render(<RawJsonToggle raw={{ x: "y" }} />);
    expect(screen.getByTestId("raw-json-toggle")).toBeTruthy();
  });
});
