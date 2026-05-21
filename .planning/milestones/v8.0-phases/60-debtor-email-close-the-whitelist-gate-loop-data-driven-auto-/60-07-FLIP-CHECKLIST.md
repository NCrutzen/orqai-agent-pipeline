# 60-07 Flip Checklist

**Status:** PENDING — calendar-gated
**Created:** 2026-04-28 (Wave 4 plan-level scaffold)
**Owner:** Nick Crutzen

Two operator-gated cleanups close out Phase 60 per D-28 step 4 and D-19.

---

## Task 1 — Drop FALLBACK_WHITELIST from `web/lib/classifier/cache.ts`

**Earliest run date:** 2026-04-29 (1 calendar day after table-backed whitelist began serving — i.e., 1 day after Phase 60 ships)
**Trigger:** Confirmed clean run window. The fallback path was NOT exercised AND no errors logged.

### Pre-drop verification (operator fills)

- [ ] Date of first table-backed read: __________
- [ ] Date of confirmed-clean window: __________
- [ ] Vercel logs show ZERO instances of "FALLBACK_WHITELIST" warning during the window: __________
- [ ] `select count(*) from classifier_rules where swarm_type='debtor-email' and status='promoted'` returns ≥ 6 (the seeded rules): __________
- [ ] Cache TTL behavior verified (rules added in DB appear within 60s on next ingest): __________

### Drop steps

1. Edit `web/lib/classifier/cache.ts` — delete the `FALLBACK_WHITELIST` constant + the `if (cache empty) return FALLBACK_WHITELIST` branch.
2. Run `cd web && pnpm tsc --noEmit -p .` — must be clean.
3. Run `cd web && pnpm vitest run lib/classifier` — must be green (cache.test.ts may need a small edit if it asserts the fallback exists; update to assert the new "throw on empty" behavior or whatever the safer fallback is).
4. Commit: `feat(60-07): drop FALLBACK_WHITELIST after 1-day clean run`.
5. Deploy to production (Vercel auto-deploy on main).
6. Watch Vercel logs for 1 hour post-deploy — no errors expected.

- [ ] Drop committed: __________ (commit hash)
- [ ] Deployed: __________
- [ ] 1-hour post-deploy log review clean: __________

---

## Task 2 — Flip `CLASSIFIER_CRON_MUTATE=true` in Vercel

**Earliest run date:** 2026-05-12 (14 days after Phase 60 ships)
**Trigger:** 14-day shadow window with plausible cron evaluations.

### Pre-flip verification (operator fills)

- [ ] Date of first cron run in shadow mode: __________
- [ ] Date of 14-day mark: __________
- [ ] `select count(*) from classifier_rule_evaluations where evaluated_at >= now() - interval '14 days'` returns ≥ 14 × (active-rule-count): __________
- [ ] Spot-check 5 random `shadow_would_promote` rows on `/automations/classifier-rules` dashboard — agree these would have been correct promotions: __________
- [ ] Spot-check `shadow_would_demote` rows (if any) — agree these reflect real degradation: __________
- [ ] No demotion events on rules with high traffic: __________
- [ ] Manual blocks (via dashboard) appear in `classifier_rules.status='manual_block'` correctly: __________

### Flip steps

1. Vercel Dashboard → Project → Settings → Environment Variables.
2. Add or edit `CLASSIFIER_CRON_MUTATE` for **Production**: value `true`.
3. Redeploy (or wait for next deploy).
4. Wait for next cron tick (next business-day 06:00 Europe/Amsterdam).
5. Verify in `classifier_rule_evaluations`: an entry with `action='promoted'` or `action='demoted'` appears (instead of `shadow_would_*`).
6. Verify in `classifier_rules.status` and `classifier_rules.promoted_at`: rule status updated to `promoted` and timestamp set.

- [ ] Env var flipped: __________
- [ ] Deployed: __________
- [ ] First live cron tick: __________
- [ ] Live mutation observed: __________

### Rollback runbook (if flip causes issues)

1. Vercel env var: set `CLASSIFIER_CRON_MUTATE=false` (or unset).
2. Redeploy.
3. Manually correct any incorrect `classifier_rules.status` rows via Studio: `UPDATE classifier_rules SET status='candidate' WHERE rule_key=...`.
4. The `agent_runs.human_verdict` telemetry continues to flow regardless — no data loss.
5. Investigate via `classifier_rule_evaluations` history; resume shadow mode until issue understood.

---

## Closeout

After BOTH tasks done:

- [ ] Phase 60 fully shipped — `/gsd-verify-work 60` runs clean
- [ ] STATE.md updated to mark Phase 60 complete
- [ ] ROADMAP.md Phase 60 entry marked `[x]`
- [ ] This checklist file updated with all timestamps as audit trail
