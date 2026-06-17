---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - web/lib/automations/info-routing/coordinator-schema.ts
  - web/lib/automations/info-routing/verdict.ts
  - web/lib/automations/info-routing/dedup.ts
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/lib/swarms/registry.ts
  - web/lib/swarms/types.ts
  - web/scripts/gen-routing-destinations.ts
  - web/scripts/orq/manage-info-routing-coordinator.ts
  - web/scripts/eval/info-routing-precision-shadow.ts
  - supabase/migrations/20260617_phase131_routing_destinations.sql
  - supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql
  - supabase/migrations/20260617c_phase131_info_routing_unknown_dispatch.sql
  - supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 131: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the Phase 131 Stage-3 info-routing destination router: the closed-list
Zod gate (`coordinator-schema.ts`), the verdict builder (`verdict.ts`), the
two-layer dedup guard (`dedup.ts`), the coordinator routing capability block
(`debtor-email-coordinator.ts`), the registry loader/resolver (`registry.ts`),
codegen (`gen-routing-destinations.ts`), the Orq manage script, the shadow eval
harness, and four migrations.

The replay-safety discipline is mostly sound (run_id generated inside `step.run`,
all side-effects wrapped, `inngest.send` called inline). The shadow harness's
false-success guard is genuinely well-built. The Orq strict-schema `anyOf`
nullable-brand rule is honored in all three places (Zod schema comment, JS
json_schema, and the SQL `output_schema`).

However two BLOCKER-level defects break the phase's core guarantees:

1. **The "invalid/empty agent output → unrouted, never throws" guarantee
   (ROUTE-03) is not actually achieved** for the most common failure modes —
   `invokeOrqAgent` THROWS on empty output text and on non-JSON responses
   BEFORE `parseAgentOutputOrUnrouted` ever runs. With `retries: 0`, a
   malformed/empty LLM response becomes a terminal coordinator FAILURE, not an
   unrouted verdict.

2. **The brand-null routing path is structurally broken.** The agent is
   explicitly instructed (and few-shot-demonstrated) to emit `brand: null` for
   `algemeen`, `sollicitaties`, and any no-brand mail, but every seeded
   `routing_destinations` row carries a non-null `brand`. `resolveRoutingDestination`
   matches on `brand === brand`, so every legitimate `brand: null` verdict for a
   single-tenant bucket fails to match and silently collapses to `unrouted`.
   `algemeen`, `inspecties`, `sollicitaties`, `storingen`, and `opleidingen` can
   NEVER route when the agent returns the null brand the prompt tells it to.

## Critical Issues

### CR-01: ROUTE-03 never-throw guarantee broken — empty/non-JSON LLM output is a terminal failure, not unrouted

**File:** `web/lib/inngest/functions/debtor-email-coordinator.ts:256-265` (calling `web/lib/automations/orq-agents/client.ts:210-225`)
**Issue:**
`parseAgentOutputOrUnrouted` is documented and built to never throw — invalid
input collapses to the unrouted outcome. But it is fed `raw` from
`invokeOrqAgent`, which throws *before returning* in two common cases:

- `client.ts:211-213` — empty output text: `throw new Error("...empty output text")`.
- `client.ts:221-225` — non-JSON / fence-mangled body: `throw new Error("...JSON.parse failed")`.

In `classify-routing` (line 256) the call is:
```ts
const { raw } = await invokeOrqAgent(stage3AgentKey, {...});
return parseAgentOutputOrUnrouted(raw);   // never reached if invoke threw
```
There is no inner try/catch. A throw propagates out of the `routingDestinations.length > 0`
block to the outer `catch (err)` (line 783), which runs `mark-failed`
(sets `automation_runs.status='failed'`) and **re-throws**. With
`retries: 0` (line 112) this is a terminal failure with NO routing verdict
persisted — the row never reaches the held/unrouted state the phase promises.
The ROUTE-03 acceptance ("invalid/empty output yields the unrouted outcome") is
only honored for output that is *valid JSON but schema-invalid*; the far more
likely empty-completion / fence-mangled / truncated-at-max_tokens cases (note
`max_tokens: 600`, `reasoning` capped at 200 chars but no global guard) fail hard.

