---
slug: ai-held-label-color-gray-blue
status: resolved
mode: find_and_fix
trigger: |
  DATA_START
  waarom zijn sommige AI: Held labels grijs en sommige blauw — ze zouden
  allemaal blauw moeten zijn.

  (Screenshot: info@smeba.nl Outlook inbox. Category chips on messages:
   - GRAY chips:  "AI: held → administratie", "AI: held → crediteuren",
                  "AI: held → debiteuren"
   - BLUE chips:  "AI: triage", "AI: held → order_entry",
                  "AI: held → inspecties", "AI: held → storingen"
   The color tracks the category NAME, not the individual message.)
  DATA_END
created: 2026-06-25
updated: 2026-06-25
---

# Debug: ai-held-label-color-gray-blue

## Symptoms

- info@smeba.nl Outlook inbox: the "AI: held → X" category chips render in
  two colors. Operator expects all blue.
- Color is consistent PER category name (every "administratie" chip is gray,
  every "order_entry" chip is blue) — so it is NOT per-message randomness.
- GRAY set: administratie, crediteuren, debiteuren (these read like the
  DEBTOR-pipeline routing destinations).
- BLUE set: triage, order_entry, inspecties, storingen (these read like the
  info-routing / sales routing destinations).

## Current Focus

reasoning_checkpoint:
  hypothesis: "Outlook renders a category chip gray when the category NAME is
    not present in the mailbox masterCategories list with a color. The 5 gray
    buckets (administratie, crediteuren, debiteuren, facilitair, hr) were added
    to the info-routing routing_destinations registry by migration
    20260625_info_routing_real_routing_destinations.sql but the master-category
    provisioning (ensure-info-routing-categories.ts → ensureRoutingMasterCategories)
    was never re-run, so their `AI: held → <bucket>` names are absent from
    masterCategories and render gray. The blue buckets pre-dated that migration
    and were provisioned with preset5."
  confirming_evidence:
    - "Live GET /outlook/masterCategories on info@smeba.nl AND info@fire-control.nl:
      both contain preset5 (blue) entries for held/routed variants of algemeen,
      inspecties, opleidingen, order_entry, sollicitaties, storingen, verkoop —
      and are MISSING administratie, crediteuren, debiteuren, facilitair, hr."
    - "routing_destinations registry (live, REST) lists administratie/crediteuren/
      debiteuren/facilitair/hr as swarm_type=info-routing, active=true — they ARE
      registry buckets, NOT debtor-pipeline destinations as the symptom guessed."
    - "Migration 20260625_info_routing_real_routing_destinations.sql (today) INSERTs
      exactly administratie/crediteuren/debiteuren/facilitair/hr (TIER 2). Its
      post-apply note lists codegen + agent redeploy but NOT re-running the
      category-seed script."
    - "ensureRoutingMasterCategories is invoked ONLY by the manual one-shot script
      scripts/ensure-info-routing-categories.ts (grep across web/lib + web/app =
      no cron/inngest/route caller). So registry growth does not auto-provision."
  falsification_test: "If re-running ensure-info-routing-categories.ts created
    nothing new for the gray buckets, or the gray buckets were already in
    masterCategories, the hypothesis is wrong. (Expectation: it POSTs exactly the
    held/forwarded/dedup variants of the 5 missing buckets with preset5.)"
  fix_rationale: "Root cause is missing masterCategories rows for the new buckets,
    not message-stamp logic (stamps are correct, names match). The fix is to
    provision the missing names with preset5 by re-running the existing idempotent
    ensureRoutingMasterCategories for the current registry — addresses the root
    cause directly. Plus prevent recurrence: the migration's runbook omitted the
    seed step."
  blind_spots: "Outlook clients cache the master category color; an already-open
    Outlook session may keep showing gray until refresh/restart — operator must
    verify after a refresh. Also: only addresses info@ mailboxes; if other
    mailboxes stamp these names they'd need their own provisioning (none do today)."

## Evidence

- timestamp: 2026-06-25
  checked: "web/lib/outlook/client.ts — category stamp + master-category code"
  found: "Two seams: (1) categorizeEmail / mergeRoutingCategory / buildRoutingCategory
    only PATCH message.categories by NAME (gray unless name is registered).
    (2) ensureRoutingMasterCategories(mailbox, buckets) GET-before-POSTs the
    held/forwarded/dedup/triage/algemeen names into /outlook/masterCategories with
    color=ROUTING_CATEGORY_PRESET_COLOR='preset5'. Color is a mailbox-level master
    property — cannot be set at stamp time."
  implication: "Chip color depends entirely on whether the name exists in
    masterCategories with preset5 — confirms the master-list hypothesis."

- timestamp: 2026-06-25
  checked: "callers of ensureRoutingMasterCategories across web/lib + web/app"
  found: "ONLY scripts/ensure-info-routing-categories.ts (manual one-shot, both
    info@ mailboxes, buckets sourced live from routing_destinations minus unrouted).
    No cron/inngest/API caller."
  implication: "Provisioning is manual and one-shot — registry growth does NOT
    re-provision automatically. Drift is structurally guaranteed when buckets are
    added without re-running the script."

- timestamp: 2026-06-25
  checked: "live routing_destinations (REST, service role) for info-routing"
  found: "administratie, crediteuren, debiteuren, facilitair, hr are all
    swarm_type=info-routing, active=true. Symptom's debtor-vs-info guess was wrong:
    all are info-routing buckets."
  implication: "Same swarm, same script, same preset — so the gray/blue split is
    NOT a two-code-path issue. It is a timing/coverage gap: some buckets seeded,
    some not."

