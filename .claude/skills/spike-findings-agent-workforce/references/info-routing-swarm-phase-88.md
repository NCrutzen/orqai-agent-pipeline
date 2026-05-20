# info-routing swarm — Phase 88 implementation blueprint

> Synthesises Spikes 001-004 (2026-05-19) into a buildable recipe for onboarding `info@smeba.nl` as its own swarm (`swarm_type='info-routing'`) on the existing cross-swarm agentic pipeline architecture.
>
> The full proposal doc with open plan-time questions lives at `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`. This blueprint is the **how**; the proposal is the **why + decisions deferred**.

## Requirements (non-negotiable)

These are locked from the spike session — do not relitigate during Phase 88 planning:

- **info-routing is its own swarm**, not a brand variant of debtor-email. `swarm_type='info-routing'` with `entity_brand='smeba'`.
- **Stage 3 ships in shadow with a single `triage_required` intent.** Real department vocabulary (`to_sales`, `to_finance`, etc.) emerges through Phase 86's `intent_proposals_v1` discovery surface — **never hand-curated from spike data**. (Locked principle 2026-05-19, ROADMAP.md:571.)
- **No new Stage 1 code path.** All Stage 1 dispatch is registry-only via `swarm_noise_categories` inserts. If any new code is needed in `classify.ts` / `classifier-screen-worker.ts` / `classifier-verdict-worker.ts`, that's a cross-swarm architecture bug — fix it there, not in info-routing.
- **No Stage 2 entity resolver.** `swarms.stage2_entity_resolver = null`; Stage 2 short-circuits to an empty `PipelineStageContext`. info-inbox is not customer-bound.
- **No Stage 4 forward-handler in Phase 88.** Terminal action is "surface in Bulk Review; operator forwards manually." Stage 4 ships after vocabulary clusters in Phase 86 and shows stable shape for ≥2 cycles.
- **Backfill is bounded.** 90-day window for analysis; production ingest is the standard Outlook business-hours cron going forward.

## Hard prerequisites (cannot start Phase 88 without all four)

| Prereq | What it ships | Why required |
|---|---|---|
| v8.1 Phase 78 | Build-time codegen for `swarm_intents` + `swarm_noise_categories` literal-union TS types | "Registry inserts only" requires codegen — otherwise we hand-edit TS consts |
| v8.1 Phase 84 | `swarms.tenant_domains` column + own-domain loopback rule | 17.9% of Smeba inbound is own-domain workflow CC; no honest handling without 84's column |
| v8.1 Phase 85 | Stage 3 prompt v3 + V3 schema (`intent_proposal`, `proposal_reason`) | Phase 88's shadow router inherits this scaffolding directly |
| v8.1 Phase 86 | `intent_proposals_v1` view + Bulk Review cluster tab (cross-swarm) | Where info-routing's vocabulary emerges |

## How to Build It

### Step 1 — backfill the corpus (already done)

Spike 001 already wrote 90d of `info@smeba.nl` into `email_pipeline.emails`. Idempotent on `source_id`. To re-run or extend the window:

```bash
cd web/debtor-email-analyzer
# 1. probe volume first (no writes)
npx tsx src/spike-001-probe.ts
# 2. then bounded backfill (LOOKBACK_DAYS const in source)
npx tsx src/spike-001-backfill.ts
# 3. stats verification
npx tsx src/spike-001-stats.ts
```

