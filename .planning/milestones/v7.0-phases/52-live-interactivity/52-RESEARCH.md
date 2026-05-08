# Phase 52: Live Interactivity - Research

**Researched:** 2026-04-16
**Status:** Final

This document captures the technical patterns and library mechanics needed to plan Phase 52 implementation. Each section maps to a downstream plan.

---

## 1. Ring Buffer with `useSyncExternalStore` (Plan 52-01)

### Problem
The terminal must surface every new `agent_events` row as it arrives, hold at most 500, evict FIFO when over capacity, and never cause memory leaks across long monitoring sessions. Plain React state for a high-frequency append-stream causes:
- Unnecessary re-renders of unrelated components in the same context
- N copies of the array as React reconciles each push
- No way to share the buffer across remounts within the same swarm view

### Solution: module-scoped store + `useSyncExternalStore`

React 18+ ships `useSyncExternalStore` for exactly this — subscribe a component to an external mutable store with snapshot consistency.

**Pattern:**
```ts
// event-buffer.ts
type Listener = () => void;

class EventBufferStore {
  private buffer: AgentEvent[] = [];
  private idIndex = new Set<string>();
  private listeners = new Set<Listener>();
  private paused = false;
  private pendingWhilePaused: AgentEvent[] = [];
  readonly capacity: number;

  constructor(capacity = 500) { this.capacity = capacity; }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.buffer;
  getServerSnapshot = () => EMPTY_SNAPSHOT;  // SSR-safe

  pushMany(events: AgentEvent[]) {
    if (this.paused) {
      this.pendingWhilePaused.push(...events);
      return;
    }
    let mutated = false;
    for (const ev of events) {
      if (this.idIndex.has(ev.id)) continue;
      this.idIndex.add(ev.id);
      this.buffer = [...this.buffer, ev];
      mutated = true;
    }
    if (this.buffer.length > this.capacity) {
      const drop = this.buffer.length - this.capacity;
      const evicted = this.buffer.slice(0, drop);
      for (const e of evicted) this.idIndex.delete(e.id);
      this.buffer = this.buffer.slice(drop);
    }
    if (mutated) this.emit();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p && this.pendingWhilePaused.length > 0) {
      const flush = this.pendingWhilePaused;
      this.pendingWhilePaused = [];
      this.pushMany(flush);
    }
    this.emit();
  }

  clear() {
    this.buffer = [];
    this.idIndex.clear();
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

const stores = new Map<string, EventBufferStore>();
export function getStore(swarmId: string): EventBufferStore {
  let s = stores.get(swarmId);
  if (!s) { s = new EventBufferStore(); stores.set(swarmId, s); }
  return s;
}
```

**Hook:**
```ts
// use-event-buffer.ts
export function useEventBuffer(swarmId: string) {
  const store = getStore(swarmId);
  const events = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return {
    events,
    paused: store.paused,
    setPaused: (p: boolean) => store.setPaused(p),
    clear: () => store.clear(),
    pushMany: (e: AgentEvent[]) => store.pushMany(e),
  };
}
```

### Critical: snapshot identity
`getSnapshot` must return the SAME array reference if nothing changed. Our store achieves this by replacing `this.buffer` only when mutating. React's `Object.is` check on the snapshot prevents redundant re-renders.

### SSR safety
`getServerSnapshot` returns a static empty array; on the server we never have realtime events. After hydration, the store is populated by the realtime feed.

### Bridge to realtime feed
A small `useEffect` in `<TerminalStream>` watches the realtime bundle for newly-arrived event ids and calls `store.pushMany(diff)`. The diff is computed by `id` set comparison.

### References
- React docs: useSyncExternalStore — https://react.dev/reference/react/useSyncExternalStore
- Pattern from React redux internals — same store+subscribe API

---

## 2. dnd-kit Kanban Pattern (Plan 52-02)

### Library overview
`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` is the modern React DnD library. Smaller than react-dnd, no monkey-patching, accessibility-first (Keyboard sensor by default).

### Installation
```bash
cd web && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers
```
(npm/yarn equivalents work — agent-workforce uses npm based on Phase 49 verification.)

### Multi-column sortable layout

Each column is both a `<SortableContext>` (for items inside) AND a `useDroppable` zone (for cross-column drops). Each card is a `useSortable` item.

