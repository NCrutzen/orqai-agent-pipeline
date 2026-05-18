import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StageScreenshotStrip } from "../StageScreenshotStrip";

vi.mock("../ScreenshotThumb", () => ({
  ScreenshotThumb: ({ path, label }: { path: string; label: string }) => (
    <div data-testid="screenshot-thumb" data-path={path} data-label={label} />
  ),
}));

afterEach(() => {
  cleanup();
});

describe("StageScreenshotStrip", () => {
  it("renders before + after thumbnails when both paths present", () => {
    render(<StageScreenshotStrip beforePath="a/before.png" afterPath="a/after.png" />);
    const thumbs = screen.getAllByTestId("screenshot-thumb");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0].getAttribute("data-label")).toBe("Before");
    expect(thumbs[1].getAttribute("data-label")).toBe("After");
  });

  it("renders only before thumb + dash placeholder when after missing", () => {
    render(<StageScreenshotStrip beforePath="a/before.png" afterPath={null} />);
    const thumbs = screen.getAllByTestId("screenshot-thumb");
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0].getAttribute("data-label")).toBe("Before");
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders only after thumb + dash placeholder when before missing", () => {
    render(<StageScreenshotStrip beforePath={null} afterPath="a/after.png" />);
    const thumbs = screen.getAllByTestId("screenshot-thumb");
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0].getAttribute("data-label")).toBe("After");
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders empty-state copy when both paths null", () => {
    render(<StageScreenshotStrip beforePath={null} afterPath={null} />);
    expect(screen.getByText("No screenshots available")).toBeTruthy();
    expect(screen.queryByTestId("screenshot-thumb")).toBeNull();
  });

  it("uses custom emptyCopy when provided", () => {
    render(<StageScreenshotStrip beforePath={null} afterPath={null} emptyCopy="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });
});
