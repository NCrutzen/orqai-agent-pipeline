---
captured: 2026-05-21
source: G1 day-plan execution — CI gate turned on, surfaced pre-existing debt
status: pending
priority: H
due: pre-Phase-999.9 close OR before adding 3rd developer
target_milestone: v8.1 grooming
tags: [ci, lint, test-debt, governance]
---

# Lint + Test debt — promote from advisory to required-status before flipping `enforce_admins: true`

## What landed today (2026-05-21)

- PR #34 merged: `pr-checks.yml` workflow live (codegen drift / lint / typecheck / test / build)
- Branch protection on `main` REQUIRES: `codegen drift`, `typecheck`, `build`
- Branch protection ADVISORY (non-blocking): `lint`, `test`
- `enforce_admins: false` — admins can bypass with audit log

This shape was chosen because turning the gate on surfaced **194 lint errors + ≥3 broken tests** as pre-existing debt. Fixing it on Day 1 would have blown the day plan. The compromise was: ship the gate with the high-value checks required, leave the rest visible-but-non-blocking, and clean up in a focused phase.

## What's broken (snapshot from PR #34 CI run 26210390402)

### Lint — 194 errors, 179 warnings

Dominant patterns:
- `@typescript-eslint/no-explicit-any` — many sites
- `prefer-const` — handful (e.g. `web/tests/labeling/nxt-zap-client.test.ts:64`)
- `@typescript-eslint/no-unused-vars` on `_`-prefix variables — ESLint config doesn't exempt `_` prefix; should add `argsIgnorePattern: "^_"` + `varsIgnorePattern: "^_"`. This alone clears ~70% of warnings.
- Unused `eslint-disable` directives in some scripts

Likely 1-2h to fix all errors + warnings, mostly via:
1. ESLint config update for `_`-prefix exemption (kills bulk of warnings cheaply)
2. Replace `any` with proper types or `unknown` (~30-40 errors)
3. `let`→`const` (~5 errors)
4. Remove stale `eslint-disable` comments

### Test — at least 3 real failures

- `lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` — `TypeError: admin.channel is not a function` (Realtime mock missing in test env)
- `tests/labeling/*` — `create-draft failure` propagation test failing
- `tests/...` — `Graph 404` (`em-2 FAILED: Error: Graph 404`) — Outlook mock missing
- One render test: `renders no_handler + low_confidence rows; filters OUT handler_error`

These are mock/fixture issues, not production bugs. ~2-3h triage + fix.

## Definition of done

1. `npm run lint` → 0 errors, 0 warnings (or documented exception count baseline if some warnings are intentional)
2. `npm test` → all pass
3. Update branch protection: add `lint` + `test` to `required_status_checks.contexts`
4. Flip `enforce_admins: true` — no more bypass even for Nick
5. Update `docs/collaboration.md` to remove "Tier 3" caveat about Code Owner reviews (or implement that gate too)

## When to do this

Before any of:
- Onboarding a 2nd active developer (the bypass+debt combo is brittle in a multi-writer world)
- Closing Phase 999.9 (info@smeba.nl swarm) — the swarm migration touching `swarm_noise_categories` will run through this gate; cleaner if lint is clean before that lands

If neither of those happens this week, target this for the v8.1 grooming cycle.

## Reference

- PR #34: https://github.com/Moyne-Roberts/agent-workforce/pull/34
- CI run with debt visible: https://github.com/Moyne-Roberts/agent-workforce/actions/runs/26210390402
- Originating todo: `.planning/todos/pending/2026-05-20-tier-2-ci-pr-checks-workflow.md` (now mostly satisfied; mark complete after this debt closes)