**Skeleton:**
```tsx
<DndContext
  sensors={useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )}
  collisionDetection={closestCorners}
  modifiers={[restrictToWindowEdges]}
  onDragStart={...}
  onDragOver={...}
  onDragEnd={handleDragEnd}
>
  <div className="kanban-grid">
    {STAGES.map(stage => (
      <KanbanColumn key={stage} stage={stage} jobs={byStage[stage]} />
    ))}
  </div>
  <DragOverlay>
    {activeJob && <KanbanJobCard job={activeJob} dragging />}
  </DragOverlay>
</DndContext>

function KanbanColumn({ stage, jobs }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${stage}` });
  return (
    <div ref={setNodeRef} className={cn("column", isOver && "drop-active")}>
      <SortableContext items={jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
        {jobs.map(j => <KanbanJobCard key={j.id} job={j} />)}
      </SortableContext>
    </div>
  );
}

function KanbanJobCard({ job, dragging }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: job.id,
    data: { stage: job.stage },
  });
  return (
    <article ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("job-card", dragging && "dragging")}
    >...</article>
  );
}
```

### Cross-column drop detection
On `onDragEnd`, inspect `event.over?.id`:
- If it's a `column:{stage}` id, the user dropped on an empty area → the new stage is that column.
- If it's a job id, the user dropped on a sibling job → inspect `event.over.data.current.stage`.

```ts
function handleDragEnd(event: DragEndEvent) {
  const activeId = event.active.id as string;
  const overId = event.over?.id as string | undefined;
  if (!overId) return;
  const job = jobs.find(j => j.id === activeId);
  if (!job) return;

  let newStage: SwarmJobStage;
  if (overId.startsWith("column:")) {
    newStage = overId.slice("column:".length) as SwarmJobStage;
  } else {
    const overJob = jobs.find(j => j.id === overId);
    if (!overJob) return;
    newStage = overJob.stage;
  }

  if (newStage === job.stage) return;  // no-op

  // Optimistic + server action
  applyOptimistic(job.id, newStage);
  startTransition(async () => {
    try {
      await moveJob(job.id, newStage);
    } catch {
      revertOptimistic(job.id);
      toast.error("Couldn't move job. Reverted.");
    }
  });
}
```

### Optimistic state pattern
Local `useState<Map<string, SwarmJobStage>>(new Map())` overlay:
```ts
const [overlay, setOverlay] = useState(new Map<string, SwarmJobStage>());
const displayedJobs = useMemo(
  () => jobs.map(j => overlay.has(j.id) ? { ...j, stage: overlay.get(j.id)! } : j),
  [jobs, overlay],
);
```
On success, leave the overlay entry in place — when Realtime UPDATE arrives, `jobs` itself already has `stage = newStage`, and the overlay value matches. We can clear the overlay on a `useEffect` watching `jobs` for the row landing with the same stage. Or simpler: clear immediately after the server action settles. Both work.

**Decision:** Clear overlay after server action settles (success or fail). Simpler logic; the brief Realtime lag is invisible since the optimistic state persists until clear.

### Accessibility
dnd-kit ships `KeyboardSensor` + `sortableKeyboardCoordinates`. Cards become focusable via dnd-kit's `attributes` (`tabIndex`, `role`, `aria-roledescription`). Keyboard interaction:
- Tab to a card
- Space → pick up
- Arrow keys → move
- Space → drop
- Esc → cancel

No additional ARIA work needed; dnd-kit narrates announcements via a screen-reader-only live region by default.

### Performance
- DragOverlay renders at portal root, avoiding layout thrash on parent
- `closestCorners` collision detection is the recommended algorithm for vertical lists
- `restrictToWindowEdges` prevents scroll jank when dragging near viewport edge

### References
- dnd-kit core: https://docs.dndkit.com/api-documentation/draggable
- Multi-column sortable example: https://docs.dndkit.com/presets/sortable/usesortable
- Accessibility: https://docs.dndkit.com/guides/accessibility

---

## 3. Server Actions + Optimistic UI Rollback (Plan 52-02)

### Server action skeleton
```ts
// web/lib/v7/kanban/actions.ts
"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  jobId: z.string().uuid(),
  newStage: z.enum(["backlog", "ready", "progress", "review", "done"]),
});

