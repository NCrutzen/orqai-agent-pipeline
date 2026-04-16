/**
 * Per-swarm event ring buffer (Phase 52, OBS-04).
 *
 * In-memory only -- the database is the source of truth. The buffer
 * exists so the terminal can render a bounded scrolling stream without
 * unbounded memory growth on always-on monitoring screens.
 *
 * Capacity defaults to 500 (REQUIREMENTS.md OBS-04). When the buffer
 * exceeds capacity, oldest entries are evicted FIFO. New events are
 * deduplicated by `id` so duplicate Realtime INSERT signals are no-ops.
 *
 * The store implements the `useSyncExternalStore` contract:
 *   - `subscribe(listener)` returns an unsubscribe function
 *   - `getSnapshot()` returns a stable reference (only changes on mutate)
 *   - `getServerSnapshot()` returns a frozen empty array for SSR
 *
 * Stores are keyed by `swarmId` so that switching swarms does not
 * pollute the new swarm's terminal with stale events.
 */

import type { AgentEvent } from "@/lib/v7/types";

type Listener = () => void;

const EMPTY_SNAPSHOT: AgentEvent[] = Object.freeze([]) as AgentEvent[];

export class EventBufferStore {
  readonly capacity: number;
  private buffer: AgentEvent[] = [];
  private idIndex = new Set<string>();
  private listeners = new Set<Listener>();
  private _paused = false;
  private pendingWhilePaused: AgentEvent[] = [];

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  get paused(): boolean {
    return this._paused;
  }

  // --- useSyncExternalStore contract -----------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AgentEvent[] => this.buffer;

  getServerSnapshot = (): AgentEvent[] => EMPTY_SNAPSHOT;

  // --- Mutators --------------------------------------------------------

  pushMany(events: AgentEvent[]): void {
    if (events.length === 0) return;

    if (this._paused) {
      // Side-buffer while paused; flush on un-pause.
      this.pendingWhilePaused.push(...events);
      return;
    }

    let mutated = false;
    let next = this.buffer;
    for (const ev of events) {
      if (this.idIndex.has(ev.id)) continue;
      this.idIndex.add(ev.id);
      // Avoid copying on every push; we'll commit a single new array if mutated.
      if (next === this.buffer) next = [...this.buffer];
      next.push(ev);
      mutated = true;
    }

    if (next.length > this.capacity) {
      const drop = next.length - this.capacity;
      const evicted = next.slice(0, drop);
      for (const e of evicted) this.idIndex.delete(e.id);
      next = next.slice(drop);
      mutated = true;
    }

    if (mutated) {
      this.buffer = next;
      this.emit();
    }
  }

  setPaused(value: boolean): void {
    if (this._paused === value) return;
    this._paused = value;
    if (!value && this.pendingWhilePaused.length > 0) {
      const flush = this.pendingWhilePaused;
      this.pendingWhilePaused = [];
      this.pushMany(flush);
    }
    this.emit();
  }

  clear(): void {
    if (this.buffer.length === 0 && this.pendingWhilePaused.length === 0) {
      return;
    }
    this.buffer = [];
    this.idIndex.clear();
    this.pendingWhilePaused = [];
    this.emit();
  }

  // --- Internals -------------------------------------------------------

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

// Module-scoped per-swarm registry. Stores survive component remounts
// inside the same swarm view so that Pause + scroll position survive
// React tree thrash.
const stores = new Map<string, EventBufferStore>();

export function getStore(swarmId: string, capacity = 500): EventBufferStore {
  let s = stores.get(swarmId);
  if (!s) {
    s = new EventBufferStore(capacity);
    stores.set(swarmId, s);
  }
  return s;
}

// Test-only helper -- lets tests reset between cases.
export function __resetEventBuffersForTests(): void {
  stores.clear();
}
