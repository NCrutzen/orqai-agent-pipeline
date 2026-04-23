# TOOLS — debtor-email-swarm

## Summary

**Orq.ai tool definitions required: NONE.**

All tool-calls are executed by Inngest step code, NOT by Orq agents. This is a deliberate architectural decision — see `blueprint.md` §2 "Orchestration Pattern" for rationale.

## Why no Orq tools?

- **Durable retries** — `fetchDocument` takes ~26s; Inngest retries are cheaper than LLM-loop retries.
- **Expensive-tool cache** — fetchDocument result is cached per `(docType, reference, entity)` in Inngest step output, not in agent memory.
- **HITL `waitForEvent`** — phase 2 sub-agents block on human review; Orq doesn't support durable waits.
- **Clean observability** — Orq Analytics tracks LLM; Inngest tracks orchestration.

## External tools (for Inngest engineering reference)

Neither of these is registered as an Orq tool. Both are invoked via `fetch()` inside Inngest `step.run()` calls.

### fetchDocument

| Property | Value |
|---|---|
| Method | POST |
| URL | `https://agent-workforce-eosin.vercel.app/api/automations/debtor/fetch-document` |
| Auth | `Authorization: Bearer ${AUTOMATION_WEBHOOK_SECRET}` |
| Request | `{ docType, reference, entity }` |
| Response (success) | `{ found: true, pdf: {base64, filename}, metadata: {invoice_id, customer_id, document_type, bucket, key, created_on}, request_id }` |
| Response (failure) | `{ found: false, reason, request_id }` with HTTP 400/404/502/504 |
| Error `reason` values | `invalid_reference_format \| unsupported_doc_type \| timeout \| not_found \| fetch_failed \| upstream_error` |
| Latency (p50) | ~26s end-to-end |
| Internal timeout | 50s |
| Vercel ceiling | 60s (Pro) |
| Retry policy (Inngest) | 3 retries exponential (30s / 2m / 10m), cap 15min total. `not_found` → no retry, direct human queue. |
| Caching | Cache step output on `(docType, reference, entity)` key so downstream step retries (e.g., createDraft) do NOT re-invoke the 26s chain. |

Planned extension (out-of-scope for phase 1): response gains `{ ambiguous: true, match_count: N }`. Inngest routes ambiguous → human queue.

### createIcontrollerDraft

| Property | Value |
|---|---|
| Method | POST |
| URL | `https://agent-workforce-eosin.vercel.app/api/automations/debtor/create-draft` |
| Auth | `Authorization: Bearer ${AUTOMATION_WEBHOOK_SECRET}` (also legacy `x-automation-secret`) |
| Request | `{ messageId, bodyHtml, pdfBase64, filename, env: 'production' }` |
| Response (success) | `{ success: true, draftUrl, screenshots: {beforeSave, afterSave}, bodyInjectionPath }` |
| Response (failure) | `{ success: false, reason, screenshot, details }` HTTP 500 |
| Error `reason` values | `login_failed \| message_not_found \| attach_failed \| save_failed` |
| Retry policy (Inngest) | `login_failed` → circuit-breaker pauses all drafts 30min + Slack alert. `attach_failed` / `save_failed` → 1 retry per email. `message_not_found` → no retry, human queue. |
| Screenshot archival | On failure, screenshots MUST be uploaded to Supabase Storage + linked in `debtor.agent_runs.tool_outputs`. |

## Circuit-breaker (Inngest-managed)

Supabase key: `debtor.automation_state.icontroller_drafter_breaker`
- `open` → no new createDraft calls; pending rows wait in `login_failed_blocked` state.
- `half_open` → after 30min, next call probes; success closes, failure re-opens.
- `closed` → normal.

Manual reset via ops runbook if auto-recovery fails.

## Agent tool configs

| Agent key | Orq tools |
|---|---|
| debtor-intent-agent | none |
| debtor-copy-document-body-agent | none |
| debtor-payment-dispute-agent (stub) | none (phase 2 TBD) |
| debtor-address-change-agent (stub) | none (phase 2 TBD) |
| debtor-peppol-request-agent (stub) | none (phase 2 TBD) |
| debtor-credit-request-agent (stub) | none (phase 2 TBD) |
| debtor-contract-inquiry-agent (stub) | none (phase 2 TBD) |
| debtor-general-inquiry-agent (stub) | none (phase 2 TBD) |
