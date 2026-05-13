import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Reset module-level cache between tests
beforeEach(async () => {
  vi.resetModules();
});

async function importThumb() {
  const mod = await import("../ScreenshotThumb");
  return mod.ScreenshotThumb;
}

function mockFetchOk(url: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ url, expires_at: "2030-01-01T00:00:00Z" }),
  });
  // @ts-expect-error - test override
  global.fetch = fetchMock;
  return fetchMock;
}

function mockFetch404() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ error: "not found" }),
  });
  // @ts-expect-error - test override
  global.fetch = fetchMock;
  return fetchMock;
}

describe("ScreenshotThumb", () => {
  it("happy path: renders img with returned signed URL", async () => {
    mockFetchOk("https://signed.example.com/before.png");
    const ScreenshotThumb = await importThumb();
    render(<ScreenshotThumb path="bucket/before.png" label="Before" />);
    const img = await screen.findByAltText("Before");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://signed.example.com/before.png");
  });

  it("calls signed-url endpoint with encoded path", async () => {
    const fetchMock = mockFetchOk("https://signed.example.com/x.png");
    const ScreenshotThumb = await importThumb();
    render(<ScreenshotThumb path="bucket/with space/x.png" label="Before" />);
    await screen.findByAltText("Before");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/automations/audit/signed-url");
    expect(calledUrl).toContain(encodeURIComponent("bucket/with space/x.png"));
  });

  it("click thumbnail toggles inline expanded full-width img", async () => {
    mockFetchOk("https://signed.example.com/after.png");
    const ScreenshotThumb = await importThumb();
    render(<ScreenshotThumb path="bucket/after.png" label="After" />);
    const img = await screen.findByAltText("After");
    expect(screen.queryByTestId("screenshot-full-After")).toBeNull();
    fireEvent.click(img);
    expect(screen.getByTestId("screenshot-full-After")).toBeTruthy();
    fireEvent.click(img);
    expect(screen.queryByTestId("screenshot-full-After")).toBeNull();
  });

  it("404 response renders error fallback with Refresh button", async () => {
    mockFetch404();
    const ScreenshotThumb = await importThumb();
    render(<ScreenshotThumb path="bucket/missing.png" label="Before" />);
    await waitFor(() =>
      expect(
        screen.getByText("Screenshot unavailable. Refresh to retry."),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("Refresh button re-triggers fetch", async () => {
    const fetchMock = mockFetch404();
    const ScreenshotThumb = await importThumb();
    render(<ScreenshotThumb path="bucket/r.png" label="Before" />);
    await waitFor(() =>
      expect(
        screen.getByText("Screenshot unavailable. Refresh to retry."),
      ).toBeTruthy(),
    );
    expect(fetchMock.mock.calls.length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
  });

  it("200ms cache: second instance with same path within window does NOT re-fetch", async () => {
    const fetchMock = mockFetchOk("https://signed.example.com/cached.png");
    const ScreenshotThumb = await importThumb();
    const { unmount } = render(
      <ScreenshotThumb path="bucket/cached.png" label="Before" />,
    );
    await screen.findByAltText("Before");
    expect(fetchMock.mock.calls.length).toBe(1);
    unmount();
    // Second mount immediately (within 200ms TTL)
    render(<ScreenshotThumb path="bucket/cached.png" label="Before" />);
    await screen.findByAltText("Before");
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});