export async function moveJob(jobId: string, newStage: string): Promise<{ ok: true }> {
  const parsed = inputSchema.parse({ jobId, newStage });

  // 1. Authenticate caller
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 2. Authorize: load the job and check project_members
  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("swarm_jobs")
    .select("swarm_id, stage")
    .eq("id", parsed.jobId)
    .single();
  if (jobErr || !job) throw new Error("Job not found");

  const { count, error: memberErr } = await admin
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("project_id", job.swarm_id)
    .eq("user_id", user.id);
  if (memberErr) throw new Error("Authorization check failed");
  if ((count ?? 0) === 0) throw new Error("Forbidden");

  // 3. No-op short-circuit
  if (job.stage === parsed.newStage) return { ok: true };

  // 4. Update — Realtime publication broadcasts to all viewers
  const { error: updErr } = await admin
    .from("swarm_jobs")
    .update({ stage: parsed.newStage, updated_at: new Date().toISOString() })
    .eq("id", parsed.jobId);
  if (updErr) throw new Error(updErr.message);

  return { ok: true };
}
```

### Why service-role + manual auth check
- `swarm_jobs` has RLS (Phase 48). The simplest path is service-role + manual `project_members` check, mirroring Phase 49's per-swarm gate.
- Anon-key path would require RLS policy `USING (EXISTS (SELECT 1 FROM project_members...))`. Migration cost outweighs benefit for V7.0.

### Client invocation
Imported as a regular async function. Wrap in `useTransition` for pending state + non-blocking interaction:
```ts
const [pending, startTransition] = useTransition();
const handleDragEnd = (event) => {
  // ... compute newStage
  applyOptimistic(jobId, newStage);
  startTransition(async () => {
    try {
      await moveJob(jobId, newStage);
    } catch (err) {
      revertOptimistic(jobId);
      toast.error("Couldn't move job. Reverted.");
    } finally {
      // clear overlay either way
      setOverlay(prev => { const n = new Map(prev); n.delete(jobId); return n; });
    }
  });
};
```

### sonner toast
Already installed (v2.0.7 per package.json). Mount `<Toaster />` in the dashboard layout if not present; otherwise use the existing instance. Per-call `toast.error("...")` shows a 4s dismissible toast with the V7 theme.

### References
- Next.js 16 server actions: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
- React useTransition: https://react.dev/reference/react/useTransition
- sonner: https://sonner.emilkowal.ski/

---

## 4. URL State for Smart Filters (Plan 52-03)

### Pattern
Next.js 16 App Router exposes `useSearchParams` + `useRouter` for client components. Filter state is a single `?filter=<key>` param.

```ts
// web/components/v7/sidebar-smart-filters.tsx
"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const FILTERS = [
  { key: "blocked", label: "Only blocked" },
  { key: "review", label: "Needs review" },
  { key: "sla", label: "High SLA risk" },
] as const;