- timestamp: 2026-06-25
  checked: "live GET /users/{info@smeba.nl,info@fire-control.nl}/outlook/masterCategories"
  found: "Both mailboxes contain preset5 entries for held/routed/dedup variants of
    {algemeen, inspecties, opleidingen, order_entry, sollicitaties, storingen,
    verkoop} + AI: triage + AI: algemeen. Both are MISSING all variants of
    {administratie, crediteuren, debiteuren, facilitair, hr}."
  implication: "DIRECT confirmation: the gray buckets have NO masterCategory entry
    at all → Outlook falls back to no color (gray). The blue buckets are registered
    with preset5."

- timestamp: 2026-06-25
  checked: "supabase/migrations/20260625_info_routing_real_routing_destinations.sql"
  found: "Today's migration INSERTs exactly administratie/crediteuren/debiteuren/
    facilitair/hr (TIER 2) + inspecties/fire-control. Post-apply runbook lists
    `npm run codegen` + agent redeploy but NOT re-running the category-seed script."
  implication: "Root cause pinned: registry grew today; master categories were
    never re-seeded because the runbook omitted that step. The seed script is
    idempotent so re-running it provisions exactly the 5 missing buckets."

## (original hypothesis retained below)

- hypothesis: Outlook chip color is driven by the mailbox **master category
  list** (`/me/outlook/masterCategories` in Microsoft Graph), which is keyed
  by category *name* and carries the color preset. When code applies a
  category to a message by name via Graph (`message.categories = [...]`),
  Graph does NOT auto-register that name in masterCategories. A name that is
  absent from masterCategories (or present without a colored preset) renders
  as a GRAY/uncolored chip; a name registered with e.g. `preset7` (blue)
  renders blue. So the gray names were never registered (or registered
  colorless) in the mailbox master category list, while the blue names were.
  The gray-set/blue-set split (debtor destinations vs info-routing/sales
  destinations) suggests two code paths apply categories but only one
  registers + colors them in masterCategories.
- test:
  (a) grep the codebase for where Outlook categories are applied to messages
      and where masterCategories is created/seeded (terms: `masterCategories`,
      `categories`, `preset`, `AI: held`, `outlookCategory`, the routing
      destination labels). Identify which swarm/handler writes each name.
  (b) confirm whether any code path adds the per-destination category names to
      masterCategories WITH a color preset, vs only setting them on messages.
  (c) check the live mailbox masterCategories list (via the Graph/Zapier
      connection) to see which "AI: held → X" names are registered and with
      which color — the gray ones should be missing or colorless.
- expecting: the blue names are seeded into masterCategories with a colored
  preset by one path; the gray names are only ever set on messages and never
  registered (or registered without a color) → Outlook falls back to no color.
- next_action: gather initial evidence — locate the category-application and
  masterCategories-seeding code, then diff registered vs unregistered names.

## Evidence

(none yet)

## Eliminated

- hypothesis: "Two distinct code paths apply categories; the gray buckets belong
    to the debtor pipeline and only the info-routing path provisions colors."
  evidence: "Live routing_destinations shows administratie/crediteuren/debiteuren/
    facilitair/hr are ALL swarm_type=info-routing. Same swarm, same seed script,
    same preset5. The split is a provisioning-coverage gap, not two code paths."
  timestamp: 2026-06-25

## Resolution

root_cause: "Outlook chip color comes from the mailbox masterCategories list
  (keyed by displayName + preset), not from the message. Migration
  20260625_info_routing_real_routing_destinations.sql added 5 new info-routing
  buckets (administratie, crediteuren, debiteuren, facilitair, hr) to the
  routing_destinations registry, but the master-category provisioning
  (ensureRoutingMasterCategories via scripts/ensure-info-routing-categories.ts) is
  a MANUAL one-shot with no auto-trigger and was not re-run. So messages stamped
  `AI: held → administratie` etc. referenced names absent from masterCategories →
  Outlook rendered them gray. The blue buckets pre-dated the migration and were
  already seeded with preset5."

fix: "(1) Re-ran the idempotent scripts/ensure-info-routing-categories.ts against
  info@smeba.nl and info@fire-control.nl — it sources buckets live from the
  registry and POSTed the 15 missing names (held/routed/dedup × 5 buckets) per
  mailbox with color=preset5. Verified live: both mailboxes now 44 categories, all
  5 buckets present with preset5; a second run is created=0 (idempotent).
  (2) Added a MANDATORY runbook step to migration
  20260625_info_routing_real_routing_destinations.sql instructing future bucket
  additions to re-run the seeder, to prevent recurrence."

verification: "Live GET /outlook/masterCategories after the fix shows
  AI: held → {administratie,crediteuren,debiteuren,facilitair,hr} = preset5 on
  both mailboxes. Idempotency re-run = created=0. CONFIRMED by operator (Nick) in
  Outlook UI on 2026-06-25 after refresh — administratie/crediteuren/debiteuren
  chips now render blue."

files_changed:
  - "supabase/migrations/20260625_info_routing_real_routing_destinations.sql (runbook note only — additive comment)"
  - "(no code change — fix is a live Graph provisioning run via the existing idempotent script; masterCategories state changed in both info@ mailboxes)"
