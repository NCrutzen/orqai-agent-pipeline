// Phase 4 Plan 02 Task 2 — StatusFilterChipStrip tests.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const replaceMock = vi.fn();
const searchParamsMock = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsMock.value,
}));

import { StatusFilterChipStrip } from "../status-filter-chip-strip";

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsMock.value = new URLSearchParams();
});
afterEach(() => cleanup());

describe("StatusFilterChipStrip", () => {
  it("renders five chips with operator-facing labels (P4-D-04)", () => {
    render(<StatusFilterChipStrip />);
    expect(screen.getByTestId("status-filter-chip-all").textContent).toBe("all");
    expect(screen.getByTestId("status-filter-chip-open").textContent).toBe("needs review");
    expect(screen.getByTestId("status-filter-chip-in_review").textContent).toBe("being reviewed");
    expect(screen.getByTestId("status-filter-chip-approved").textContent).toBe("applied");
    expect(screen.getByTestId("status-filter-chip-rejected").textContent).toBe("dismissed");
  });

  it("defaults to 'all' selected when no ?status= param", () => {
    render(<StatusFilterChipStrip />);
    expect(screen.getByTestId("status-filter-chip-all").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("status-filter-chip-open").getAttribute("data-active")).toBe("false");
  });

  it("marks the chip matching ?status= as active", () => {
    searchParamsMock.value = new URLSearchParams("status=in_review");
    render(<StatusFilterChipStrip />);
    expect(screen.getByTestId("status-filter-chip-in_review").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("status-filter-chip-all").getAttribute("data-active")).toBe("false");
  });

  it("clicking a non-'all' chip calls router.replace with ?status=value", () => {
    render(<StatusFilterChipStrip />);
    fireEvent.click(screen.getByTestId("status-filter-chip-open"));
    expect(replaceMock).toHaveBeenCalledWith("?status=open");
  });

  it("clicking 'all' omits the status param from the URL", () => {
    searchParamsMock.value = new URLSearchParams("status=open");
    render(<StatusFilterChipStrip />);
    fireEvent.click(screen.getByTestId("status-filter-chip-all"));
    expect(replaceMock).toHaveBeenCalledWith("?");
  });

  it("single-select: swapping chips replaces (not toggles) status", () => {
    searchParamsMock.value = new URLSearchParams("status=open");
    render(<StatusFilterChipStrip />);
    fireEvent.click(screen.getByTestId("status-filter-chip-approved"));
    expect(replaceMock).toHaveBeenCalledWith("?status=approved");
  });

  it("unknown ?status= value falls through to 'all' selection", () => {
    searchParamsMock.value = new URLSearchParams("status=bogus");
    render(<StatusFilterChipStrip />);
    expect(screen.getByTestId("status-filter-chip-all").getAttribute("data-active")).toBe("true");
  });
});