export function SidebarSmartFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("filter");

  if (!pathname?.startsWith("/swarm/")) return null;

  const setFilter = (key: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (key === null) next.delete("filter");
    else next.set("filter", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
        Smart filters
      </span>
      <div className="flex flex-col gap-2">
        {FILTERS.map(f => {
          const isActive = active === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(isActive ? null : f.key)}
              data-active={isActive ? "" : undefined}
              className={...}
            >
              <span>{f.label}</span>
              <span aria-hidden>{isActive ? "✓" : "→"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### Consuming the filter in Kanban
```ts
// kanban-board.tsx
const params = useSearchParams();
const filter = params.get("filter");
const predicate = useMemo(() => getFilterPredicate(filter), [filter]);
const filteredJobs = useMemo(() => displayedJobs.filter(predicate), [displayedJobs, predicate]);
```

### Predicate definitions
```ts
// web/lib/v7/kanban/filters.ts
export function getFilterPredicate(filter: string | null): (j: SwarmJob) => boolean {
  if (filter === "blocked") {
    return (j) => (j.priority === "urgent" || j.priority === "high") && j.stage === "review";
  }
  if (filter === "review") {
    return (j) => j.stage === "review";
  }
  if (filter === "sla") {
    return (j) => {
      const tags = Array.isArray(j.tags) ? (j.tags as string[]) : [];
      return tags.some(t => ["sla", "blocked", "risk"].includes(t.toLowerCase()));
    };
  }
  return () => true;
}
```

### Why URL state and not React state
- Shareable: paste a swarm URL with `?filter=blocked` and the recipient sees the same view
- Survives page refresh
- Browser back/forward navigation works as expected
- No state hoisting needed across sidebar + Kanban; URL is the single source

### Caveats
- `router.replace` (not `router.push`) — filter toggles shouldn't pollute history
- `{ scroll: false }` — filter changes shouldn't scroll the page
- Wrapping in `<Suspense>` not required since `useSearchParams` is fine in client components below the route boundary

### References
- Next.js navigation hooks: https://nextjs.org/docs/app/api-reference/functions/use-search-params

---

## 5. Auto-Scroll + Pause Pattern (Plan 52-01)

### Sticky-bottom scroll
Standard pattern: track distance from bottom, only auto-scroll if user is "near" the bottom.

```ts
const scrollerRef = useRef<HTMLDivElement>(null);
const [followBottom, setFollowBottom] = useState(true);
const [missedCount, setMissedCount] = useState(0);

const handleScroll = () => {
  const el = scrollerRef.current;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  const atBottom = distance < 32;
  setFollowBottom(atBottom);
  if (atBottom) setMissedCount(0);
};

useEffect(() => {
  if (!followBottom) {
    setMissedCount(c => c + 1);  // increment when new event arrives but not auto-scrolling
    return;
  }
  const el = scrollerRef.current;
  if (el) el.scrollTop = el.scrollHeight;
  setMissedCount(0);
}, [events.length, followBottom]);
```

### "N new events" pill
Sticky-positioned at the bottom-right of the scroller. Click jumps to bottom + clears missed counter.

```tsx
{missedCount > 0 && !followBottom && (
  <button
    type="button"
    onClick={() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      setFollowBottom(true);
      setMissedCount(0);
    }}
    className="sticky bottom-2 self-end px-3 py-1 rounded-full bg-[var(--v7-teal-soft)] text-[var(--v7-teal)] border border-[var(--v7-teal)] text-[12px]"
  >
    {missedCount} new events ↓
  </button>
)}
```

---

## 6. Realtime UPDATE Reconciliation (Plan 52-02)

The `SwarmRealtimeProvider` already subscribes to `postgres_changes` for `swarm_jobs`. After the server action commits the UPDATE, Postgres triggers a Realtime broadcast → `applyMutation` updates `bundle.jobs` → `useRealtimeTable("jobs")` re-renders the Kanban with the new stage.

**Race condition consideration:**
- Optimistic overlay applies new stage immediately
- Server action runs (~200ms)
- Realtime UPDATE arrives shortly after success (same tick or next)
- Overlay clears in `finally` block of the transition
- If Realtime UPDATE lands BEFORE the overlay clears: both agree, no flicker
- If overlay clears BEFORE Realtime UPDATE: `jobs` momentarily reverts to old stage → 1-frame flicker

**Mitigation:** Clear the overlay only after we observe the realtime row land with the new stage. Use a `useEffect` on `[jobs, overlay]` that prunes overlay entries whose realtime row already matches:
```ts
useEffect(() => {
  if (overlay.size === 0) return;
  const next = new Map(overlay);
  let changed = false;
  for (const [jobId, stage] of overlay) {
    const row = jobs.find(j => j.id === jobId);
    if (row && row.stage === stage) {
      next.delete(jobId);
      changed = true;
    }
  }
  if (changed) setOverlay(next);
}, [jobs, overlay]);
```
This is robust against any Realtime ordering and against server-action delay.

---

## 7. Fixture Application via Management API (Plan 52-02)

The Management API token `sbp_5cd4ece3a65960acab9ade58dcd2c0ea236a1ece` is verified working at session start. SQL is applied via:
```bash
curl -X POST 'https://api.supabase.com/v1/projects/mvqjhlxfvtqqubqgdvhz/database/query' \
  -H 'Authorization: Bearer sbp_5cd4ece3a65960acab9ade58dcd2c0ea236a1ece' \
  -H 'Content-Type: application/json' \
  --data '{"query":"<SQL HERE>"}'
```

The fixture file's SQL is read and POSTed. Verification SELECT after apply confirms 10 rows.

---

## 8. Edge Cases Catalog

| Edge case | Handling |
|---|---|
| Realtime channel disconnects mid-drag | Optimistic state persists; on reconnect, snapshot reseeds; if our drop committed, the row reflects the new stage |
| Two users drag the same job concurrently | Last-write-wins at DB; both viewers settle on the final stage via Realtime |
| User drops a job on its current column | onDragEnd detects `newStage === oldStage` and short-circuits |
| Server action throws | useTransition catches, overlay reverts, sonner toast shown |
| Ring buffer overflow during heavy spike | FIFO eviction preserves the most recent 500; explicit "Clear" button always available |
| User navigates away during drag | dnd-kit cleans up via DndContext unmount; optimistic state lost (acceptable -- next mount re-snapshots from realtime) |
| Filter applied + user moves a job out of the predicate's match | Job disappears from the visible board (still in DB and other viewers see it); on filter clear, full board returns |
| User pauses terminal then closes browser | Pause is per-session; new tab starts unpaused |

---

*Phase: 52-live-interactivity*
*Research completed: 2026-04-16*