**Fix:** Catch the invoke throw and fall through to the unrouted marker, so the
guarantee holds end-to-end:
```ts
const parsed = await step.run("classify-routing", async () => {
  try {
    const { raw } = await invokeOrqAgent(stage3AgentKey, {
      subject: email.subject ?? "",
      body_text: email.body_text ?? "",
      sender_email: email.sender_email ?? null,
      sender_domain,
      mailbox: email.mailbox ?? null,
    });
    return parseAgentOutputOrUnrouted(raw);
  } catch (err) {
    // Empty/non-JSON LLM output → unrouted, per ROUTE-03. Do NOT let the
    // invoke throw escape to the terminal catch.
    console.warn(`[info-routing] classify-routing invoke failed → unrouted: ${
      err instanceof Error ? err.message : String(err)}`);
    return UNROUTED_OUTCOME;
  }
});
```
(Import `UNROUTED_OUTCOME` from `coordinator-schema`.) Decide deliberately
whether a genuine transport error — Orq timeout / HTTP 5xx — should also become
unrouted or should retain a retry path; at minimum the empty-text and
JSON.parse cases must not be terminal.

### CR-02: brand-null verdicts for single-tenant buckets always collapse to unrouted (data/logic mismatch)

**File:** `web/lib/swarms/registry.ts:140-149`, seed `supabase/migrations/20260617_phase131_routing_destinations.sql:86-97`
**Issue:**
`resolveRoutingDestination` requires `d.brand === brand` for a match
(line 146). The agent contract (Zod `brand: z.enum(...).nullable()`,
`coordinator-schema.ts:47`) and the agent instructions explicitly produce
`brand: null`:
- instructions line 47: "`null` — no brand signal, an `algemeen` mail with no brand, or an `unrouted` outcome. Null is a first-class honest value."
- few-shot example line 89: `{"bucket":"sollicitaties","brand":null,...}`.

But every seeded destination row has a non-null brand (`smeba` /
`fire-control` / `berki`) — there is no `brand IS NULL` row for any bucket,
including `algemeen` (`'algemeen','smeba'`) and `sollicitaties`
(`'sollicitaties','smeba'`). Therefore for a mail the agent classifies as
`{bucket:'sollicitaties', brand:null}`:
```
resolveRoutingDestination(dest, 'sollicitaties', null)
  → find(d => d.destination_key==='sollicitaties' && d.brand===null)
  → undefined → null → unrouted
```
The single-tenant buckets (`algemeen`, `inspecties`, `sollicitaties`,
`storingen`, `opleidingen`) can NEVER resolve to their real mailbox when the
agent emits the null brand the prompt tells it to. `hrm@smeba.nl`,
`algemeen@smeba.nl`, `planning@smeba.nl`, `storing.smeba@smeba.nl`,
`opleidingen@fire-control.nl` are effectively dead destinations. This silently
mis-buckets a large fraction of routable mail as unrouted with no error — exactly
the kind of false-negative the shadow harness can't catch yet (0/8000 graded).

**Fix:** Resolve the contract mismatch. Either:
(a) make the resolver tolerant of a null brand by falling back to a
single-tenant default brand for buckets that have exactly one brand row, or
(b) seed an explicit `brand IS NULL` (or sentinel `'default'`) destination row
per single-tenant bucket and have the resolver prefer an exact brand match then
fall back to the null/default row:
```ts
export function resolveRoutingDestination(destinations, bucket, brand) {
  const exact = destinations.find(
    (d) => d.destination_key === bucket && d.brand === brand,
  );
  if (exact) return exact.target_mailbox ?? null;
  // fall back: a brand-agnostic row, or the lone row when the bucket is single-tenant
  const forBucket = destinations.filter((d) => d.destination_key === bucket);
  if (forBucket.length === 1) return forBucket[0].target_mailbox ?? null;
  const dflt = forBucket.find((d) => d.brand === null /* or 'default' */);
  return dflt?.target_mailbox ?? null;
}
```
Whichever path is chosen, add a unit test asserting
`{bucket:'sollicitaties', brand:null}` resolves to `hrm@smeba.nl` — the current
code would route it to unrouted, which is wrong. (NOTE the brand-aware
cross-tenant case for `order_entry`/`verkoop` must still require an exact match,
so a blanket "ignore brand" fix is wrong.)

## Warnings

### WR-01: `decision_details` writes overwrite each other — input_size / ranked telemetry clobbered on the routing path; held marker rewrites the whole object

