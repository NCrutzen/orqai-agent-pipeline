// Phase 61-02 + 61-hotfix (D-KEYBOARD-SHORTCUTS). Page-scoped global keyboard
// handler with input-focus guard. Navigation keys update SelectionContext
// (which patches the URL via history.replaceState — no router.push); action
// keys dispatch CustomEvents on window so detail-pane wires up the actual
// server-action calls without coupling to this file.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  KeyboardShortcuts,
  KEYBOARD_EVENTS,
} from "@/app/(dashboard)/automations/[swarm]/review/keyboard-shortcuts";
import { SelectionProvider } from "@/app/(dashboard)/automations/[swarm]/review/selection-context";

// ---- Helpers -------------------------------------------------------------

function dispatchKey(key: string, opts: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, ...opts });
  window.dispatchEvent(ev);
  return ev;
}

function renderShortcuts(rowIds: string[], selectedId: string | null) {
  return render(
    <SelectionProvider initialSelectedId={selectedId} rowIds={rowIds}>
      <KeyboardShortcuts rowIds={rowIds} />
    </SelectionProvider>,
  );
}

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  replaceStateSpy = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  replaceStateSpy.mockRestore();
});

// ---- Navigation tests ----------------------------------------------------

describe("KeyboardShortcuts: row navigation", () => {
  it("ArrowDown when selected=row-2 of [row-1,row-2,row-3] advances to row-3", () => {
    renderShortcuts(["row-1", "row-2", "row-3"], "row-2");
    dispatchKey("ArrowDown");
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(String(replaceStateSpy.mock.calls[0][2] ?? "")).toMatch(/selected=row-3/);
  });

  it("ArrowUp when selected=row-1 (top) is a no-op (clamps)", () => {
    renderShortcuts(["row-1", "row-2", "row-3"], "row-1");
    dispatchKey("ArrowUp");
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it("'j' mirrors ArrowDown", () => {
    renderShortcuts(["row-1", "row-2", "row-3"], "row-1");
    dispatchKey("j");
    expect(String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "")).toMatch(/selected=row-2/);
  });

  it("'k' mirrors ArrowUp", () => {
    renderShortcuts(["row-1", "row-2", "row-3"], "row-2");
    dispatchKey("k");
    expect(String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "")).toMatch(/selected=row-1/);
  });
});

// ---- Action-event tests --------------------------------------------------

describe("KeyboardShortcuts: action CustomEvents", () => {
  function spyDispatch() {
    return vi.spyOn(window, "dispatchEvent");
  }

  it("Enter dispatches bulk-review:approve", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    dispatchKey("Enter");
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.approve)).toBe(true);
    spy.mockRestore();
  });

  it("Space dispatches bulk-review:reject and preventDefault is called", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const prevented = vi.spyOn(ev, "preventDefault");
    window.dispatchEvent(ev);
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.reject)).toBe(true);
    expect(prevented).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("'n' dispatches bulk-review:skip", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    dispatchKey("n");
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.skip)).toBe(true);
    spy.mockRestore();
  });

  it("'e' dispatches bulk-review:toggle-body", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    dispatchKey("e");
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.toggleBody)).toBe(true);
    spy.mockRestore();
  });

  it("'r' dispatches bulk-review:focus-override", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    dispatchKey("r");
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.focusOverride)).toBe(true);
    spy.mockRestore();
  });

  it("'/' dispatches bulk-review:focus-notes and preventDefault is called", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    const ev = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    const prevented = vi.spyOn(ev, "preventDefault");
    window.dispatchEvent(ev);
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.focusNotes)).toBe(true);
    expect(prevented).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("'?' dispatches bulk-review:toggle-cheatsheet", () => {
    renderShortcuts(["a"], "a");
    const spy = spyDispatch();
    dispatchKey("?");
    const events = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent);
    expect(events.some((e) => e.type === KEYBOARD_EVENTS.toggleCheatsheet)).toBe(true);
    spy.mockRestore();
  });
});

// ---- Input-focus guard tests ---------------------------------------------

describe("KeyboardShortcuts: no-op while typing", () => {
  it("no-op when activeElement is an <input>", () => {
    renderShortcuts(["row-1", "row-2"], "row-1");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const spy = vi.spyOn(window, "dispatchEvent");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(replaceStateSpy).not.toHaveBeenCalled();
    const customDispatched = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent && e.type.startsWith("bulk-review:"));
    expect(customDispatched).toHaveLength(0);

    spy.mockRestore();
    input.remove();
  });

  it("no-op when activeElement is a <textarea>", () => {
    renderShortcuts(["row-1", "row-2"], "row-1");
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();

    const spy = vi.spyOn(window, "dispatchEvent");
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(replaceStateSpy).not.toHaveBeenCalled();
    const customDispatched = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent && e.type.startsWith("bulk-review:"));
    expect(customDispatched).toHaveLength(0);

    spy.mockRestore();
    ta.remove();
  });

  it("no-op when activeElement has [contenteditable='true']", () => {
    renderShortcuts(["row-1", "row-2"], "row-1");
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    const spy = vi.spyOn(window, "dispatchEvent");
    div.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    div.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));

    expect(replaceStateSpy).not.toHaveBeenCalled();
    const customDispatched = spy.mock.calls
      .map((c) => c[0])
      .filter((e): e is CustomEvent => e instanceof CustomEvent && e.type.startsWith("bulk-review:"));
    expect(customDispatched).toHaveLength(0);

    spy.mockRestore();
    div.remove();
  });
});
