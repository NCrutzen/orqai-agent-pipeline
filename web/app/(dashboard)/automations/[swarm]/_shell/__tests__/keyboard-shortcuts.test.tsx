// Phase 82 Plan 01 Task 1 — RTL tests for _shell/keyboard-shortcuts.tsx
//
// Covers (per plan behavior list):
//   T3: ↑/↓ moves selection; j/k aliases work.
//   T4: keydown SKIPPED when activeElement is INPUT/TEXTAREA/[contenteditable].
//   T5: ⌘⏎ dispatches override-submit; bare ⏎ dispatches approve (order matters).
//   T6: key "0" dispatches `bulk-review:stage-0-focus`.
//   T7 (types): Row type compiles (covered by import below — purely structural).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

import {
  KeyboardShortcuts,
  KEYBOARD_EVENTS,
  type ShortcutAction,
} from "../keyboard-shortcuts";
import { SelectionProvider, useSelection } from "../selection-context";
import type { Row } from "../_lib/types";

// T7 — compile-time check that Row type exports correctly.
const _typeCheck: Row = {
  id: "x",
  from_name: null,
  from_email: null,
  subject: null,
  timestamp: "2026-05-11T00:00:00Z",
  mailbox_id: null,
  stage_badge: { label: "test", variant: "noise" },
};
void _typeCheck;

function Probe({ onState }: { onState: (s: { selectedId: string | null }) => void }) {
  const { selectedId } = useSelection();
  onState({ selectedId });
  return null;
}

function Harness({
  rowIds,
  onState,
  enabledShortcuts,
  initialSelectedId,
}: {
  rowIds: string[];
  onState: (s: { selectedId: string | null }) => void;
  enabledShortcuts?: Set<ShortcutAction>;
  initialSelectedId?: string;
}) {
  return (
    <SelectionProvider rowIds={rowIds} initialSelectedId={initialSelectedId ?? rowIds[0] ?? null}>
      <KeyboardShortcuts rowIds={rowIds} enabledShortcuts={enabledShortcuts} />
      <Probe onState={onState} />
    </SelectionProvider>
  );
}

let states: Array<{ selectedId: string | null }>;
let onState: (s: { selectedId: string | null }) => void;

beforeEach(() => {
  states = [];
  onState = (s) => {
    states.push(s);
  };
});

afterEach(() => {
  cleanup();
});

describe("_shell/keyboard-shortcuts (Phase 82 Plan 01)", () => {
  it("T3a: ArrowDown advances selection to next row", () => {
    const rowIds = ["a", "b", "c"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
    expect(states.at(-1)?.selectedId).toBe("b");
  });

  it("T3b: ArrowUp moves selection to previous row", () => {
    const rowIds = ["a", "b", "c"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="c" />);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowUp" });
    });
    expect(states.at(-1)?.selectedId).toBe("b");
  });

  it("T3c: j/k aliases advance/retreat selection", () => {
    const rowIds = ["a", "b", "c"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);
    act(() => {
      fireEvent.keyDown(window, { key: "j" });
    });
    expect(states.at(-1)?.selectedId).toBe("b");
    act(() => {
      fireEvent.keyDown(window, { key: "k" });
    });
    expect(states.at(-1)?.selectedId).toBe("a");
  });

  it("T4: keydown SKIPPED when document.activeElement is an INPUT", () => {
    const rowIds = ["a", "b", "c"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);

    // Mount a focused input element.
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
    // Selection should not have moved.
    expect(states.at(-1)?.selectedId).toBe("a");

    document.body.removeChild(input);
  });

  it("T4b: keydown SKIPPED when activeElement is contenteditable", () => {
    const rowIds = ["a", "b", "c"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);

    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
    expect(states.at(-1)?.selectedId).toBe("a");

    document.body.removeChild(div);
  });

  it("T5: ⌘⏎ dispatches override-submit (not approve)", () => {
    const rowIds = ["a", "b"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);

    const submitSpy = vi.fn();
    const approveSpy = vi.fn();
    window.addEventListener(KEYBOARD_EVENTS.overrideSubmit, submitSpy);
    window.addEventListener(KEYBOARD_EVENTS.approve, approveSpy);

    act(() => {
      fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(approveSpy).not.toHaveBeenCalled();

    window.removeEventListener(KEYBOARD_EVENTS.overrideSubmit, submitSpy);
    window.removeEventListener(KEYBOARD_EVENTS.approve, approveSpy);
  });

  it("T5b: bare ⏎ dispatches approve", () => {
    const rowIds = ["a", "b"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);

    const submitSpy = vi.fn();
    const approveSpy = vi.fn();
    window.addEventListener(KEYBOARD_EVENTS.overrideSubmit, submitSpy);
    window.addEventListener(KEYBOARD_EVENTS.approve, approveSpy);

    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).not.toHaveBeenCalled();

    window.removeEventListener(KEYBOARD_EVENTS.overrideSubmit, submitSpy);
    window.removeEventListener(KEYBOARD_EVENTS.approve, approveSpy);
  });

  it("T6: key '0' dispatches `bulk-review:stage-0-focus`", () => {
    const rowIds = ["a"];
    render(<Harness rowIds={rowIds} onState={onState} initialSelectedId="a" />);

    const stage0Spy = vi.fn();
    window.addEventListener(KEYBOARD_EVENTS.stage0Focus, stage0Spy);

    act(() => {
      fireEvent.keyDown(window, { key: "0" });
    });

    expect(stage0Spy).toHaveBeenCalledTimes(1);
    expect(KEYBOARD_EVENTS.stage0Focus).toBe("bulk-review:stage-0-focus");

    window.removeEventListener(KEYBOARD_EVENTS.stage0Focus, stage0Spy);
  });

  it("enabledShortcuts restricts action dispatch", () => {
    const rowIds = ["a"];
    render(
      <Harness
        rowIds={rowIds}
        onState={onState}
        initialSelectedId="a"
        enabledShortcuts={new Set<ShortcutAction>(["approve"])}
      />,
    );

    const approveSpy = vi.fn();
    const skipSpy = vi.fn();
    window.addEventListener(KEYBOARD_EVENTS.approve, approveSpy);
    window.addEventListener(KEYBOARD_EVENTS.skip, skipSpy);

    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
      fireEvent.keyDown(window, { key: "n" });
    });

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(skipSpy).not.toHaveBeenCalled();

    window.removeEventListener(KEYBOARD_EVENTS.approve, approveSpy);
    window.removeEventListener(KEYBOARD_EVENTS.skip, skipSpy);
  });
});
