/**
 * Phase 82.5 Plan 03 Task 3 — W4 keyboard-shortcut coverage on focused textarea.
 *
 * The panel does NOT register any document-level keydown listeners. Instead,
 * the textarea itself owns:
 *   - ⌘+s / Ctrl+s → preventDefault + POST verdict='unclear'
 *   - Esc          → blur + onAfterConfirm (draft preserved by parent — value is controlled)
 *   - n / Enter    → stopPropagation so the document-level shortcut handler
 *                    (separate file) does not consume the keypress while the
 *                    operator is typing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { StageFeedbackPanel } from "../StageFeedbackPanel";

const FEEDBACK_ENDPOINT = "/api/automations/debtor-email/feedback";

describe("StageFeedbackPanel — keyboard shortcuts on focused textarea (W4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      // GET refresh returns empty read-back; POST returns 200 ok.
      if (!init?.method || init.method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ own_latest: null, others: [] }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  function renderPanel(
    overrides: Partial<React.ComponentProps<typeof StageFeedbackPanel>> = {},
  ) {
    const onValueChange = vi.fn();
    const onAfterConfirm = vi.fn();
    render(
      <StageFeedbackPanel
        stage={1}
        emailId="00000000-0000-0000-0000-000000000001"
        value=""
        onValueChange={onValueChange}
        onAfterConfirm={onAfterConfirm}
        initialReadBack={null}
        {...overrides}
      />,
    );
    return { onValueChange, onAfterConfirm };
  }

  it("⌘+s on focused textarea triggers Save (POST verdict=unclear)", async () => {
    renderPanel();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "s", metaKey: true });

    // Allow microtasks to settle (postFeedback is async).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const saveCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" &&
        url === FEEDBACK_ENDPOINT &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String(saveCall![1]!.body));
    expect(body.verdict).toBe("unclear");
    expect(body.email_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.stage).toBe(1);
  });

  it("Esc on focused textarea blurs and fires onAfterConfirm (draft preserved by parent)", () => {
    const { onValueChange, onAfterConfirm } = renderPanel({
      value: "draft-in-progress",
    });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onAfterConfirm).toHaveBeenCalledTimes(1);
    // Panel must NOT clear the draft — value is parent-owned.
    expect(onValueChange).not.toHaveBeenCalledWith("");
  });

  it("`n` on focused textarea does NOT bubble to document-level shortcut handler", () => {
    const bubbleSpy = vi.fn();
    document.addEventListener("keydown", bubbleSpy, false);

    renderPanel();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "n" });

    expect(bubbleSpy).not.toHaveBeenCalled();
    document.removeEventListener("keydown", bubbleSpy, false);
  });

  it("Enter on focused textarea does NOT bubble to document-level shortcut handler", () => {
    const bubbleSpy = vi.fn();
    document.addEventListener("keydown", bubbleSpy, false);

    renderPanel();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(bubbleSpy).not.toHaveBeenCalled();
    document.removeEventListener("keydown", bubbleSpy, false);
  });
});
