---
status: partial
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
source: [131-VERIFICATION.md]
started: 2026-06-17
updated: 2026-06-17
---

## Current Test

[awaiting human testing]

## Tests

### 1. `algemeen@smeba.nl` mailbox exists / is correct
expected: The `algemeen` destination bucket routes to a real, monitored mailbox. The seed uses `algemeen@smeba.nl`, which is NOT in charter §2's verified-mailbox table. Operator confirms the address exists (or supplies the correct one). Inert in Phase 131 (ROUTE-07 no-forward held gate withholds all forwards) — but MUST be correct before Phase 132 enables live forwarding, or `algemeen` mail forwards to a dead address.
result: [pending]

### 2. Orq Studio Response Format dropdown shows the json_schema
expected: In Orq Studio → `info-routing-coordinator` → Model parameters, the Response Format dropdown visibly reflects the strict `info_routing_destination` JSON Schema. NOTE: API-level enforcement is ALREADY CONFIRMED — `get_agent` shows `model.parameters.response_format` = the strict json_schema (8-bucket enum, anyOf-nullable brand), which is what the pipeline's `invokeOrqAgent` path uses. This UAT item is the Studio UI/playground reflection only (CLAUDE.md learning cba7352b); confirm the dropdown for completeness.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