**File:** `web/lib/inngest/functions/debtor-email-coordinator.ts:358-405`
**Issue:**
`decision_details` is written with a whole-object `update({ decision_details: {...} })`,
not a JSONB merge. On the routing path this is mostly self-consistent, but it is
fragile and asymmetric with the intent path:
- `persist-routing-verdict` (line 361) writes `{ routing: verdict }`.
- `mark-routing-verdict-held` (line 398) writes `{ routing: verdict, routing_held: true }` — a full replace that happens to re-include `routing`, so it works, but only because the author remembered to re-spread `verdict`. Any future field added to `decision_details` by an earlier step (e.g. the routing path never writes `input_size`, but a maintainer might) is silently dropped.
Contrast the intent path's `mark-routing-held` (line 718-726) which writes
`{ routing_held: true }` ALONE — there it deliberately preserves the
`persist-ranked` write only because Postgres `update` of a jsonb column replaces
the column value… wait: it does NOT merge — line 721 `update({ decision_details: { routing_held: true } })` **replaces** the whole column, dropping the `ranked`/`language`/`urgency`/`input_size` that `persist-ranked` wrote at line 607. That is a latent data-loss bug on the GATED intent path (debtor/sales when routing-gated), though it is pre-existing (Phase 113), not net-new to 131.
**Fix:** Use a jsonb merge so partial updates don't clobber siblings. Either
read-modify-write the object, or use a Postgres `jsonb ||` via an RPC/raw update:
```ts
// merge instead of replace
.update({ decision_details: { ...existing, routing_held: true } })
```
At minimum, confirm the held intent path is not losing `ranked_intents`
telemetry, and make the routing held-marker an explicit merge rather than relying
on re-spreading `verdict`.

### WR-02: dedup target-mailbox resolution duplicated and can drift from the verdict's

**File:** `web/lib/inngest/functions/debtor-email-coordinator.ts:301-305` vs `web/lib/automations/info-routing/verdict.ts:118`
**Issue:**
The coordinator resolves the dedup target with
`resolveRoutingDestination(routingDestinations, parsed.value.bucket, parsed.value.brand)`
(line 301), then independently `buildRoutingVerdict` resolves it AGAIN (verdict.ts:118)
to set `target_mailbox`. The code comment at line 285-287 asserts they resolve
"the SAME way", but there is no shared call — and they do NOT agree once the
confidence floor is applied: `buildRoutingVerdict` returns `unrouted`
(target_mailbox=null) when `CONFIDENCE_NUMERIC[confidence] < threshold`
(verdict.ts:111), but the dedup block at line 294-343 ignores the threshold and
will run layer-(a)/layer-(b) dedup against a target mailbox for a verdict that is
ultimately unrouted. The dedup result then feeds `buildRoutingVerdict` as the
`dedup` arg, so an `already_addressed` dedup status can be stamped onto an
unrouted verdict (verdict.ts:105 carries `dedup` into `unroutedVerdict`). Wasted
DB read on the layer-(b) path and a semantically odd `unrouted + already_addressed`
verdict.
**Fix:** Gate the dedup on the same threshold the verdict uses, or compute the
verdict first and only dedup when `!verdict.unrouted`. E.g. build a provisional
verdict (without dedup), and only run `checkDuplicateDelivery` when
`provisional.target_mailbox !== null`, then attach dedup.

### WR-03: redundant `loadSwarm` reads inside the routing path (3+ separate step.run calls)

**File:** `web/lib/inngest/functions/debtor-email-coordinator.ts:176-181, 270-282, 385-391`
**Issue:**
The routing path calls `loadSwarm(supabase, swarm_type)` in three separate
`step.run` boundaries: `load-swarm-agent-key` (177), `load-routing-threshold`
(273), and `load-stage3-routing-gate-routing` (388). `loadSwarm` has a 60s TTL
cache (registry.ts:34) so the extra reads are usually cache hits, but each is a
distinct Inngest step with its own replay-record overhead, and the cache is
per-process — across an Inngest step replay on a different worker the cache is
cold, so this is 3 real `swarms` selects per routing run. Not a correctness bug,
but wasteful and noisy.
**Fix:** Load the swarm row once early inside a single `step.run` and pass the
needed fields (agent key, threshold, gate flag) forward, or accept the cache and
collapse the threshold + gate reads into one step.

