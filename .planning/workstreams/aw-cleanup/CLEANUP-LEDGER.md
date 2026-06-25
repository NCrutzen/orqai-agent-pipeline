# aw-cleanup — Over-engineering / dead-code ledger

Source: `/ponytail-audit` (4 parallel area-scans) + `knip`, on `agent-workforce/web` @ 2ab2ab7a, 2026-06-24.
Scope: over-engineering & dead code only. NOT correctness/security/perf (route those to `/code-review`).

**Total opruimbaar: ~17.2k regels, 4 deps.** Deletes zijn recoverable via git-history — `git rm`, geen `_archive` nodig.

Ship per batch als eigen kleine `chore/` PR. Volgorde = grootste cut + laagste risico eerst.

---

## PR1 — Archiveer spent one-shot scripts  (~10.000 regels, LAAGSTE risico)
≈45 date/phase-gepinde one-shots die al gedraaid hebben. `git rm` (history = vangnet).
- `web/scripts/sugar-*.ts` (5 files, RAPPORT-V2/V3 Sugar/Outlook reports) — 2434L
- `scripts/support-tickets-phase4-smoke.ts` + `phase5-smoke.ts` — 1836L
- `web/scripts/precision-dry-run.ts` + `equality-dry-run.ts` (Phase-90/91 cutover gates, done) — 1256L
- `web/scripts/phase4-*.ts`, `phase85-smoke-v3.ts`, `phase69-dispatch-smoke.ts`, `phase-84-corpus-probe.ts`, `uat-82.5-browserless.ts`, `verify-phase83.ts`
- `web/scripts/replay-invoice-*.ts`, `spike-011*`, `probe-2026-folder`, `replay-fire-control-*` (~18 files, ~2000L)
- `web/scripts/backfill-bodies.ts` + `backfill-stuck-classifying-stage3.ts` + `scripts/phase-65-regression-backfill.ts`
- `scripts/sales-*-mining.ts`, `sales-stage-1-cluster-mine.ts`
- `scripts/relabel-*.sh` (7), `noise-archive*.sh` (4), `refire-*.sh` (3) — spent prod-ops, hou max 1 geparametriseerde
**KEEP (wired, NIET wissen):** codegen `gen-*.ts`, `check-supabase-advisors.ts` (pre-push), `check-clickup-webhooks`/`check-ticket-cache`/`audit-orq-agents` (npm check:*), `run-retro-classify.ts` (inngest), `eval/*` gates.
Verify vóór rm: `grep -rl "<scriptnaam>" --include=*.ts --include=*.json` leeg + niet in package.json scripts.

## PR2 — Verwijder verlaten sub-projecten  (~33 files + vendored deps)
- `web/debtor-email-analyzer/` (33 files) — analyse-spike, 0 referenties (knip)
- `web/lib/automations/email-insights/` — self-contained subproject, eigen package.json/lock, 0 app-referenties — ~308L + eigen node_modules
- `web/lib/automations/heeren-oefeningen/explore/` (20 `explore*.ts` + `check-roles.ts`) — throwaway browser-probes, 0 importers — ~2631L

## PR3 — Dode component-files  (~2.400 regels)
- `web/components/terminal/` (7 files) — orphaned; actieve is `v7/terminal/terminal-stream` — 1139L
- `web/components/ui/sidebar.tsx` — volledige shadcn sidebar, 0 gebruik — 702L
- `web/components/v7/fleet/` (subagent-fleet + card) — 0 consumers — 168L
- `web/components/approval/approval-history.tsx` — 0 importers — 85L
- `web/app/.../ticket-detail-error-state.tsx` — byte-identiek aan `TicketsErrorState`, 0 importers — 24L

## PR4 — Dode lib-files/exports  (~600 regels na PR2-overlap)
- `web/lib/automations/debtor-email-cleanup/probe-*.ts` (popup + sidebar-collections) — 830L
- `web/lib/pipeline/discussion-action.ts` + `discussion-agent.ts` + `streaming-narrator.ts` — dood chat-subsysteem, alleen stale comment in stages.ts:35 — 203L
- `web/lib/classifier/read.ts` — `listRulesForSwarm` 0 callers — 28L
- Dode aliases: `loadEntityBrandRegister` (registry.ts:142), `invokeOrqAgentWithUsage` (orq-agents/client.ts:245)
- Dode types: `ClassifierRuleEvaluation`/`...MailboxOverride` (classifier/types.ts), `CredentialProjectLink`/`ReplaceCredentialRequest` (credentials/types.ts)

## PR5 — Dode app-routes/components  (~750 regels)
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts` — 0 non-test callers — 310L
- `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-1-feedback-widget.tsx` — superseded door stage-1-decide — 307L
- `web/app/api/users/search/route.ts` — "coming soon" stub, 0 refs
- `PriorityBadge` (klachten-dashboard.tsx) — nooit gerenderd
- `executive/page.tsx` — speculatieve `period` parse + `void period`

## PR6 — Ongebruikte deps  (mechanisch)
`pnpm remove` na verify: `@elevenlabs/elevenlabs-js`, `@types/dagre`, `@zapier/zapier-sdk-cli`, `serwist`.
⚠️ `serwist` hangt aan PWA service-worker (`app/sw.ts` óók in knip-unused). Bevestig dat PWA niet bedoeld is vóór verwijderen.

## PR7 — knip unused exports/types  (138 + 141, NOISY — selectief)
Veel zijn shadcn/ui-primitives (`buttonVariants`, `CardFooter`, `AvatarImage`…) = bewust library-oppervlak, NIET wissen. Alleen niet-library dode exports knippen. Lage prioriteit, doe na PR1-5.

---

## PR8+ — Refactors (logica-wijziging, vereist tests — NA de deletes)
- `stdlib:` verbatim `.env.local`-parser in 5 scripts → `node --env-file` / `dotenv`
- `stdlib:` `util.parseArgs` i.p.v. handmatige `process.argv` in ~10 scripts
- `yagni:` `checkAutomationSecret(req)` helper — `x-automation-secret` 401-check is ~8x copy-paste
- `yagni:` `nxtLookupRoute(listFn, mapFn)` — 5 near-identieke NXT-lookup routes
- `shrink:` één `sendBestEffortEmail()` — Resend-boilerplate 3x (email/*)
- `shrink:` 1 shared `sugarFetch` helper als sugar-scripts blijven (~400 dup regels)
- `stdlib:` `Map.groupBy` (ES2024) i.p.v. hand-rolled `groupBy` (cluster.ts:386, +4 call sites)
- `stdlib:` shared relativeTime/date-helper — 6x hand-rolled "Xm/Xh ago" in components → `lib/dashboard/format.ts` (bestaat al) of `Intl.RelativeTimeFormat`
- `yagni:` 4 near-identieke recharts-wrappers → 1 `<TrendChart>` (~200→90L)
- `yagni:` `requireOwnedCredential(id)` helper — ownership-block 4x in settings/actions.ts
