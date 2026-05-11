// Phase 82 Plan 01 Task 3 — RTL tests for _shell/mailbox-filter.tsx
//
// Covers:
//   T1: trigger label = "All mailboxes" when selected=[].
//   T2: trigger label = "Mailbox: Smeba" when selected=[4] and mailbox label exists.
//   T3: trigger label = "2 mailboxes" when selected=[4, 5].
//   T4: clicking a mailbox option calls router.push with ?mailbox=<id> repeated params.
//   T5: clicking "Clear" writes URL without any mailbox param.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/automations/debtor-email/stage-3",
  useSearchParams: () => new URLSearchParams(""),
}));

import { MailboxFilter } from "../mailbox-filter";

// Radix Popover/DropdownMenu uses pointer-event semantics that JSDOM doesn't
// emit from fireEvent.click; userEvent simulates the full pointer sequence.
// Also: pointerCapture / hasPointerCapture polyfills for JSDOM.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).scrollIntoView = () => {};
  }
}

const MAILBOXES = [
  { id: 1, label: "Sicli Noord" },
  { id: 4, label: "Smeba" },
  { id: 5, label: "Smeba Fire" },
];

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("_shell/mailbox-filter (Phase 82 Plan 01)", () => {
  it('T1: trigger label = "All mailboxes" when selected=[]', () => {
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[]} />);
    expect(screen.getByLabelText("Filter by mailbox").textContent).toContain(
      "All mailboxes",
    );
  });

  it('T2: trigger label = "Mailbox: Smeba" when selected=[4]', () => {
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[4]} />);
    expect(screen.getByLabelText("Filter by mailbox").textContent).toContain(
      "Mailbox: Smeba",
    );
  });

  it('T3: trigger label = "2 mailboxes" when selected=[4, 5]', () => {
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[4, 5]} />);
    expect(screen.getByLabelText("Filter by mailbox").textContent).toContain(
      "2 mailboxes",
    );
  });

  it("T4: opening the menu then clicking an option pushes URL with ?mailbox=<id>", async () => {
    const user = userEvent.setup();
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[]} />);

    await user.click(screen.getByLabelText("Filter by mailbox"));
    const opt = await screen.findByTestId("mailbox-option-4");
    await user.click(opt);

    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).toContain("mailbox=4");
  });

  it("T4b: with selected=[4], clicking option id=5 pushes URL with both params", async () => {
    const user = userEvent.setup();
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[4]} />);

    await user.click(screen.getByLabelText("Filter by mailbox"));
    const opt5 = await screen.findByTestId("mailbox-option-5");
    await user.click(opt5);

    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).toContain("mailbox=4");
    expect(url).toContain("mailbox=5");
    // Repeated-param shape: two `mailbox=` occurrences.
    const matches = url.match(/mailbox=/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("T5: clicking Clear pushes URL without any mailbox param", async () => {
    const user = userEvent.setup();
    render(<MailboxFilter mailboxes={MAILBOXES} selected={[4, 5]} />);

    await user.click(screen.getByLabelText("Filter by mailbox"));
    const clear = await screen.findByTestId("mailbox-clear");
    await user.click(clear);

    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).not.toContain("mailbox=");
  });
});
