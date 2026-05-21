---
phase-link: 88.2
opened: 2026-05-21
status: pending
---

# `builds response_format with strict json_schema from registry output_schema`

## Failing line
`web/tests/labeling/orq-agents-client.test.ts:~93`

## Error
`TypeError: Cannot read properties of undefined (reading 'type')` — `body.response_format` is `undefined` on the outbound POST body.

## Likely root cause
The Orq client was migrated from `/v2/agents/{slug}/invoke` (per-call body included `response_format` derived from registry `output_schema`) to `/v2/agents/{agent_key}/responses` (no per-call `response_format`; schema enforcement lives server-side on the agent). See `web/lib/automations/orq-agents/client.ts:146-180` and the inline comment "schema enforcement now lives on the agent server-side, not in the per-call body."

The test verifies a feature that production deliberately retired.

## Fixture/file likely needing work
- `web/tests/labeling/orq-agents-client.test.ts` — either delete the test, or re-aim it at validating that registry `output_schema` ends up applied at agent-create time (separate seam, separate fixture).

## Skip reason
Time-boxed per Phase 88.2 D-07; see CONTEXT.md. Genuine intent shift, not a small drift — not worth burning the time-box in 88.2.
