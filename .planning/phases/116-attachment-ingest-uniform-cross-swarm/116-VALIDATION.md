---
phase: 116
slug: attachment-ingest-uniform-cross-swarm
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-04
revised: 2026-06-04
---

# Phase 116 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (repo standard, `web/`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --changed` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~60 seconds |

Note on bracketed paths: the `[swarm]` route segment contains glob-special characters. When targeting those test files directly, single-quote and escape the brackets: `npx vitest run 'app/(dashboard)/automations/\[swarm\]/_shell/__tests__/attachment-list.test.tsx'`.

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --changed`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 01 | 1 | ATTACH-05 | T-116-01, T-116-02 | RLS on new table + private bucket, no anon policy | grep gate (DDL) | `grep -v '^--' supabase/migrations/20260605_email_attachments.sql \| grep -c "ENABLE ROW LEVEL SECURITY" \| grep -qx 1 && grep -v '^--' supabase/migrations/20260605_email_attachments.sql \| grep -qE "TO anon" && echo "ANON-FOUND-FAIL" \|\| echo "OK"` | created by task | ⬜ pending |
| 01-T2 | 01 | 1 | ATTACH-05 | T-116-03 | Registry switches + stage2_dispatch_event; no codegen drift | grep gate (DDL) | `grep -c "attachment_config" supabase/migrations/20260605b_swarms_attachment_switches.sql \| grep -qvx 0 && grep -q "swarm_type = 'debtor-email'" … && grep -q "'extract', false" … && grep -q "stage2_dispatch_event" … && echo OK` | created by task | ⬜ pending |
| 01-T3 | 01 | 1 | ATTACH-05 | T-116-01, T-116-02, T-116-03 | Migrations applied; advisor 0-ERROR; codegen drift-free; stage2_dispatch_event matches worker trigger | checkpoint:human-verify (`npm run check:supabase`, `npm run codegen && git diff --exit-code`) | manual (advisor + codegen gate) | n/a (verify step) | ⬜ pending |
| 02-T0 | 02 | 1 | ATTACH-02 | T-116-SC | unpdf package legitimacy (UnJS org, empty postinstall) | checkpoint:human-verify, gate=blocking-human | `npm view unpdf version` / `npm view unpdf scripts.postinstall` + npmjs verify | n/a (gate) | ⬜ pending |
| 02-T1 | 02 | 1 | ATTACH-02 | T-116-06 | Graph helpers route through graphFetch; zod-validated; metadata-only | unit (vitest) | `cd web && npx vitest run lib/outlook/__tests__/attachments.test.ts` | created by task | ⬜ pending |
| 02-T2 | 02 | 1 | ATTACH-02 | T-116-04, T-116-05, T-116-07 | unpdf-first + Orq-Router vision fallback; caps-before-download; fail-soft; no direct LLM key | unit (vitest) | `cd web && npx vitest run lib/automations/attachments/__tests__/extract.test.ts` | created by task | ⬜ pending |
| 03-T1 | 03 | 2 | ATTACH-01 | T-116-08, T-116-09, T-116-10 | Registry-gated capture, no swarm literal, idempotent upsert, fail-soft | unit (vitest) | `cd web && npx vitest run lib/automations/attachments/__tests__/capture.test.ts` | created by task | ⬜ pending |
| 03-T2 | 03 | 2 | ATTACH-01 | T-116-10 | Both ingest routes call shared helper; debtor registry-only | grep + unit (vitest) | `cd web && grep -q "captureAttachmentMetadata" web/app/api/automations/sales-email/ingest/route.ts && grep -q "captureAttachmentMetadata" web/app/api/automations/debtor-email/ingest/route.ts && npx vitest run lib/automations/attachments lib/outlook/__tests__/attachments.test.ts` | modifies existing | ⬜ pending |
| 04-T1 | 04 | 2 | ATTACH-02 | T-116-14 | Registry rewire sales unknown → extractor event | grep gate (DDL) | `grep -q "attachments.extract.requested" supabase/migrations/20260605c_sales_unknown_dispatch_to_extractor.sql && grep -q "swarm_type = 'sales-email'" … && echo OK` | created by task | ⬜ pending |
| 04-T2 | 04 | 2 | ATTACH-02 | T-116-11, T-116-12, T-116-13, T-116-14 | Shared extract-worker loop; fail-soft; replay-safe deterministic keys; registry-derived Stage 2 event (no code literal) | unit (vitest) | `cd web && npx vitest run lib/automations/attachments/__tests__/extract-worker.test.ts lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts` | created by task | ⬜ pending |
| 04-T3 | 04 | 2 | ATTACH-02 | T-116-14 | Worker registered in Inngest serve array | grep + tsc | `cd web && grep -qi "ttachmentExtractor\|stage1_5" web/app/api/inngest/route.ts && npx tsc --noEmit -p .` | modifies existing | ⬜ pending |
| 05-T1 | 05 | 3 | ATTACH-03 | T-116-15 | Attachment text concatenated into body_text only; STAGE2-01 guard green | unit (vitest) + guard | `cd web && npx vitest run lib/automations/sales-email/__tests__/resolve-customer.test.ts && cd <repo> && ./scripts/no-engine-diff-check.sh` | modifies existing | ⬜ pending |
| 05-T2 | 05 | 3 | ATTACH-06 | T-116-17 | AttachmentList renders metadata + status badges; no preview/download | unit (RTL/vitest) | `cd web && npx vitest run 'app/(dashboard)/automations/\[swarm\]/_shell/__tests__/attachment-list.test.tsx'` | created by task | ⬜ pending |
| 05-T3 | 05 | 3 | ATTACH-06 | T-116-17 | Hydrator loads attachments via authenticated SELECT; rendered in Stage 2 audit slot end-to-end | unit (vitest) + grep + tsc | `cd web && npx vitest run lib/bulk-review/__tests__/hydrate.test.ts && grep -q "email_attachments" web/lib/bulk-review/hydrate.ts && grep -q "AttachmentList" web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx && grep -q "attachmentsByEmailId" web/app/(dashboard)/automations/[swarm]/_shell/components/inline-expand-row.tsx && npx tsc --noEmit -p .` | modifies existing | ⬜ pending |
| 06-T1 | 06 | 3 | ATTACH-04 | T-116-18, T-116-19, T-116-20, T-116-21 | Corpus backfill: fail-loud cap, source_gone fail-soft, idempotent, survivor-only extraction via shared Plan 04 helper | unit (vitest) | `cd web && npx vitest run lib/inngest/functions/__tests__/attachments-backfill.test.ts` | created by task | ⬜ pending |
| 06-T2 | 06 | 3 | ATTACH-04 | T-116-18 | Backfill worker registered | grep + tsc | `cd web && grep -qi "ttachmentsBackfill\|attachments-backfill" web/app/api/inngest/route.ts && npx tsc --noEmit -p .` | modifies existing | ⬜ pending |
| 06-T3 | 06 | 3 | ATTACH-04 | T-116-19, T-116-20, T-116-21 | Gated live corpus run (dry-run → bounded live → full); idempotency + survivor-only verified | checkpoint:human-verify (external Graph, corpus scale) | manual (bounded dry-run + live run; see Manual-Only) | n/a (gate) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Sampling continuity check: no run of 3 consecutive code-producing tasks lacks an `<automated>` verify. Tasks 01-T3, 02-T0, 06-T3 are checkpoints (manual by nature — external systems: Supabase advisor/codegen, npm registry, live Graph corpus); each is adjacent to automated-verify tasks, so feedback latency stays inside the 90s budget across every wave.

---

## Wave 0 Requirements

- [x] **No MISSING test references.** Every code-producing task either creates its own test file in the same task (TDD `tdd="true"` tasks: 02-T1, 02-T2, 03-T1, 04-T2, 05-T1, 05-T2, 05-T3, 06-T1) or has a deterministic grep/tsc gate (registration + DDL tasks). No task carries an `<automated>MISSING — …</automated>` marker, so no Wave 0 scaffold step is required.
- [x] **Existing engine guard remains runnable:** `./scripts/no-engine-diff-check.sh` (STAGE2-01) is invoked directly by Plan 05 Task 1's verify and must exit 0 before and after the Stage 2 body_text concat. This is the only pre-existing guard the phase leans on; it is already in the repo (no scaffold needed).
- [x] Conclusion: "Existing infrastructure covers all phase requirements." — `wave_0_complete: true`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migrations applied + RLS advisor 0-ERROR + codegen drift-free | ATTACH-05 | Remote Supabase state + advisor + codegen are environment operations, not unit-testable in vitest | Plan 01 Task 3 checkpoint: apply 20260605 then 20260605b; `npm run check:supabase` (0 ERROR); `npm run codegen && git diff --exit-code`; confirm bucket `public=false` and stage2_dispatch_event matches worker trigger |
| unpdf package legitimacy | ATTACH-02 | npm registry trust decision (slopcheck unavailable at research) | Plan 02 Task 0 blocking-human gate: `npm view unpdf version` / `scripts.postinstall` (empty); verify UnJS org on npmjs.com; then `npm install unpdf` |
| Backfill over live corpus (Graph reads) | ATTACH-04 | External system (Graph), gated write pattern (Phase 112), corpus scale | Plan 06 Task 3 checkpoint: bounded dry-run `{ dry_run:true, limit:50 }` → inspect counts; bounded live `{ limit:50 }` → confirm rows + re-run idempotency; confirm survivor-only extraction; then full run (or defer-with-rationale per SC-4) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicit checkpoints with Manual-Only instructions (01-T3, 02-T0, 06-T3)
- [x] Sampling continuity: no 3 consecutive code-producing tasks without automated verify
- [x] Wave 0 covers all MISSING references (none exist; existing engine guard runnable)
- [x] No watch-mode flags (all commands use `vitest run`, never `--watch`)
- [x] Feedback latency < 90s (full suite ~60s; per-task commands target single files)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — Per-Task Verification Map populated from all six plans' `<automated>` verify blocks; every requirement (ATTACH-01..06) mapped; every STRIDE threat (T-116-01..21 + T-116-SC) referenced by at least one task; no MISSING Wave 0 references.
</content>
