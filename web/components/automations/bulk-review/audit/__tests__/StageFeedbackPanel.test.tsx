/**
 * Phase 82.4 Plan 03 — StageFeedbackPanel RTL coverage.
 *
 * Covers:
 *  1. Render — textarea + Save + Confirm chip with data-testid.
 *  2. Save disabled-when-empty / enabled-after-typing.
 *  3. Save click → POST verdict:'unclear' + prose_notes.
 *  4. Confirm click (empty textarea) → POST verdict:'confirm' without prose_notes.
 *  5. 2xx confirm → onAfterConfirm() invoked.
 *  6. Non-2xx → inline error with role="alert".
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
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, id: "row-1" }), { status: 200 }),
  );
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

describe("StageFeedbackPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders textarea + Save + Confirm chip with data-testid scoped to stage", () => {
    render(<StageFeedbackPanel stage={2} emailId={EMAIL_ID} />);

    expect(screen.getByTestId("stage-feedback-panel-2")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
  });

  it("disables Save when textarea is empty and enables it after typing", async () => {
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={1} emailId={EMAIL_ID} />);

    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "looks wrong here");
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Save click POSTs verdict:'unclear' with the typed prose_notes", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={0} emailId={EMAIL_ID} />);

    await user.type(screen.getByRole("textbox"), "border case missed");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
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

  it("Confirm click with empty textarea POSTs verdict:'confirm' and omits prose_notes", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={3} emailId={EMAIL_ID} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.email_id).toBe(EMAIL_ID);
    expect(body.stage).toBe(3);
    expect(body.verdict).toBe("confirm");
    expect(body.prose_notes).toBeUndefined();
  });

  it("invokes onAfterConfirm callback after a 2xx confirm response", async () => {
    mockFetchOk();
    const onAfterConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StageFeedbackPanel
        stage={2}
        emailId={EMAIL_ID}
        onAfterConfirm={onAfterConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(onAfterConfirm).toHaveBeenCalledTimes(1));
  });

  it("renders inline alert error on non-2xx response", async () => {
    mockFetchFail();
    const user = userEvent.setup();
    render(<StageFeedbackPanel stage={1} emailId={EMAIL_ID} />);

    await user.type(screen.getByRole("textbox"), "x");
    await user.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/save|error|fail/i);
  });
});
