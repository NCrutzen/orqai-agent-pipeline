---
created: 2026-06-18
type: tracking / do-not-forget
area: v9.5-stage2-resolver-correctness
phase_origin: 121
related: [120-HUMAN-UAT, 123-04-SUMMARY, "2026-06-17-candidate-details-callback-and-clean-eval-rerun"]
---

# V9.5 loose ends — MUST NOT FORGET

Consolidated open items as of 2026-06-18 (session: 121 attachment-borne-ids).
None block each other except where noted. Keep this until all four are closed.

## 1. Phase 121-03 build-acceptance checkpoint — OPEN (awaiting operator akkoord)

- Plan 121-03 (`autonomous: false`) Task 3 is a **blocking human-verify** gate that was
  reached, surfaced, and **NOT** auto-approved. Build + verifiable-now suite are green;
  ATID-04 (live confirmation) rides Phase 123.
- **Action:** operator types "akkoord/accepted" → mark Task 3 accepted, finalize
  121-03 SUMMARY checkpoint status + STATE + ROADMAP (plan→complete), commit closure.
- **Resume signal:** "121 akkoord".
- File: `.planning/phases/121-attachment-borne-identifier-extraction/121-03-ACCEPTANCE.md`

## 2. Clean frozen-100 resolver-correctness re-run — UNBLOCKED, NOT YET RUN

- Closes the deferred Phase-123 / Phase-120 **debtor** correctness acceptance (the absolute
  `%` number that 123-04 left deferred — see `2026-06-17-candidate-details-callback-...md`).
- **De-risked:** with `corroboration` enabled on debtor, the resolver runs the collect path
  (`noopTiebreak`) → `candidate_details` is NOT called → the disabled Zap is irrelevant. The
  harness (`web/scripts/eval/resolver-correctness-gate.ts`, runs `debtorP0Config` whose
  `.corroboration` is in lockstep with the live seed) exercises exactly this path.
- **Env staged (2026-06-18):** `web/.env.local` copied into THIS 121 workspace from the main
  `/Volumes/Developer/agent-workforce` checkout (gitignored; `DEBTOR_FETCH_WEBHOOK_SECRET` +
  Supabase + `NEXT_PUBLIC_APP_URL`=https://agent-workforce-eosin.vercel.app present). So it can
  run from here WITHOUT touching the main checkout / the parallel Phase-122 session.
- **Command:** `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report`
  (writes `.planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md`; READ-ONLY,
  makes ~100 LIVE NXT/Zapier reads via async callback to the prod callback route).
- **Status note (2026-06-18):** an attempt to run it was blocked by the harness auto-mode
  safety classifier (production-access guard) even though the operator said "Ga". Needs an
  explicit operator approval or a Bash permission rule, OR run by the operator via `! <cmd>`.
- **Targets to confirm on the run:** gold non-regression `goldRegressed === 0`
  (#16/#19/#28/#29/#86); #24 resolves-or-demotes (never confident-wrong AUTO); the 4
  confident-wrong AUTO (#2/#85/#95/#97) DEMOTE; bucket-B (12) resolve-or-degrade; overall
  correct ≥ 64% baseline.
- This run is also the **pre-122 baseline** — see item 4.

## 3. `candidate_details` code-retire — DEFERRED (cleanup, not urgent)

- It is **config-dead** now (corroboration → `noopTiebreak`; single prod call site
  `engine.ts:380` lives only in the unreachable `runLlmTiebreak`). Still present in code
  (`NxtToolId`, the dead branch) + a `public.zapier_tools` row.
- **Action (later, own small phase):** drop from `NxtToolId`, remove `runLlmTiebreak` /
  `lookupCandidateDetails`, delete the `zapier_tools` row — mirrors how Phase 123 retired
  `contact_lookup`/`identifier_lookup`.
- **Collision guard:** touches `engine.ts` → trips the no-engine-diff gate (needs a donor
  re-baseline). **Do NOT do this while the Phase-122 session is editing the resolver/engine.**
  Schedule AFTER Phase 122 merges.

## 4. Post-122 re-run — AFTER Phase 122 merges

- Phase 122 (cross-brand-scope resolution) is being built in a separate session.
- After it merges, re-run the same gate (item 2 command) and compare against the item-2
  baseline to measure the cross-brand improvement on bucket-C (wrong-brand-entity, 9 rows).
- Acceptance lives in the V9.5 milestone: material reduction of the 36 Nee+Twijfel over the
  frozen 100 after 120/121/122 all land.
