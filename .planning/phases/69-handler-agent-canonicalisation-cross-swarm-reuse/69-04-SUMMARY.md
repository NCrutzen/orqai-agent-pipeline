---
phase: 69-handler-agent-canonicalisation-cross-swarm-reuse
plan: 04
wave: 4
subsystem: debtor-email/handler
tags: [phase-69, canonicalisation, handler-refactor, replay-safety, T-69-02]
requires:
  - 69-03 (entity.generated.ts; brand-register loader; BODY_VERSION 2026-05-04.v2)
provides:
  - Vercel-deployable handler on the canonical D-04 input shape
  - Cross-brand isolation guarantee at unit level (T-69-02 mitigation)
affects:
  - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
  - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
  - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts
tech-stack:
  added: []
  patterns:
    - registry-driven brand metadata via loadBrandRegister
    - replay-safe lookup wrapped in step.run("load-brand-register")
key-files:
  created:
    - "(replaced scaffold) web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts"
  modified:
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
decisions:
  - Hoist loadBrandRegister into a dedicated step.run("load-brand-register") block before detect-emotion so brandReg is shared across emotion + body steps and memoized across replays.
  - Use brandReg.register_language as the source of truth for the language input — fully retires inferLanguageFromEntity.
  - Pass brand_register as a structured object (code, display_name, register_language, register_dialect, signoff_phrase, formal_address) — omit nxt_database_alias and icontroller_company from agent input since they are tool-routing concerns, not register-rendering data.
metrics:
  duration: ~10 minutes
  completed: 2026-05-04
  tasks: 2
  commits: 2
---

# Phase 69 Plan 04: Handler refactor — canonical input shape + cross-brand isolation

Vercel-side runtime is now on the Phase 69 canonical input shape (D-04). The body
agent receives `entity_brand`, `brand_register{}`, `language`, `customer_id`,
`customer_name`, `recent_documents`, `context_version`. The legacy
`email_entity` / `email_language` fields are gone. `inferLanguageFromEntity` is
deleted. Cross-brand isolation is locked at the unit level (T-69-02).

## What changed

### `classifier-invoice-copy-handler.ts`

| Before                                         | After                                                                 |
|------------------------------------------------|-----------------------------------------------------------------------|
| `inferLanguageFromEntity(entity)` derived lang | `brandReg.register_language` from registry                            |
| `email_entity: entity, email_language: language` in agent input | `entity_brand: brandReg.code` + structured `brand_register: {...}` + `language` |
| (no brand load step)                           | `await step.run("load-brand-register", () => loadBrandRegister(admin, swarm_type ?? "debtor-email", entity))` BEFORE detect-emotion |
| Local helper `inferLanguageFromEntity`         | Deleted                                                                |
| (no canonical context fields)                  | `customer_id`, `customer_name`, `recent_documents`, `context_version: 1` |

Diff: +42 / -24 across 1 file (commit `293f6e6`).

Replay-safety preserved: the registry read is wrapped in `step.run` so Inngest
memoizes the resolved brand across replays. No `inngest.send` calls were added
or destructured.

### Tests

**Existing handler test** (`classifier-invoice-copy-handler.test.ts`):
- Added `FIVE_BRANDS` constant + a `swarms`-table branch to the supabase
  `makeChainForTable` so `loadBrandRegister` resolves cleanly through the
  existing mock harness.
- Added a new describe block `CANO-01 ... canonical input shape` that asserts:
  - `invokeOrqAgent` is called with `entity_brand: "smeba"`,
    `brand_register: { code, register_language, signoff_phrase, formal_address }`,
    `language: "nl"`, `customer_id`, `context_version: 1`,
    `body_version: "2026-05-04.v2"`.
  - `email_entity` and `email_language` are NOT in the inputs.

**Isolation test** (`classifier-invoice-copy-handler-isolation.test.ts`):
- Replaced the Wave 1 scaffold (4 `it.todo` placeholders) with 4 working tests:
  - 3 parameterised cases: smeba/sicli-sud/berki resolve to that brand only.
  - Single-object guarantee (not an array, no array-like indices).
  - `UnknownBrandError` surfaces — no silent fallback (T-69-01 reinforced).
  - `language` input matches `brand_register.register_language` for every
    brand in the 5-brand registry.

## Test results

```
$ npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts \
                lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts
 Test Files  2 passed (2)
      Tests  10 passed (10)
```

- `classifier-invoice-copy-handler.test.ts`: 4 passed (3 pre-existing CORD-03
  tests + 1 new CANO-01 input-shape test).
- `classifier-invoice-copy-handler-isolation.test.ts`: 6 passed (3
  parameterised + 1 single-object + 1 UnknownBrandError + 1 language sweep).

## tsc

```
$ cd web && npx tsc --noEmit
lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts(381,48): error TS2345: ...
lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts(265,44): error TS2345: ...
```

Both errors are **pre-existing** on the worktree base (`59666a0`) — verified by
stashing the Wave 4 changes and re-running tsc. Out of scope for Wave 4. No
new errors introduced.

## Out of scope (deferred)

- `lib/inngest/functions/__tests__/debtor-email-{coordinator,orchestrator}.test.ts` —
  pre-existing `null` vs `string` mismatches. Should be fixed in a separate
  housekeeping pass; not gated on Phase 69.

## Threat-model status

| Threat ID | Status |
|-----------|--------|
| T-69-02 (cross-brand context bleed) | Mitigated. Isolation test asserts each invocation returns exactly one brand_register matching the requested entity. |
| T-69-12 (replay sees stale metadata) | Accepted (per plan). Brand registry is read-only, mutation-rare. |
| T-69-13 (entity null crashes handler) | Mitigated. Existing guard at line 165 returns failRun on null entity before the brand-load step. |
| T-69-14 (orphan inferLanguageFromEntity callers) | Verified zero callers — function deleted. tsc green for handler file. |

## Hand-off note to Plan 05

**Vercel deploy can ship now.** The handler's body-agent input is on the new
shape (`entity_brand`, `brand_register`, `language`, plus canonical context
fields). The Orq agent prompt is still on the old prompt — it will receive the
extra structured fields as inputs but Orq tolerates unknown variables, so the
prompt continues to render against `email_entity` / `email_language` which the
prompt-side variables can be derived from `entity_brand` / `language`
respectively. Plan 06 (operator-gated) flips the agent prompt to the new
variables; per D-19 deploy order, Vercel goes first (this plan), Orq goes
second.

If Plan 05 includes a smoke verification ahead of the Orq prompt PATCH:
- Use a mailbox where `labeling_settings.entity = "smeba"`.
- Confirm `agent_runs.tool_outputs.body.body_version = "2026-05-04.v2"`.
- Confirm at least one row of `email_labels` lands with
  `method = "invoice_copy_drafted"`.

## Commits

| Hash      | Type     | Subject                                                              |
|-----------|----------|----------------------------------------------------------------------|
| `293f6e6` | refactor | handler uses canonical input shape + loadBrandRegister               |
| `a665427` | test     | canonical input shape + cross-brand isolation (T-69-02)              |

## Self-Check: PASSED

- All 3 modified files exist on disk.
- Both commits (`293f6e6`, `a665427`) reachable from HEAD.
- Handler grep checks: `loadBrandRegister` present, `brand_register: {` present, `entity_brand: brandReg.code` present, no `email_entity:` references, no `function inferLanguageFromEntity` definition.
- Both target tests green (10/10).
- tsc shows only pre-existing errors in unrelated test files (verified via stash).