Connection ID `56014785` (`zapier@moyneroberts.com`) has Graph mailbox.Read on `info@smeba.nl` cross-tenant — verified during spike session. Note: `GET /users/info@smeba.nl` directory lookup 404s (Azure AD doesn't resolve the alias), but `GET /users/info@smeba.nl/mailFolders/inbox/messages` works fine.

### Step 2 — register the swarm

After Phase 78's codegen lands, INSERT rows in this order:

```sql
-- 2a. Brand registry: Smeba is already a known entity_brand; just register the new swarm.
INSERT INTO public.swarms (swarm_type, entity_brand, tenant_domains, stage2_entity_resolver, ...)
VALUES (
  'info-routing',
  'smeba',
  ARRAY['smeba.nl','smeba-fire.be','moyneroberts.com','fire-control.nl','berki.nl','sicli-noord.be','sicli-sud.be']::text[],
  NULL,  -- no Stage 2 entity resolver
  ...
);

-- 2b. Stage 1 noise categories: 5 shared verbatim with debtor-email + 1 new + own_domain_loopback handled by Phase 84's separate rule.
INSERT INTO public.swarm_noise_categories (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
VALUES
  ('info-routing','spam',                          'Spam',                 'Spam',                 'categorize_archive', NULL, 10),
  ('info-routing','payment_admittance',            'Payment Admittance',   'Payment Admittance',   'categorize_archive', NULL, 20),
  ('info-routing','auto_reply',                    'Auto-reply',           'Auto-Reply',           'categorize_archive', NULL, 30),
  ('info-routing','ooo_temporary',                 'OOO (temporary)',      'OoO — Temporary',      'categorize_archive', NULL, 40),
  ('info-routing','ooo_permanent',                 'OOO (permanent)',      'OoO — Permanent',      'categorize_archive', NULL, 50),
  ('info-routing','generic_noreply_notification',  'System notification',  'System Notification',  'categorize_archive', NULL, 60),
  ('info-routing','unknown',                       'Triage required',      NULL,                   'swarm_dispatch',     'info-routing/triage.requested', 99);

-- 2c. Stage 3 intents: a single placeholder. Real intents emerge through Phase 86.
INSERT INTO public.swarm_intents (swarm_type, intent_key, display_label, handler_event)
VALUES ('info-routing','triage_required','Triage required (operator decides)', NULL);
```

Run `npm run codegen` after each batch to keep `*.generated.ts` in sync. CI gate `npm run codegen && git diff --exit-code` catches drift.

### Step 3 — wire the Outlook ingest

Add `info@smeba.nl` to whatever the Phase 68+ successor of `SHARED_MAILBOXES` is (today that's `debtor.labeling_settings.mailboxes` keyed by `swarm_type`). The existing business-hours cron picks up the new mailbox without code change.

### Step 4 — verify the closed-list invariant

After codegen, three places must agree on the noise-key enum:

1. `web/lib/swarms/noise-categories.generated.ts` (literal union)
2. `swarm_noise_categories.category_key` rows in Postgres
3. The `enum` field in the Orq agent `stage-1-category-classifier`'s `response_format: json_schema`

The codegen pattern from Phase 78 D-03 enforces 1 ↔ 2 automatically. The Orq schema (3) regenerates from the same registry read — also covered by Phase 78.

### Step 5 — turn it on in shadow

`info-routing` swarm enabled with Stage 1 + Stage 3 active but Stage 4 = "surface in Bulk Review". Run for 2-4 weeks. Phase 86's discovery surface clusters `intent_proposal` outputs. When a cluster hits the promotion threshold (≥10 in 7 days per Phase 79 design), an operator promotes it to `swarm_intents` with a stub `handler_event`. The first plausible candidate (per Spike 004) is finance-misroute — ~3 emails/day.

## What to Avoid

- **Do NOT add a per-swarm if-branch to `classify.ts` or any classifier worker.** The architecture is registry-driven on purpose. If you find yourself wanting to special-case info-routing in the worker code, the cross-swarm architecture is leaking — fix it upstream.
- **Do NOT hand-curate router intent vocabulary** from Spike 004's labels. Those labels ("sales", "finance", "HR") are *descriptive shorthand for what the operator saw in 30 samples*, not registry keys. Promoting them directly would silently violate the locked 2026-05-19 principle.
- **Do NOT ship `marketing_newsletter`, `meta_facebook_notification`, `delivery_failure`, or a separate `m365_spam_tag` rule.** Spike 002 data killed them — M365's `[SPAM]` filter catches all of these upstream. Adding them adds maintenance with zero hit rate.
- **Do NOT trust subject-regex rules to catch phishing.** Spike 003's `meta_facebook_notification` regex caught a phishing impersonation (sender `r1.deped.gov.ph`) but missed a real Meta notification (there weren't any). Subject regexes are tuned for business patterns, not security. Phishing concerns belong in Stage 0 (Phase 64), not Stage 1.
- **Do NOT skip Phase 84.** 17.9% of Smeba inbound is own-domain loopback. Without Phase 84's `swarms.tenant_domains` column those 950 emails reach Stage 3 and get force-classified — same bug as debtor-email today.
- **Do NOT ship a Stage 2 entity resolver "to be safe."** info-inbox is not customer-bound; running an iController lookup against every inbound is wasted Browserless time. Add Stage 2 later if Spike 004's "20% finance" estimate proves predictive in production.
- **Do NOT use static `import { x } from "../../lib/.../foo.ts"` in tsx + Node 24 cross-package scripts** — it fails silently. Spike 003 hit this. Use dynamic `import()` if you need cross-package access; otherwise don't. This is a spike-code-only escape hatch.

## Constraints

| Constraint | Value | Source |
|---|---|---|
| Zapier connection for cross-tenant Graph | `56014785` (`zapier@moyneroberts.com`) | Spike 001 probe |
| Graph directory lookup `GET /users/<alias>` | 404s on Smeba alias; **use `/users/<alias>/mailFolders/...` instead** | Spike 001 probe |
| Inbound volume | 61.2 emails/day (90d avg), 24,134 inbox all-time | Spike 001 |
| Sent volume | 188 over 90 days (receive-only inbox) | Spike 001 |
| Thread shape | 96.1% single-msg, max length 8 — broadcast not conversational | Spike 001 |
| Stage 1 noise coverage (expected) | 76.9% of inbound (with all 7 rules including Phase 84's `own_domain_loopback`) | Spike 002 |
| Router workload after Stage 1 | ~14 emails/day arriving, ~7/day real business | Spike 004 |
| Largest real router bucket | Finance / payment / invoice-copy (~20% of post-noise, ~3/day) | Spike 004 |
| Cold outreach in post-noise residue | ~33% of post-noise (~5/day) | Spike 004 |
| Phishing leakage in post-noise residue | ~7% in 30-sample (~1/day) — Stage 0 / Phase 64 concern | Spike 004 |
| `payment_admittance` hit rate on info inbox | 1.2% (62 emails / 90d) — meaningful, not zero | Spike 003 |
| `[SPAM]` share | 54.5% (2,899 / 90d). Single largest Stage 1 rule | Spike 001, 002 |
| Own-domain loopback share | 17.9% (950 / 90d) — not noise, internal workflow CC | Spike 002, 003 |

## Open Questions (defer to `/gsd-discuss-phase 88`)

1. Does `generic_noreply_notification` ship info-routing-only or get promoted cross-swarm?
2. Outlook label vocabulary — share debtor-email's labels or info-routing-specific labels?
3. `payment_admittance` archive-vs-forward — debtor-email archives; should info-routing forward to finance instead (since this IS the misroute case)?
4. Shadow-mode duration before flipping live? (Recommendation: 2 weeks = ~200 router decisions.)
5. Block Phase 88 on Phase 64 (Stage 0), or ship without? (Recommendation: ship without, ~1/day phishing risk acceptable.)

## Origin

Synthesized from spikes: 001, 002, 003, 004.
Source files available in: `sources/001-smeba-info-backfill/`, `sources/002-smeba-info-noise-patterns/`, `sources/003-smeba-vs-debtor-noise-overlap/`, `sources/004-smeba-non-noise-shape/`.
Full proposal doc: `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`.
