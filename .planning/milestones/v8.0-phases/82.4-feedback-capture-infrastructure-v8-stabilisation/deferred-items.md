
## Plan 03 — out-of-scope discoveries

- **Pre-existing TS error:** `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/actions.predictor.test.ts:60` — `TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.` Confirmed present on `main` before plan 03 work started; unrelated to feedback-panel surface. Not fixed.

## Plan 06 — Pre-existing TS error (out of scope)

`web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/actions.predictor.test.ts:60`
`error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.`

Not in plan 06's files_modified. Pre-existed prior to chip wiring. Defer to a follow-up cleanup.
