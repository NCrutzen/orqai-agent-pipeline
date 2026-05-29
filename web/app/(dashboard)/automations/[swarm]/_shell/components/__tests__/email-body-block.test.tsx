// Phase 04.1 — Plan 05 Task 3. EmailBodyBlock component tests.
//
// Locks the body block + toolbar contract extracted from detail-pane.tsx:
//   - existing data-testid="email-body-section" + "email-body-content"
//   - new toolbar: view-full-thread-button (conditional), translate-dropdown,
//     language-chip
//   - clicking View full thread opens the ThreadModal (mocked)
//   - translate dropdown calls translate({ scope: "message", target_lang });
//     on ok: false, toast.error fires and body text unchanged.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { translateMock, detectLanguageMock, toastMock } = vi.hoisted(() => ({
  translateMock: vi.fn(),
  detectLanguageMock: vi.fn(),
  toastMock: vi.fn(),
}));
vi.mock("@/lib/translation/translate", () => ({
  translate: (...a: unknown[]) => translateMock(...a),
  detectLanguage: (...a: unknown[]) => detectLanguageMock(...a),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(toastMock, { error: toastMock, success: toastMock }),
}));

// Stub the ThreadModal so we only assert mount via test-id.
vi.mock("../thread-modal", () => ({
  ThreadModal: (props: { open: boolean }) =>
    props.open ? (
      <div data-testid="thread-modal-stub">thread-modal</div>
    ) : null,
}));

import { EmailBodyBlock } from "../email-body-block";

const CONV_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL_ID = "22222222-2222-4222-8222-222222222222";

const baseProps = {
  email_id: EMAIL_ID,
  conversation_id: CONV_ID,
  message_count: 3,
  swarm_type: "debtor-email",
  body_text: "hello world",
  active_stage_border_token: "var(--v7-stage-1-accent)",
};

beforeEach(() => {
  translateMock.mockReset();
  translateMock.mockResolvedValue({ ok: false, reason: "not_configured" });
  detectLanguageMock.mockReset();
  detectLanguageMock.mockReturnValue(null);
  toastMock.mockReset();
  cleanup();
});

describe("EmailBodyBlock — preserves existing body block contract", () => {
  it("renders data-testid='email-body-section' with toggle; clicking toggle reveals 'email-body-content' with body text", () => {
    render(<EmailBodyBlock {...baseProps} />);
    expect(screen.getByTestId("email-body-section")).toBeTruthy();
    // Default closed (preserves the pre-extraction useState(false) contract
    // asserted by detail-pane.test.tsx).
    expect(screen.queryByTestId("email-body-content")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-body-button"));
    expect(screen.getByTestId("email-body-content").textContent).toContain("hello world");
  });
});

describe("EmailBodyBlock — toolbar", () => {
  it("renders 'View full thread (3 msgs)' when message_count=3 and conversation_id is set", () => {
    render(<EmailBodyBlock {...baseProps} message_count={3} />);
    const btn = screen.getByTestId("view-full-thread-button");
    expect(btn.textContent).toMatch(/3/);
  });

  it("does NOT render the view-thread button when message_count is null", () => {
    render(<EmailBodyBlock {...baseProps} message_count={null} />);
    expect(screen.queryByTestId("view-full-thread-button")).toBeNull();
  });

  it("language chip renders a clean 'language: not detected' (never 'unknown') when detectLanguage returns null", () => {
    detectLanguageMock.mockReturnValue(null);
    render(<EmailBodyBlock {...baseProps} />);
    const chip = screen.getByTestId("language-chip").textContent ?? "";
    expect(chip).toContain("not detected");
    expect(chip).not.toContain("unknown");
  });

  it("language chip renders 'detected: {lang}' when detectLanguage returns a language", () => {
    detectLanguageMock.mockReturnValue("nl");
    render(<EmailBodyBlock {...baseProps} />);
    expect(screen.getByTestId("language-chip").textContent).toContain(
      "detected: nl",
    );
  });

  it("renders the styled translate-dropdown select", () => {
    render(<EmailBodyBlock {...baseProps} />);
    const sel = screen.getByTestId("translate-dropdown");
    expect(sel.tagName).toBe("SELECT");
  });
});

describe("EmailBodyBlock — Translate dropdown (message scope)", () => {
  it("calls translate(scope: 'message') on lang select; fails closed via toast; body unchanged", async () => {
    render(<EmailBodyBlock {...baseProps} />);
    // Open the body first (default closed).
    fireEvent.click(screen.getByTestId("toggle-body-button"));
    fireEvent.change(screen.getByTestId("translate-dropdown"), {
      target: { value: "nl" },
    });
    await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(1));
    const call = translateMock.mock.calls[0][0];
    expect(call.scope).toBe("message");
    expect(call.target_lang).toBe("nl");
    expect(call.text).toBe("hello world");
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    // Body text unchanged.
    expect(screen.getByTestId("email-body-content").textContent).toContain("hello world");
  });
});

describe("EmailBodyBlock — ThreadModal mount", () => {
  it("clicking View full thread sets modalOpen → ThreadModal mounts", async () => {
    render(<EmailBodyBlock {...baseProps} />);
    fireEvent.click(screen.getByTestId("view-full-thread-button"));
    await waitFor(() =>
      expect(screen.getByTestId("thread-modal-stub")).toBeTruthy(),
    );
  });
});
