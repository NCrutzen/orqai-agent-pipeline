# Phase 121 — Attachment-Borne Identifier Extraction: Build Acceptance

This document is the eval-grounded acceptance for the Phase 121 build (#24
extraction-gap + many-customer guard), split into what is **verifiable NOW**
(without the live debtor fixture or any outward NXT/Zapier call) and what is
**DEFERRED TO PHASE 123** (the live debtor correctness-gate re-run, blocked).

Requirements covered: ATID-01 (attachment-borne IDs reach the engine body),
ATID-02 (no engine edit / STAGE2-01), ATID-04 (live confirmation — rides Phase 123).

---

## (A) VERIFIABLE NOW (this plan)

All of the following are green **without the live fixture and without any outward
NXT/Zapier call** (every supabase admin client + exceljs + unpdf + Orq Router is
mocked):

### Green checks

| Check | Command | Result |
|-------|---------|--------|
| `.xlsx` + `text/csv` extraction unit tests (Plan 02) | `cd web && npx vitest run lib/automations/attachments/__tests__/extract.test.ts` | green (25 tests) |
| Fold test — extracted `.xlsx` lands in `body_text` under the UNTRUSTED label (Task 1, ATID-01) | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts` | green (30 tests) |
| 358-distinct-root many-customer demotion proof (Plan 02) | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/corroborate-many-customer.test.ts` | green (3 tests) |
| No-engine-diff gate (ATID-02 / STAGE2-01) | `./scripts/no-engine-diff-check.sh` | exit 0 — engine/config/steps byte-identical to donor `b816c627` |

### One-command verifiable-now suite

```bash
cd web && npx vitest run \
  lib/automations/attachments/__tests__/extract.test.ts \
  lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts \
  lib/agentic-pipeline/resolve/__tests__/corroborate-many-customer.test.ts
```

**Result (2026-06-18):** `Test Files 3 passed (3) · Tests 58 passed (58)`.

### Acceptance statement

The #24 case is accepted on what is verifiable now:

- **Its extraction-gap is closed** — an `.xlsx` (and `.csv`) attachment now
  extracts to `extraction_status='extracted'` text (Plan 02), and the 116-05 fold
  carries that text — filename-first, under the `--- ATTACHMENTS (UNTRUSTED DATA …`
  fence — into the resolver's `body_text` so the engine's extraction regexes run
  over xlsx-borne identifiers (ATID-01). Proven end-to-end (mocked DB) by the
  Task-1 fold test, which asserts both the `statement.xlsx` filename and the
  `17008876`-style invoice token reach `body_text`.
- **Its many-customer guard holds** — a ~358-distinct-root spreadsheet flood
  demotes below AUTO via the corroboration disagreement path (`confidence !==
  "high"`), and the number back-search fails closed on ≥2 distinct roots
  (`distinctRoots !== 1 → null`). The #24 many-customer case **cannot land a
  confident-single AUTO**. STRUCTURAL — no new adapter-side code (Plan 02 decision).
- **No engine edit** — `engine.ts` / `config.ts` / `steps/*` / `dynamic.ts` are
  byte-identical to the donor (ATID-02 / STAGE2-01 holds; gate exit 0).

All of the above is established **without the live fixture and with NO outward
NXT/Zapier call** (the Task-2 live-lookup gate from 121-01 is honored).

---

## (B) DEFERRED TO PHASE 123 (blocked)

The **LIVE debtor correctness-gate re-run over the frozen 100** is the remaining
acceptance item. It is **DEFERRED TO PHASE 123** and is NOT run in Phase 121.

### Exact deferred command

```bash
cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report
```

(`--rows` / `--limit` drive subsets; `--report` writes `RERUN-FINDINGS.md` over
all 100 frozen rows.)

### Precondition (the Phase-123 gate)

This re-run is unblocked ONLY when BOTH hold:

1. **Debtor migrated to `resolve_candidates`.** The eval fixture is DEBTOR mail,
   but the live debtor swarm resolves via the legacy `contact_lookup` /
   `identifier_lookup` transport (`debtorP0Config.auto_safe_kinds: []` → legacy
   path), NOT the generic `resolve_candidates` substrate this phase's
   corroboration cares about. Debtor must be migrated onto `resolve_candidates`
   (the Phase-123 work) before the gate exercises the corroboration path.
2. **`DEBTOR_FETCH_WEBHOOK_SECRET` present** in `web/.env.local`. The harness makes
   LIVE NXT/Zapier calls; this workspace has no such secret.

### Targets the deferred re-run must hit

- **Gold-signal non-regression:** `goldRegressed === 0` over rows
  **#16 / #19 / #28 / #29 / #86** (these ALREADY-RESOLVE; must stay correct).
- **#24 target:** resolves correctly **OR** demotes to human / multi-candidate —
  never a confident-wrong AUTO. (The structural demotion is already proven in
  section A; the live re-run confirms it end-to-end over the real fixture.)
- **#83 precedence verify (verify-only, NOT a 121 change):** factuur-in-subject
  outranks the sender — a self-auth / Phase-120 ranking property. Confirmed, not
  modified, by this phase.

### Why it is blocked NOW

The debtor legacy transport + the absent `DEBTOR_FETCH_WEBHOOK_SECRET` (RESEARCH
Pitfall 6) mean the live correctness gate cannot exercise the corroboration path
in this workspace today. Running it here would either hit the legacy lookup (not
this phase's surface) or fail on the missing secret.

**NO outward NXT/Zapier call is made in this phase.** The live harness is NOT
executed here; the Task-2 live-lookup gate from 121-01 still applies. This blocked
manual acceptance item is exactly what the `autonomous: false` flag on Plan 03
exists for — it is tracked as a Phase-123 acceptance item, not a silent gap
(ATID-04 confirmation rides Phase 123).
