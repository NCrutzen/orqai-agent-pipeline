# Deferred items (out of scope for this phase)

## Pre-existing tsc errors (not caused by Phase 61-01)

- `web/lib/debtor-email/icontroller-catchup.ts:14` — Cannot find module 'dotenv'
- `web/lib/debtor-email/replay.ts:9` — Cannot find module 'dotenv'

These predate Phase 61. Both files are local CLI scripts (not in the build
graph). Either install `@types/node`-aware `dotenv` types, switch to
`process.env`, or move scripts behind a tsconfig exclude. Out of scope for
the verdict-write/body-fetch contract changes.