### WR-04: `ilike` on the dedup mailbox match treats `_`/`%` as wildcards (latent, low-risk today)

**File:** `web/lib/automations/info-routing/dedup.ts:158`
**Issue:**
`.ilike("mailbox", normalizedTarget)` performs a SQL `ILIKE` pattern match. The
target is a registry-controlled email address today (no `%`/`_`), so it is not
exploitable, but `ILIKE` is semantically wrong here — `order_entry@x` would match
`order-entry@x` etc. via the `_` wildcard, and any future target with an
underscore (common in mailbox names) silently widens the match. The comment
(line 152-154) implies an exact address match is intended.
**Fix:** Use `.eq("mailbox", normalizedTarget)` for an exact match, or if a
case-insensitive exact match is required, normalize both sides to lowercase and
compare with `.eq` (the column comparison already lowercases the source). If
fuzzy match is truly needed, escape `%`/`_` in `normalizedTarget`.

### WR-05: shadow harness reads `coordinator_runs.human_outlook_category` — a column that does not exist on coordinator_runs

**File:** `web/scripts/eval/info-routing-precision-shadow.ts:242-248`
**Issue:**
The query selects `human_outlook_category` directly off `coordinator_runs`
(line 244), but the human Outlook category lives on the email record, not on
`coordinator_runs` (the comment at line 238-241 even says "the delta-sync landing
surface (prerequisite, outside 131)"). As written, this select will throw a
PostgREST "column does not exist" error (`res.error` → line 247-248 throws)
the moment anyone runs `report` mode, rather than the intended graceful
`insufficient_sample`. The false-success guard is well-designed but is gated
behind a query that errors before it can run.
**Fix:** Either select the column via the actual join/view that the prerequisite
will create, or — since the prerequisite is explicitly out of scope — make the
projection resilient (e.g. `select("decision_details")` only, default
`human_outlook_category` to null in the map) so `report` mode reports
`insufficient_sample` rather than throwing on a missing column. Document that the
real join lands with the prerequisite.

## Info

### IN-01: `BUCKET_ENUM` empty-array fallback to `["unrouted"]` masks a broken codegen instead of failing loudly

**File:** `web/lib/automations/info-routing/coordinator-schema.ts:39-43`
**Issue:**
If `INFO_ROUTING_BUCKET_KEYS` is empty (broken/hand-edited generated file), the
schema silently degrades to a single-value `["unrouted"]` enum, so every agent
bucket fails validation and everything routes to unrouted — a silent global
outage rather than a load-time error. The manage script (line 224-230) does fail
loudly on empty, but the runtime schema does not.
**Fix:** Consider throwing at module load if `INFO_ROUTING_BUCKET_KEYS.length === 0`
(codegen invariant guarantees 8 keys), matching the manage script's stance, so a
broken generated file is caught in CI/boot rather than degrading silently.

### IN-02: `extractRecipientAddresses` Graph shape only read from `raw_json`, not `recipients`

**File:** `web/lib/automations/info-routing/dedup.ts:31-61`
**Issue:**
The header comment claims tolerance of "all three live shapes," but the Graph
shape (`{emailAddress.address}`) is only read from `raw_json` (line 40); if a row
ever stores the Graph array shape in the flat `recipients` column, the
`Array.isArray(rc)` branch reads `r.email` (undefined) and drops every address.
This matches the documented ingest contract (Graph in raw_json) so it is not a
bug today, but the comment over-claims.
**Fix:** Tighten the comment, or add a `r?.emailAddress?.address` probe in the
array branch for defensive symmetry.

### IN-03: migration `20260617b` relies on `dry_run_config` NOT NULL while `resolution_config` uses COALESCE — asymmetry is correct but undocumented

**File:** `supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql:34-36`
**Issue:**
`dry_run_config || ...` (line 34) has no COALESCE while `resolution_config` (line 35)
does. This is correct — `dry_run_config` is `NOT NULL DEFAULT '{}'`
(20260603b) and `resolution_config` is nullable — but the asymmetry looks like an
oversight and would silently NULL-out `dry_run_config` if that column's NOT NULL
constraint were ever relaxed.
**Fix:** Add COALESCE to the `dry_run_config` merge too for defensive symmetry,
or add a one-line comment noting the NOT NULL guarantee it relies on.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
