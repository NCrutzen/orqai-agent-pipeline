// Phase 82.4 Plan 04 — fireFeedback helper unit tests.
//
// Covers the four documented invariants:
//   1. happy-path 2xx → fetch shape correct, no console.warn
//   2. non-2xx → console.warn called, no throw
//   3. fetch rejects → console.warn called, no throw
//   4. corrected_value + prose_notes both present in stringified body

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireFeedback } from "../fire-feedback";

describe("fireFeedback", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts JSON to /api/automations/debtor-email/feedback on 2xx and does not warn", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    await fireFeedback({
      email_id: "abc-123",
      stage: 1,
      verdict: "override",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/automations/debtor-email/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      email_id: "abc-123",
      stage: 1,
      verdict: "override",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns but does not throw on non-2xx response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    await expect(
      fireFeedback({
        email_id: "x",
        stage: 2,
        verdict: "confirm",
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[fireFeedback]");
  });

  it("warns but does not throw when fetch rejects (network error)", async () => {
    fetchSpy.mockRejectedValue(new Error("connection refused"));

    await expect(
      fireFeedback({
        email_id: "x",
        stage: 0,
        verdict: "override",
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[fireFeedback]");
  });

  it("forwards both corrected_value and prose_notes in the body", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    await fireFeedback({
      email_id: "abc-123",
      stage: 3,
      verdict: "override",
      corrected_value: "spam",
      prose_notes: "this looked promotional to me",
    });

    const init = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      email_id: "abc-123",
      stage: 3,
      verdict: "override",
      corrected_value: "spam",
      prose_notes: "this looked promotional to me",
    });
  });
});
