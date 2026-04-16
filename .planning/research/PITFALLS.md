# Domain Pitfalls

**Domain:** V7.0 Agent OS -- Cinematic real-time dashboard with design system migration, O365 SSO, animated visualizations, kanban board, and terminal event stream added to existing Next.js + Supabase app
**Researched:** 2026-04-15
**Confidence:** HIGH (verified against current codebase, Supabase official docs, community reports, and web research)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken production, or multi-day debugging sessions.

---

### Pitfall 1: Azure AD SSO Creates Duplicate Accounts Instead of Linking

**What goes wrong:** CEO/management logs in with Microsoft, gets a brand new empty account. Their existing email/password account (with all pipeline runs, projects, settings) is orphaned. Two `auth.users` rows, same email, no link.

**Why it happens:** Supabase Auth treats SSO (SAML) identities differently from OAuth identities. SAML SSO users are explicitly excluded from automatic identity linking -- this is a deliberate security decision. Even with matching verified emails, a separate account is created. The current codebase already has email/password auth with working middleware, `auth/callback`, and `project_members`-based access control.

**Consequences:** Executive sees empty dashboard. Existing data orphaned. Manual database surgery needed to merge accounts. Trust destroyed on first impression.

**Prevention:**
1. Use Azure AD as an **OAuth provider** (not SAML SSO) via `supabase.auth.signInWithOAuth({ provider: 'azure' })`. OAuth identities DO participate in automatic linking when emails match and are verified.
2. Before enabling Azure OAuth, ensure ALL existing email/password accounts have **confirmed/verified emails**. Unverified emails block automatic linking (security measure against pre-account takeover).
3. Configure Azure as **single-tenant** (`https://login.microsoftonline.com/<tenant-id>`) to block personal `@outlook.com` accounts.
4. Test the full flow: create email/password account, then sign in with Azure using same email. Verify single `auth.users` row with two identities in `auth.identities`.
5. Build an admin "account merge" escape hatch for edge cases where linking fails.
6. Add post-login check: if user exists in `auth.users` but has zero `project_members` rows, redirect to "access pending" page instead of empty dashboard.

**Detection:** After enabling SSO, query `auth.users` for duplicate emails. Monitor login support requests.

