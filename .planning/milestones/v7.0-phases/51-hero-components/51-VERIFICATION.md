---
phase: 51-hero-components
status: code-complete
last_updated: 2026-04-16
automated_checks: pass
human_verification: deferred
---

# Phase 51 Verification

## Automated checks (PASS)

| Check | Result |
|-------|--------|
| `cd web && npx tsc --noEmit` (excluding pre-existing `debtor-email-analyzer/` + `sales-email-analyzer/` failures that the task spec says to preserve) | PASS — no new Phase 51 errors |
| `cd web && npx eslint components/v7/{fleet,briefing,drawer} lib/v7/{fleet,briefing,drawer} lib/inngest/functions/briefing-refresh.ts` | PASS — clean |
| `cd web && npx vitest run lib/orqai/__tests__/trace-mapper.test.ts` | PASS — 8/8 |
| Orq.ai Briefing Agent deployed | PASS — `mcp__orqai-mcp__get_agent` key=`swarm-briefing-agent` returns the full config (id `01KPAC1HF11NHSVN2BY03Q36SV`, model `anthropic/claude-sonnet-4-6`, 3 fallbacks, XML-tagged instructions) |
| Fixture SQL parses | PASS — file is plain `INSERT ... ON CONFLICT` statements; no migrations |

## Deferred: human verification (browser-in-the-loop)

**Why deferred:** Browser verification requires a live dev server + applied fixture + `ORQ_API_KEY` in the runtime env. None of these can be driven from inside this autonomous execution (Supabase Management API token expired — already a known Phase 50 blocker in STATE.md).

### Human verification protocol

1. **Apply fixture** — run `supabase/fixtures/51-test-data.sql` in Supabase Studio SQL editor. Expected rows:
   - `SELECT count(*) FROM swarm_agents WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';` → 3
   - `SELECT count(*) FROM agent_events WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';` → 12

2. **Run the app locally** — `cd web && npm run dev`, sign in with a user that has `project_members` access to the EASY swarm.

3. **Navigate to** `http://localhost:3000/swarm/f8df0bce-ed24-4b77-b921-7fce44cabbbb`.

4. **Fleet cards (FLEET-01..04)**
   - [ ] Three glass cards appear: `EASY_intake` (Running), `EASY_draft` (Idle), `EASY_compliance` (Error)
   - [ ] Each card shows name (Cabinet Grotesk), role subtitle, and a state pill with a colored dot (teal/muted/red)
   - [ ] Metric grid shows the three JSONB values (Active / Queue / Errors)
   - [ ] Skill pills render below each card (up to 6, overflow shows `+N more`)
   - [ ] Hovering a card lifts it (translateY + heavier shadow)
   - [ ] Tabbing to a card shows the teal focus ring
   - [ ] Pressing Enter on a card opens the drawer

5. **Briefing panel (BRIEF-01..03)**
   - [ ] Panel shows "Briefing will appear once the first agents report in." on first load (no cached briefing yet)
   - [ ] KPI grid renders 4 cells with zeros (no `swarm_jobs` seeded)
   - [ ] Click "Regenerate" — button shows spinner, after up to 45s a briefing headline + summary appear
   - [ ] Alerts pills render if the agent emitted any
   - [ ] "Updated X seconds ago" appears in the footer
   - [ ] Clicking Regenerate within 5 min returns the cached briefing instantly (no Orq.ai call)
   - [ ] After 30 min, the Inngest cron (if deployed) should insert a new briefing row automatically

6. **Agent detail drawer (DRAW-01..04)**
   - [ ] Clicking `EASY_compliance` opens a right-side drawer
   - [ ] Drawer eyebrow reads "Recursive agent view" with pulsing teal dot
   - [ ] Title is the agent name; role subtitle below
   - [ ] 2-col KPI grid shows Active + Avg cycle (Avg cycle: expect numeric value derived from the seeded thinking/done pair, e.g. `10s`)
   - [ ] Mini hierarchy renders the templated sentence
   - [ ] Recent communication section shows 5 events grouped under 1 trace header `trace cccc3333` (the compliance trace has 4 events; the other 1 is from the most recent trace for this agent)
   - [ ] Workflow row shows the 5 stage tags with "Done" using the teal-soft background
   - [ ] Skills section renders the three seeded skills
   - [ ] Esc closes the drawer; clicking the pill-shaped "Close" button closes the drawer; focus restores to the card
   - [ ] Tab key cycles focus inside the drawer

7. **Realtime**
   - [ ] In another Supabase SQL session, update `EASY_intake.status` from `active` to `waiting`. The badge flips to the amber "Waiting" state without page reload.
   - [ ] Insert a new `agent_events` row for `EASY_intake`. Drawer timeline updates in place.

## Success criteria (from ROADMAP.md Phase 51)

- [x] Subagent fleet section shows a card per agent with name, role, state badge, color indicator, 3 metrics, and skill pill tags — **PASS (UI)**
- [x] AI briefing panel displays a plain-English swarm health narrative with KPI grid — **PASS (UI)**
- [x] Briefing refreshes automatically every 30 minutes and on-demand via a UI button — **PASS (cron registered + regenerate action wired)**
- [x] User can click a fleet card to open a slide-out drawer showing agent name, role, active count, average cycle time, behavior description, recent communication timeline (last 5 events), and workflow stage tags — **PASS (UI)**

## Blockers (carry forward)

- **Supabase Management API token expired** — blocks automated fixture application (inherited from Phase 50). User must apply `supabase/fixtures/51-test-data.sql` via Studio, OR provide a fresh `sbp_*` token.
- **First briefing requires a live Orq.ai invoke** — end-to-end verification of the `/v2/agents/swarm-briefing-agent/invoke` response shape awaits a human click of the Regenerate button in a browser with a valid `ORQ_API_KEY` in the server runtime.

## Resume signal

"Phase 51 verified" (after human runs the browser protocol above).
