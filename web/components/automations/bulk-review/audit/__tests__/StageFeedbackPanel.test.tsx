/**
 * Phase 82.4 Plan 03 → Phase 82.5 Plan 03 — StageFeedbackPanel RTL coverage.
 *
 * Phase 82.5 Plan 03 updates (R1/R4/R5):
 *  - Save is no longer disabled-when-empty (still posts verdict:'unclear');
 *    R4 microcopy "⤓ Override + note save together" makes empty-save legal.
 *  - Successful Save/Confirm now triggers a follow-up GET to refresh read-back
 *    (2 fetch calls per write — POST + GET).
 *  - Confirm with empty textarea triggers window.confirm() soft dialog
 *    ("Confirm this stage without writing a note?"). Tests stub window.confirm
 *    where they exercise the empty-confirm path.
 *
 * Covers:
 *  1. Render — textarea + Save (R5) + Confirm (R5) chips with data-testid.
 *  2. R4 microcopy rendered under the label.
 *  3. Save click (empty) → POST verdict:'unclear' (no prose_notes).
 *  4. Save click (with prose) → POST verdict:'unclear' + prose_notes.
 *  5. Confirm click (empty textarea, user accepts dialog) → POST verdict:'confirm'.
 *  6. Confirm click (empty textarea, user cancels dialog) → no POST.
 *  7. 2xx confirm → onAfterConfirm() invoked.
 *  8. Non-2xx → inline error with role="alert".
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StageFeedbackPanel } from "../StageFeedbackPanel";

const EMAIL_ID = "11111111-2222-3333-4444-555555555555";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetchOk() {
  // POST returns ok; subsequent GET refresh returns empty read-back JSON.
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === "GET" || !init?.method) {
      return Promise.resolve(
        new Response(JSON.stringify({ own_latest: null, others: [] }), { status: 200 }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, id: "row-1" }), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFetchFail() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function findPostCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );
}

describe("StageFeedbackPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders textarea + Save + Confirm chip with data-testid scoped to stage", () => {
    render(<StageFeedbackPanel stage={2} emailId={EMAIL_ID} />);

    expect(screen.getByTestId("stage-feedback-panel-2")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByTestId("stage-feedback-save")).toBeTruthy();
    expect(screen.getByTestId("stage-feedback-confirm")).toBeTruthy();
  });

  it("renders R4 override+note coupling microcopy under the label", () => {
    render(<StageFeedbackPanel stage={1} emailId={EMAIL_ID} />);
    const helper = screen.getByTestId("override-coupling-helper");
    expect(helper.textContent).toMatch(/Override \+ note save together/);
  });

  it("Save click (empty prose) POSTs verdict:'unclear' (Phase 82.5 — no longer disabled-when-empty)", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={1} emailId={EMAIL_ID} />);

    await user.click(screen.getByTestId("stage-feedback-save"));

    await waitFor(() => expect(findPostCall(fetchMock)).toBeDefined());
    const postCall = findPostCall(fetchMock)!;
    const body = JSON.parse(String(postCall[1]!.body));
    expect(body.verdict).toBe("unclear");
    expect(body.prose_notes).toBeUndefined();
  });

  it("Save click (with prose) POSTs verdict:'unclear' with the typed prose_notes", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={0} emailId={EMAIL_ID} />);

    await user.type(screen.getByRole("textbox"), "border case missed");
    await user.click(screen.getByTestId("stage-feedback-save"));

    await waitFor(() => expect(findPostCall(fetchMock)).toBeDefined());
    const [url, init] = findPostCall(fetchMock)!;
    expect(url).toBe("/api/automations/debtor-email/feedback");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({
      email_id: EMAIL_ID,
      stage: 0,
      verdict: "unclear",
      prose_notes: "border case missed",
    });
  });

  it("Confirm click (empty textarea, user accepts soft dialog) POSTs verdict:'confirm'", async () => {
    const fetchMock = mockFetchOk();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={3} emailId={EMAIL_ID} />);

    await user.click(screen.getByTestId("stage-feedback-confirm"));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Confirm this stage without writing a note?",
    );
    await waitFor(() => expect(findPostCall(fetchMock)).toBeDefined());
    const body = JSON.parse(String(findPostCall(fetchMock)![1]!.body));
    expect(body.verdict).toBe("confirm");
    expect(body.prose_notes).toBeUndefined();
  });

  it("Confirm click (empty textarea, user cancels soft dialog) does NOT POST", async () => {
    const fetchMock = mockFetchOk();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={3} emailId={EMAIL_ID} />);

    await user.click(screen.getByTestId("stage-feedback-confirm"));

    // Give microtasks a moment; confirm cancellation must abort the POST.
    await Promise.resolve();
    expect(findPostCall(fetchMock)).toBeUndefined();
  });

  it("invokes onAfterConfirm callback after a 2xx confirm response", async () => {
    mockFetchOk();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onAfterConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StageFeedbackPanel
        stage={2}
        emailId={EMAIL_ID}
        onAfterConfirm={onAfterConfirm}
      />,
    );

    await user.click(screen.getByTestId("stage-feedback-confirm"));

    await waitFor(() => expect(onAfterConfirm).toHaveBeenCalledTimes(1));
  });

  it("renders inline alert error on non-2xx response", async () => {
    mockFetchFail();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={1} emailId={EMAIL_ID} />);

    await user.type(screen.getByRole("textbox"), "x");
    await user.click(screen.getByTestId("stage-feedback-save"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/save|error|fail/i);
  });
});
