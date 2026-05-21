---
captured: 2026-05-20
source: docs/collaboration.md session — branch protection walkthrough
status: pending
priority: H
due: 2026-05-21
target_milestone: v8.0 follow-up (pre-V8.1 start)
tags: [ci, governance, collaboration, branch-protection]
---

# Tier 2 CI — PR-checks workflow + branch protection (due end of 2026-05-21)

## The need

Repo moves to multi-developer next week. Today there is **zero PR-gating CI** — `.github/workflows/inngest-sync.yml` runs post-merge only. `CODEOWNERS` is in place (this PR) but without status checks it is etiquette, not enforcement. Codegen drift on `web/lib/swarms/*.generated.ts` and `web/lib/automations/debtor-email/coordinator/*.generated.ts` will land unnoticed.

## Deliverable

### 1. `.github/workflows/pr-checks.yml`

New workflow triggered on `pull_request` against `main`. Steps:

- Checkout
- Setup Node (match Vercel build version)
- `npm ci` in `web/` workspace
- `npm run codegen && git diff --exit-code` — fails on generated-TS drift
- `npm run lint`
- `npm run typecheck` (verify the script exists in `web/package.json`; add if missing)
- `npm test`
- `npm run build`

All four must pass for merge. Cache `node_modules` + `.next/cache` for speed.

### 2. GitHub branch protection on `main`

- Require pull request before merging
- Require status checks: `pr-checks / codegen`, `pr-checks / lint`, `pr-checks / typecheck`, `pr-checks / test`, `pr-checks / build`
- Require branches to be up to date before merging
- Auto-delete head branches after merge
- (Defer Tier 3 — `Require review from Code Owners` — until second developer onboards)

## Acceptance criteria

- A test PR that hand-edits a `*.generated.ts` file FAILS the codegen check.
- A test PR that breaks a vitest fails the test check.
- Direct push to `main` is blocked (PR required).
- All checks finish under 8 minutes on a clean cache (5 min target).

## Open questions

- Does `web/package.json` have a `typecheck` script? If not, add `"typecheck": "tsc --noEmit"`.
- Monorepo or single workspace? `web/` is the only Node workspace today — set `working-directory: web` at the job level.
- Vercel preview deployments — separate concern, don't try to gate on those.

## Tradeoffs accepted

- Build step in CI duplicates Vercel's preview-build work (slight redundancy, but catches build breakage without waiting for Vercel webhook).
- Codegen check forces every registry migration PR to commit the generated diff — that's the point.

## Out of scope

- Tier 3 CODEOWNERS-required review (defer to second-dev onboarding).
- Signed commits, linear history, deployment gates (overkill at 2-3 person team).
- Per-developer Supabase schema overlays (only adopt if shared-DB collisions actually bite).

## Origin

Branch protection walkthrough during 2026-05-20 collaboration-doc design session. User requested Tier 2 land by end of 2026-05-21 so multi-dev work next week has real gating, not just etiquette.