**Confidence:** HIGH -- verified against [Supabase Identity Linking docs](https://supabase.com/docs/guides/auth/auth-identity-linking) and [GitHub Discussion #42144](https://github.com/orgs/supabase/discussions/42144).

**Phase:** Must be the FIRST thing validated in the SSO phase. Get this wrong and you have a data migration crisis.

---

### Pitfall 2: Design System Migration Breaks All Existing Pages

**What goes wrong:** Changing CSS custom properties in `globals.css` and fonts in `layout.tsx` immediately breaks every existing page -- pipeline runner, project detail, run detail, executive dashboard (V6.0), settings. The blast radius is 100% of the app while the redesign is 10% complete.

**Why it happens:** The current `globals.css` defines `:root` and `.dark` blocks with oklch color tokens (`--background`, `--primary`, `--card`, etc.) that every shadcn component consumes. The current `layout.tsx` loads `Geist` + `Geist_Mono` from `next/font/google`. Changing ANY of these affects EVERY component in the app. Glassmorphism `backdrop-filter` values will look wrong on components not designed for it. A font-size change can break components relying on text truncation.

**Consequences:** Users report broken pages faster than the team can fix them. Agent graph layout breaks from spacing changes. Status badges become unreadable from color palette changes.

**Prevention:**
1. **Parallel token strategy:** Keep ALL existing shadcn tokens (`--primary`, `--background`, etc.) working unchanged. Add NEW tokens for V7 design system (`--v7-surface-glass`, `--v7-text-primary`, `--v7-accent`, etc.). New components use V7 tokens; old components keep working on existing tokens.
2. **Font coexistence:** Load Satoshi/Cabinet Grotesk via `next/font/local` ALONGSIDE Geist. Apply new fonts only to V7 layout sections via CSS class scoping (e.g., `.v7-layout { font-family: var(--font-satoshi) }`), not globally in `layout.tsx`.
3. **Migrate page by page:** Each existing page gets migrated to V7 design as a deliberate task with its own PR, not as a side effect of changing globals.
4. **Visual regression testing:** Screenshot every existing page at 3 viewports before ANY `globals.css` change. Compare after every change. Zero unexpected changes on non-target pages.
5. **Parallel route group option:** Build V7 pages under `(dashboard-v7)` route group during development. Swap when validated.

**Detection:** Build the app and visually inspect every route after any CSS change.

**Confidence:** HIGH -- verified against current codebase (`web/app/globals.css` with oklch tokens, `web/app/layout.tsx` with Geist fonts, `web/app/(dashboard)/layout.tsx`).

**Phase:** Design system foundation phase MUST establish the parallel token strategy before any visual work begins. This is the prerequisite for everything else.

---

### Pitfall 3: Supabase Realtime Memory Leaks from Unbounded Event Accumulation

**What goes wrong:** The terminal event stream and live delegation graph accumulate events in component state without bounds. After hours of dashboard use (the "always-on monitoring screen" use case), the browser tab consumes gigabytes of memory and crashes.

**Why it happens:** Each Supabase Realtime broadcast event gets pushed to a state array (`setEvents(prev => [...prev, newEvent])`). The terminal stream can receive hundreds of events per pipeline run. The existing `useBroadcast` hook in `web/lib/supabase/broadcast-client.ts` properly cleans up channel subscriptions on unmount, but does NOT address in-memory event accumulation while the component is mounted.

**Consequences:** Browser tab crashes after extended use. Dashboard becomes sluggish. CEO's always-on monitoring screen dies overnight.

**Prevention:**
1. **Ring buffer pattern:** Cap terminal events at 500-1000 entries. Use a ref-backed circular buffer, not ever-growing state arrays. Drop oldest when limit is reached.
2. **Virtualized rendering:** Use `@tanstack/virtual` for the terminal stream. Only render visible rows. Even with 1000 events in memory, only ~30 DOM nodes exist.
3. **Periodic flush for animations:** For the delegation graph, only keep the last N minutes of animation state. Completed animations get removed from state after their visual lifecycle ends.
4. **Memory monitoring in dev:** Add a `performance.memory` check (Chrome only) that warns when heap exceeds threshold.

**Detection:** Leave dashboard open for 2+ hours with active pipeline runs. Monitor browser memory in Task Manager.

**Confidence:** HIGH -- confirmed by [Supabase Realtime memory leak issue #1204](https://github.com/supabase/supabase-js/issues/1204) and real-world reports.

**Phase:** Must be designed into terminal stream and delegation graph components from day one. Retrofitting a ring buffer into an append-only state pattern is painful.

---

### Pitfall 4: Dark/Light Theme Hydration Mismatch

**What goes wrong:** Server renders light theme (no `localStorage` access). Client detects dark preference, adds `.dark` class. React throws hydration mismatch error. Users see a flash of wrong theme (FOUC).

**Why it happens:** During SSR, `window` and `localStorage` don't exist. The server always renders the default theme. Client-side JavaScript then modifies the DOM, causing mismatch. The current codebase already has `suppressHydrationWarning` on `<html>` (in `layout.tsx`) -- this silences the error but doesn't fix the flash.

**Consequences:** Console errors in production. Brief flash of light theme for dark-mode users. Looks unprofessional for a "cinematic" dashboard.

**Prevention:**
1. Use `next-themes` with `attribute="data-theme"` (not class-based). Update Tailwind CSS to use `@custom-variant dark (&:is([data-theme="dark"] *))` instead of the current `@custom-variant dark (&:is(.dark *))`. This avoids hydration mismatches entirely because CSS classes never change between server and client -- only the `data-theme` attribute does.
2. `next-themes` injects a blocking `<script>` in `<head>` that reads `localStorage` before paint, setting `data-theme` before React hydrates. Zero flash.
3. **Never** conditionally render different JSX based on theme in Server Components. Use CSS-only theme switching via custom properties.
4. For theme-dependent icons/images, use CSS `content` or `background-image` switching, not React conditional rendering.

**Detection:** Disable JavaScript, load page, re-enable -- observe flash. Check console for hydration warnings.

**Confidence:** HIGH -- verified against [next-themes](https://github.com/pacocoursey/next-themes) and current codebase.

**Phase:** Must be set up in the design system foundation phase, before any themed components are built. Requires changing line 5 of `globals.css`.

---

## Moderate Pitfalls

---

### Pitfall 5: SVG Animation Jank on Delegation Graph

**What goes wrong:** Animated particles traveling along SVG paths between orchestrator and sub-agents cause frame drops, especially with 5+ simultaneous agents. The "cinematic" graph becomes a slideshow.

**Why it happens:** Each animated particle triggers React re-renders if managed via state. SVG `getPointAtLength()` is expensive at 60fps per particle. Combined with React reconciliation, this exceeds the 16ms frame budget.

**Prevention:**
1. **CSS animations, not React state:** Use `offset-path` and `offset-distance` with `@keyframes` for particle movement. Zero React re-renders.
2. **Fallback with requestAnimationFrame:** If CSS `offset-path` is insufficient, use a single `requestAnimationFrame` loop updating DOM directly via refs, bypassing React.
3. **GPU-accelerated properties only:** Animate `transform` and `opacity`. Never animate `cx`, `cy`, `d`, or layout-triggering SVG attributes.
4. **Reduce particle count:** Maximum 2-3 particles per edge. More adds visual noise without information value.
5. **`will-change: transform`** on animated elements to promote to compositor layer.

**Detection:** Chrome DevTools Performance panel, record 10 seconds of animation, check for frames exceeding 16ms.

**Confidence:** HIGH -- standard web animation performance, verified against [MDN CSS/JS animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance).

**Phase:** Delegation graph phase must prototype animation performance early. Architecture (CSS vs React state) must be right from the start.

---

### Pitfall 6: Kanban Drag-and-Drop State Desync with Supabase

**What goes wrong:** User drags job card to new column. Optimistic update moves card. Backend update fails. Card stuck in wrong column with no rollback.

**Why it happens:** Optimistic UI assumes success. When the Supabase update fails (network error, constraint violation), local state and database are out of sync.

**Prevention:**
1. **Snapshot-based rollback:** Before any drag, snapshot entire board state. On failure, restore snapshot + toast error.
2. **Persist on `onDragEnd` only:** Don't write to Supabase during drag. Use `dnd-kit`'s `DragOverlay` for visual feedback. Persist only when drop completes.
3. **Server state as source of truth:** Use Realtime subscription to sync local board state. Local optimistic state is temporary; server state always wins on next broadcast.
4. **Multi-user conflict:** Last-write-wins with Realtime broadcast to update other users' boards.

**Detection:** Simulate network failures during drag. Test with two browser tabs on same board.

**Confidence:** MEDIUM -- based on [dnd-kit patterns](https://dndkit.com/) and general optimistic update knowledge.

**Phase:** Kanban phase needs explicit error handling and rollback design before building the happy path.

---

### Pitfall 7: Orq.ai API Rate Limits and Data Volume for Traces

**What goes wrong:** Dashboard polls Orq.ai for traces, tool calls, and agent metrics. With multiple swarms, trace volume is high. Rate limits hit, dashboard shows stale data.

**Why it happens:** Orq.ai traces generate hundreds of entries per agent run. Fetching full trace data for Gantt swimlanes and terminal stream requires many API calls. Without caching, each dashboard refresh hammers the API.

**Prevention:**
1. **Cache in Supabase:** Fetch Orq.ai trace data periodically (every 30-60s) via Inngest cron function. Store in Supabase. Dashboard reads from Supabase only, never from Orq.ai directly.
2. **Cursor-based pagination:** Never fetch all traces at once. Store last cursor in Supabase for incremental fetches.
3. **Stale-while-revalidate:** Show cached data immediately, refresh in background. Dashboard never blocks on Orq.ai API call.
4. **Rate limit handling:** Exponential backoff on 429 responses. Log rate limit headers. Already noted in CLAUDE.md: 45-second client timeout due to Orq.ai's 31s internal retry.

**Detection:** Monitor Orq.ai API response times and 429 rates.

**Confidence:** MEDIUM -- Orq.ai rate limits not publicly detailed. Based on general API integration patterns.

**Phase:** Data integration phase must establish Supabase caching layer before building any Orq.ai-dependent visualization.

---

### Pitfall 8: Multiple Supabase Realtime Channels Exhaust Connection Limits

**What goes wrong:** V7.0 dashboard subscribes to many channels simultaneously: `runs:live` (existing), `run:{id}` (existing), `health:status` (existing), plus NEW channels for kanban, terminal stream, delegation graph, and briefing updates. Connection limits hit, events dropped.

**Why it happens:** Supabase Realtime has per-project connection limits (varies by plan). Each channel counts. A single user with 3 tabs can exhaust connections. The codebase already uses 3 channel types.

**Prevention:**
1. **Multiplex on fewer channels:** Use broader channels with event-type filtering. E.g., `dashboard:{userId}` carrying `run-update`, `kanban-update`, `terminal-event`, `graph-update` events. One channel, multiple event types.
2. **Unsubscribe aggressively:** Follow the existing `useBroadcast` hook pattern (cleanup on unmount) for ALL new features. No ad-hoc subscription code.
3. **Single client instance:** The existing `broadcast-client.ts` pattern creates one Supabase client per subscription. Ensure a shared client instance at the page level.
4. **Monitor connection count:** Dev-mode indicator showing active channels.

**Detection:** Open 3+ dashboard tabs. Check Supabase Realtime dashboard for connection count.

**Confidence:** MEDIUM -- limits depend on Supabase plan tier.

**Phase:** Realtime architecture phase, before building individual features.

---

### Pitfall 9: Custom Font Loading Causes Layout Shift (CLS)

**What goes wrong:** Satoshi and Cabinet Grotesk are not on Google Fonts (unlike current Geist). Without proper loading strategy, text renders in fallback font, then shifts when custom font loads.

**Why it happens:** `next/font/google` handles font optimization automatically. Self-hosted fonts don't get this for free. Without `font-display: swap` and `size-adjust`, you get FOIT or FOUT.

**Prevention:**
1. Use `next/font/local` to load Satoshi/Cabinet Grotesk from `/public/fonts/`. Same optimization as `next/font/google` (preload, font-display swap, CSS variable injection).
2. Set `adjustFontFallback` to match metrics with system fonts, minimizing CLS.
3. Keep Geist loaded for existing pages during migration. Both font families coexist via CSS variables.
4. Test with Chrome DevTools "Slow 3G" throttling.

**Detection:** Lighthouse CLS score. Visual observation on throttled connection.

**Confidence:** HIGH -- `next/font/local` is well-documented.

**Phase:** Design system foundation phase. Must be done before building any V7 components.

---

## Minor Pitfalls

---

### Pitfall 10: Glassmorphism `backdrop-filter` Performance on Low-End Devices

**What goes wrong:** `backdrop-filter: blur()` is GPU-intensive. Stacking multiple glassmorphic cards causes frame drops on older hardware.

**Prevention:** Limit `backdrop-filter` to max 3-4 simultaneously visible elements. Use `will-change: backdrop-filter` sparingly. Provide `prefers-reduced-motion` fallback with solid backgrounds + opacity instead of blur.

**Confidence:** HIGH.

---

### Pitfall 11: `useEffect` Cleanup Race Conditions During Navigation

**What goes wrong:** Rapid navigation between views causes previous Realtime subscription cleanup to race with new subscription setup, leading to missed events or double-subscribed channels.

**Prevention:** Follow the existing `useBroadcast` hook pattern (ref-based callback, cleanup on unmount) for ALL new Realtime components. Consider a global Realtime manager singleton if channel count grows beyond 5 per page.

**Confidence:** MEDIUM.

---

### Pitfall 12: Middleware Auth Doesn't Account for New OAuth Flow

**What goes wrong:** Current middleware exempts `/login`, `/auth`, and `/api/inngest`. If Azure AD redirect URL is configured differently (e.g., `/api/auth/callback`), middleware blocks it.

**Prevention:** Ensure Azure AD redirect URL in Supabase Dashboard matches the existing `/auth/callback` route (already handled in `web/app/(auth)/auth/callback/route.ts`). Verify the middleware matcher. Test full OAuth round-trip.

**Confidence:** HIGH -- verified against current `middleware.ts` which exempts `/auth` paths.

---

### Pitfall 13: Gantt Swimlane Time Axis Drift

**What goes wrong:** Gantt-style observability swimlanes show per-agent timelines (thinking/tool/wait/done). If timestamps from Orq.ai traces and Supabase events use different clocks or timezone conventions, bars appear in wrong positions or overlap incorrectly.

**Prevention:** Normalize all timestamps to UTC on ingestion into Supabase. Display in user's local timezone only at the rendering layer. Use `Date.now()` for client-side timing, server timestamps for all persisted data. Never mix client and server timestamps in the same visualization.

**Confidence:** MEDIUM.

---

### Pitfall 14: AI Briefing Agent Generates Stale or Hallucinated Narratives

**What goes wrong:** The Orq.ai Briefing Agent generates a narrative like "The Debtor Email swarm processed 150 emails today with 98% accuracy" but the actual data shows 50 emails at 85%. The AI hallucinates specifics or uses cached data.

**Prevention:** Pass raw metrics as structured data (JSON) in the prompt, not as free text. Validate generated numbers against source data with a post-processing check. Include a "Data as of: [timestamp]" line in every briefing. Store the source metrics alongside the generated narrative for audit.

**Confidence:** MEDIUM -- based on general LLM reliability patterns and Orq.ai integration experience.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | Acceptable? |
|----------|-------------------|----------------|-------------|
| Single `globals.css` with V7 tokens mixed into existing tokens | Faster initial setup | Every existing page potentially affected by token changes; impossible to rollback V7 changes without affecting V6 pages | Never -- use parallel token namespaces |
| `useState` arrays for terminal events | Simple implementation | Unbounded memory growth, tab crashes after hours | Never -- ring buffer from day one |
| Polling Orq.ai API from client components | No caching infrastructure needed | Rate limits, slow renders, stale data, user-multiplied API calls | Never -- Supabase cache layer required |
| Using `react-beautiful-dnd` for kanban | Fastest path to working drag-drop | Library is in maintenance mode (Atlassian archived it). No React 18+ concurrent mode support. Will need replacement. | No -- use `dnd-kit` (actively maintained) |
| Inline SVG animation with React state updates | Quick to prototype | Re-renders on every animation frame, jank at scale | Only for prototype; must migrate to CSS animations or rAF before merging |
| Skipping visual regression tests during migration | Faster velocity | Regressions discovered by users, not developers | Never once shared styles are being modified |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Azure AD OAuth** | Using SAML SSO expecting auto-linking | Use OAuth provider (`auth-azure`), single-tenant, verify all emails before enabling |
| **Azure AD OAuth** | Leaving tenant URL as `common` (multi-tenant) | Set to `https://login.microsoftonline.com/<your-tenant-id>` |
| **Azure AD OAuth** | Not handling user with no `project_members` rows | Post-login check: redirect to "access pending" page |
| **next-themes + Tailwind** | Using class-based dark mode (`.dark`) causing hydration mismatch | Use `attribute="data-theme"` + `@custom-variant dark (&:is([data-theme="dark"] *))` |
| **next/font/local** | Forgetting `adjustFontFallback` for custom fonts | Set fallback metrics to minimize CLS during font load |
| **Supabase Realtime** | Creating new client per component subscription | Share client instance, follow `useBroadcast` hook pattern |
| **Supabase Realtime** | Not unsubscribing on component unmount | Use `supabase.removeChannel(channel)` in useEffect cleanup (existing pattern) |
| **dnd-kit + Supabase** | Writing to DB on every drag event | Persist only on `onDragEnd`, use `DragOverlay` for visual feedback during drag |
| **Orq.ai traces** | Fetching all traces in single API call | Cursor-based pagination, incremental sync, Supabase cache |
| **CSS animations on SVG** | Animating layout-triggering properties (`cx`, `cy`, `d`) | Use `transform` and `opacity` only, via `offset-path`/`offset-distance` |

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfalls | Severity | Key Mitigation |
|-------------|----------------|----------|----------------|
| **Design system foundation** | Token collision with existing pages (#2), font CLS (#9), hydration mismatch (#4) | CRITICAL | Parallel token namespace, `next/font/local`, `next-themes` with data-attribute |
| **O365 SSO** | Duplicate accounts (#1), middleware gaps (#12), tenant misconfiguration | CRITICAL | OAuth not SAML, verify email confirmation, single-tenant config |
| **Realtime architecture** | Memory leaks (#3), channel exhaustion (#8), cleanup races (#11) | HIGH | Ring buffer, channel multiplexing, follow `useBroadcast` pattern |
| **Delegation graph** | SVG animation jank (#5), glassmorphism perf (#10) | MODERATE | CSS animations not React state, limit backdrop-filter layers |
| **Kanban board** | Optimistic update desync (#6) | MODERATE | Snapshot rollback, server state as truth |
| **Terminal stream** | Memory leak (#3, same pattern) | HIGH | Ring buffer + virtualized list mandatory |
| **Gantt swimlanes** | Timestamp drift (#13), Orq.ai data volume (#7) | MODERATE | UTC normalization, Supabase cache layer |
| **AI briefing** | Hallucinated metrics (#14) | MODERATE | Structured data input, post-generation validation |
| **Orq.ai data integration** | Rate limits, stale data (#7) | MODERATE | Inngest cron -> Supabase cache, never poll from client |

---

## Recommended Phase Ordering (Based on Pitfall Dependencies)

1. **Design system foundation first** -- parallel tokens, fonts, theme infrastructure. Everything depends on this not breaking existing pages.
2. **O365 SSO early** -- identity linking bugs are hardest to fix retroactively. Easier to test with few new features than many.
3. **Realtime architecture** -- define channel strategy, ring buffer patterns, connection management before building features that depend on them.
4. **Data integration (Supabase cache for Orq.ai)** -- multiple features (Gantt, terminal, graph, briefing) need this layer.
5. **Individual features** (delegation graph, kanban, terminal, swimlanes, briefing) -- each follows patterns from steps 1-4.

---

## "Looks Done But Isn't" Checklist

- [ ] **SSO Login:** Works, but test with existing email/password user -- verify single account, not duplicate
- [ ] **Theme Toggle:** Switches correctly, but check: any FOUC on hard refresh? Console hydration warnings?
- [ ] **Terminal Stream:** Events render, but leave open 2 hours -- does memory grow unbounded?
- [ ] **Delegation Graph:** Animates, but record Performance profile with 5+ agents -- any frames >16ms?
- [ ] **Kanban Drag:** Cards move, but disconnect network mid-drag -- does board recover to correct state?
- [ ] **Design Migration:** New pages look great, but check EVERY old page -- any spacing/color/font regressions?
- [ ] **Orq.ai Data:** Dashboard shows traces, but check: is it polling Orq.ai directly or reading from Supabase cache?
- [ ] **Dark Mode:** Toggle works, but test: system preference change, multiple tabs, SSR'd page
- [ ] **Channel Cleanup:** Open and close dashboard views rapidly -- check Supabase Realtime connection count, any leaked channels?
- [ ] **Font Loading:** Page looks good on fast connection, but test on Slow 3G -- any layout shift when fonts load?

---

## Sources

- [Supabase Identity Linking Documentation](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Azure OAuth Login](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs)
- [Supabase Auth Server-Side for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Realtime Memory Leak Issue #1204](https://github.com/supabase/supabase-js/issues/1204)
- [SSO Identity Linking Discussion #42144](https://github.com/orgs/supabase/discussions/42144)
- [next-themes](https://github.com/pacocoursey/next-themes)
- [dnd-kit](https://dndkit.com/)
- [MDN CSS/JS Animation Performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)
- [Supabase Realtime Memory Leak Diagnosis](https://drdroid.io/stack-diagnosis/supabase-realtime-client-side-memory-leak)
- [shadcn/ui Radix to Base UI Migration Discussion](https://github.com/shadcn-ui/ui/discussions/9562)
- Current codebase: `web/app/globals.css`, `web/app/layout.tsx`, `web/lib/supabase/broadcast-client.ts`, `web/middleware.ts`, `web/app/(auth)/auth/callback/route.ts`

---
*Pitfalls research for: V7.0 Agent OS*
*Researched: 2026-04-15*
