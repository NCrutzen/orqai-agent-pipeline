// Phase 04.1 — Plan 05 Task 2. ThreadModal component tests.
//
// Covers behaviors from PLAN.md Task 2:
//   - lazy fetch on open transition
//   - loading state
//   - per-message render + ★ under review highlight
//   - Translate dropdown calls translate() with scope: "thread"
//   - Esc closes via onOpenChange(false)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const getThreadMessagesMock = vi.fn();
vi.mock("../../actions/thread-actions", () => ({
  getThreadMessages: (...a: unknown[]) => getThreadMessagesMock(...a),
}));

const translateMock = vi.fn();
vi.mock("@/lib/translation/translate", () => ({
  translate: (...a: unknown[]) => translateMock(...a),
}));

import { ThreadModal } from "../thread-modal";

const CONV_ID = "11111111-1111-4111-8111-111111111111";
const CURRENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const ANOTHER_ID = "44444444-4444-4444-8444-444444444444";

const baseProps = {
  conversation_id: CONV_ID,
  current_email_id: CURRENT_ID,
  swarm_type: "debtor-email",
  active_stage_border_token: "var(--v7-stage-1-accent)",
};

const THREE_MESSAGES = [
  {
    id: OTHER_ID,
    sender_name: "Alice",
    sender_email: "a@x.com",
    received_at: "2026-01-01T00:00:00Z",
    subject: "s1",
    body_text: "first message",
    is_current: false,
  },
  {
    id: CURRENT_ID,
    sender_name: "Bob",
    sender_email: "b@x.com",
    received_at: "2026-01-02T00:00:00Z",
    subject: "s2",
    body_text: "second message",
    is_current: true,
  },
  {
    id: ANOTHER_ID,
    sender_name: "Carol",
    sender_email: "c@x.com",
    received_at: "2026-01-03T00:00:00Z",
    subject: "s3",
    body_text: "third message",
    is_current: false,
  },
];

beforeEach(() => {
  getThreadMessagesMock.mockReset();
  translateMock.mockReset();
  translateMock.mockResolvedValue({ ok: false, reason: "not_configured" });
  cleanup();
});

describe("ThreadModal — lazy fetch", () => {
  it("does NOT call getThreadMessages when mounted with open=false", () => {
    render(<ThreadModal open={false} onOpenChange={() => {}} {...baseProps} />);
    expect(getThreadMessagesMock).not.toHaveBeenCalled();
  });

  it("fetches exactly once on open: false → true transition", async () => {
    getThreadMessagesMock.mockResolvedValueOnce({ ok: true, messages: THREE_MESSAGES });
    const { rerender } = render(
      <ThreadModal open={false} onOpenChange={() => {}} {...baseProps} />,
    );
    expect(getThreadMessagesMock).not.toHaveBeenCalled();
    rerender(<ThreadModal open={true} onOpenChange={() => {}} {...baseProps} />);
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));
    expect(getThreadMessagesMock).toHaveBeenCalledWith(CONV_ID, CURRENT_ID, "debtor-email");
  });
});

describe("ThreadModal — render states", () => {
  it("shows loading indicator while fetch is pending", async () => {
    let resolveFn: ((v: unknown) => void) | null = null;
    getThreadMessagesMock.mockImplementation(
      () => new Promise((res) => { resolveFn = res; }),
    );
    render(<ThreadModal open={true} onOpenChange={() => {}} {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByTestId("thread-modal-loading")).toBeTruthy(),
    );
    // Resolve to avoid open Promise hanging into next test.
    await act(async () => {
      resolveFn?.({ ok: true, messages: [] });
    });
  });

  it("renders 3 messages with exactly 1 ★ under review tag on the current row", async () => {
    getThreadMessagesMock.mockResolvedValueOnce({ ok: true, messages: THREE_MESSAGES });
    render(<ThreadModal open={true} onOpenChange={() => {}} {...baseProps} />);
    await waitFor(() => {
      const tags = screen.queryAllByTestId("thread-modal-under-review-tag");
      expect(tags).toHaveLength(1);
    });
    // Total 3 article rows (current + 2 non-current).
    const current = screen.queryAllByTestId("thread-modal-current-message");
    const other = screen.queryAllByTestId("thread-modal-message");
    expect(current.length + other.length).toBe(3);
    expect(current).toHaveLength(1);
  });
});

describe("ThreadModal — Translate dropdown (thread scope)", () => {
  it("calls translate() with scope: 'thread' and renders 'translation not available' on ok:false", async () => {
    getThreadMessagesMock.mockResolvedValueOnce({ ok: true, messages: THREE_MESSAGES });
    render(<ThreadModal open={true} onOpenChange={() => {}} {...baseProps} />);
    await waitFor(() => screen.getByTestId("thread-modal-translate"));
    fireEvent.change(screen.getByTestId("thread-modal-translate"), {
      target: { value: "nl" },
    });
    await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(1));
    const call = translateMock.mock.calls[0][0];
    expect(call.scope).toBe("thread");
    expect(call.target_lang).toBe("nl");
    await waitFor(() =>
      expect(screen.getByTestId("thread-modal-translate-fallback")).toBeTruthy(),
    );
  });
});

describe("ThreadModal — Esc / onOpenChange", () => {
  it("invokes onOpenChange(false) on Esc keydown via Radix Dialog", async () => {
    getThreadMessagesMock.mockResolvedValueOnce({ ok: true, messages: [] });
    const onOpenChange = vi.fn();
    render(<ThreadModal open={true} onOpenChange={onOpenChange} {...baseProps} />);
    await waitFor(() => screen.getByTestId("thread-modal"));
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
