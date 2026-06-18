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
- **Run 1 finding (2026-06-18 ~09:00, ABORTED):** first attempt read RED with massive
  `nxt lookup timed out after 20000ms` — but a DB check showed the "timed-out" request_ids
  ALL completed, just at **28–63s** (substrate slow/congested right after the Zapier
  reconnect). NOT a resolver regression — the harness's default 20s wait was simply too
  short. Killed before it overwrote RERUN-FINDINGS.md.
- **Run 2 finding (2026-06-18, ABORTED): `.env.local` does NOT work.** `WAIT_TIMEOUT_MS`
  is frozen at MODULE-LOAD (`nxt-zap-client.ts:33-36`, IIFE reading
  `process.env.NXT_LOOKUP_WAIT_MS`, else 20_000). ES imports run BEFORE the harness's
  own `loadEnvLocal()`, so a `.env.local` entry is parsed too late → still 20s.
- **CORRECT mitigation: pass it as a REAL shell env var inline**, so it's in `process.env`
  before module init (exactly what the code comment intends — "build-time instruments can
  raise it via NXT_LOOKUP_WAIT_MS"). No cap in the code. Command:
  `cd web && NXT_LOOKUP_WAIT_MS=120000 npx tsx scripts/eval/resolver-correctness-gate.ts --report`
  (The `.env.local` line is inert for this purpose — harmless, ignore it.)
- **Root cause CONFIRMED (not Zapier congestion — that was an unverified assumption):**
  a direct `resolver_index` lookup over the NXT SQL route returned sub-second (2026-06-18
  ~09:27), so NXT is healthy. The 28–63s is the **documented long tail** of the
  resolve_candidates Zap — `nxt-zap-client.ts:29-32` literally says it "averages ~8.5s
  with a tail past 20s" and that build-time instruments MUST raise `NXT_LOOKUP_WAIT_MS`
  so the tail doesn't read as false timeouts. The default 20s simply clips that tail.
  No "wait for off-peak" needed — the tail is normal; the inline 120s wait covers it.
- **Tooling note:** the harness run + permission-rule edits keep hitting the auto-mode
  safety classifier. Reliable path: operator runs the corrected command via `! <cmd>`, OR
  adds the allow-rule themselves.

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

## 2b. CLEAN RE-RUN DONE 2026-06-18 — result is cross-brand-scope, NOT a regression

Ran the gate with inline `NXT_LOOKUP_WAIT_MS=120000` (0 timeouts, transport-clean,
substrate healthy: 153/167 resolve_candidates returned matches). Headline: **18%
(14/79), gold "regression" 35/46**, but demotion targets PASS (confident-wrong 4/4
demoted, bucket-B 12/12). `RERUN-FINDINGS.md` written.

**ROOT CAUSE (verified, rock-solid — supersedes BOTH the candidate_details AND the
attachment hypotheses):** the gold failures are **cross-brand scope**, Phase 122's remit.
- Gold failures by mailbox: **smeba-fire 23, smeba 11**. Passes: berki 7, smeba 3,
  smeba-fire 1, fire-control 1.
- **smeba-fire = 23/24 gold rows FAIL.** That mail hits `debiteuren@smeba-fire.be` → eval
  scopes `[SF]`. The invoices are registered under scope **SB** (verified in
  `resolver_index`: e.g. #11 `17341213`→BX518399/SB, #13 `17341225`→BX484480/SB,
  #18 `17339268`→BX518399/SB — all unique, ACTIVE, correct party, invoice IS in the email
  body). Scoped-on-SF → miss → null. Resolver fails CORRECTLY closed (no guess).
- NOT a regression, NOT attachments (identifiers in body), NOT transport (0 timeouts,
  matches returned), NOT missing data (invoices in index). Pure scope mismatch.
- **The 11 smeba failures are a SEPARATE, smaller cluster** (smeba is already SB scope, so
  not cross-brand) — likely self-reported-klantnummer extraction (e.g. #6: body had
  location/report numbers, no clean klantnummer). Not yet root-caused; smaller priority.

**Implications:**
- The "18% RED" the prior eval (123-04) blamed on candidate_details callbacks is actually
  dominated by cross-brand scope. Phase 122 should recover ~23 of the 34 gold failures.
- Phase 122's impact is BIGGER than the roadmap's bucket-C estimate (9 rows) — it's ~23+.
- **Eval-harness caveat:** the gate scopes purely from mailbox via MAILBOX_MAP
  (smeba-fire→SF). It does NOT fold attachment text into body_text and passes
  `conversation_id: null` (no thread context). For a fully production-equivalent gate these
  should be added, but they are NOT the cause of the current RED (identifiers were in body).

## 4. Post-122 re-run — AFTER Phase 122 merges

- Phase 122 (cross-brand-scope resolution) is being built in a separate session.
- After it merges, re-run the same gate (item 2 command) and compare against the item-2
  baseline to measure the cross-brand improvement on bucket-C (wrong-brand-entity, 9 rows).
- Acceptance lives in the V9.5 milestone: material reduction of the 36 Nee+Twijfel over the
  frozen 100 after 120/121/122 all land.
