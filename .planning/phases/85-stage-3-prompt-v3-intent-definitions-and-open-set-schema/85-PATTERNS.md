# Phase 85: Stage 3 prompt v3 — intent definitions + open-set output schema — Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 4 modified + 1 new test + 1 live-Orq deploy
**Analogs found:** 5 / 5 in-repo files have strong analogs; the live-Orq deploy follows the canonical CLAUDE.md ritual (with Phase 65/74 precedent).

**RFC anchors (read-first):**
- `docs/agentic-pipeline/README.md` — 5-stage funnel.
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier.
- **Separation rule still holds:** closed-list `INTENT` continues to back `swarm_intents`; `intent_proposal` is additive non-routing telemetry and MUST NOT be wired into `swarm_noise_categories` or the Stage 3.5 dispatcher's handler lookup.

---

## File Classification

| File (Phase 85) | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/lib/automations/debtor-email/coordinator/types.ts` (M) | model / Zod schema | transform | self (lines 99-121, V1→V2 widening from Phase 65) | exact — extend in place |
| `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (M) | service / transport | request-response | self (lines 185-201, validator swap from Phase 65) | exact |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (M) | controller / Inngest fn | event-driven | self (Phase 80 Plan 03 — classifier-only) + Phase 83 D-09 telemetry block (lines 245-308) | exact |
| `web/lib/automations/debtor-email/coordinator/__tests__/types-v3.test.ts` (NEW) | test | unit (pure schema) | `__tests__/types-v2.test.ts` (Phase 65 Plan 65-01) | exact (copy + extend) |
| Live Orq.ai `debtor-intent-agent` (deploy) | external config | RPC ritual | Phase 74 Plan 03 STEP 1-6 (create+activate); Phase 65 Plan 02 PATCH | role-match — Phase 85 is PATCH-only, no create |
| Backward-compat parser branch | (deferred — see "GREENFIELD" below) | n/a | no prior `intent_version` discriminator in repo | GREENFIELD |

**Note on the "coordinator-orchestrator.ts" mentioned in CONTEXT:** that file does NOT currently exist in the repo. The Phase 65 file by that name was deleted/superseded by Phase 80 Plan 03 — the Stage 3 classifier now lives entirely in `web/lib/inngest/functions/debtor-email-coordinator.ts`, with dispatch in a sibling `stage-3-dispatcher.ts`. **All Phase 85 coordinator changes target `debtor-email-coordinator.ts`.** The planner MUST NOT create a new `coordinator-orchestrator.ts`.

---

## Pattern Assignments

### `coordinator/types.ts` — Zod V2→V3 widening (additive, non-breaking)

**Analog:** self, lines 99-121 (the Phase 65 V1→V2 widening). The exact precedent for "keep the old schema export alive, add a new schema + new version literal next to it" lives in this same file.

**Existing pattern to mirror** (`types.ts:99-121`):
```typescript
// Phase 65 (D-12) — ranked-intent V2 schema. v1 kept above for backfill
// comparator (Plan 65-05). Phase 66 deletes v1.
export const INTENT_VERSION_V2 = "2026-05-01.v2" as const;

export const rankedIntentEntrySchema = z.object({
  intent: z.enum(INTENT),
  confidence: z.enum(CONFIDENCE),
  document_reference: z.string().max(64).nullable(),
  sub_type: z.enum(SUB_TYPE).nullable(),
  reasoning: z.string().max(200),
});

export const intentAgentOutputSchemaV2 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1).max(5),
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V2),
});
```

**To add (V3 alongside V2 — keep V2 export for Phase 85 D-07 backward-compat parsing; do NOT delete V2 in this phase):**
```typescript
// Phase 85 (D-04) — V3 adds intent_proposal + proposal_reason (additive).
// V2 schema kept exported for one release per D-07 backward-compat.
// Phase 86+ deletes V2 once production traffic is 100% V3.
export const INTENT_VERSION_V3 = "2026-05-19.v3" as const;

export const intentAgentOutputSchemaV3 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1).max(5),
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V3),
  // Phase 85 D-04: non-null only when no closed-list intent fits.
  // snake_case label, 64-char cap, lower-alpha + digits + underscore.
  intent_proposal: z
    .string()
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/)
    .nullable(),
  proposal_reason: z.string().max(280).nullable(),
});

export type IntentAgentOutputV3 = z.infer<typeof intentAgentOutputSchemaV3>;
```

**Critical literal-equality rule (from Phase 65 PATTERNS line 71):** the literal `INTENT_VERSION_V3 = "2026-05-19.v3"` MUST be byte-identical to the agent's `output_schema.intent_version.const` in Orq.ai. A single char drift makes `safeParse` fail with a misleading "literal mismatch" error that operators historically misread as a JSON-shape problem.

**Co-constraint with the Orq json_schema (CLAUDE.md learning `3970bad9` anyOf):** in the Orq Studio JSON Schema resource, nullable fields MUST use `anyOf`, NOT `type:["string","null"]`. The Zod side uses `.nullable()`, which serialises fine — the constraint lives only on the Orq schema resource:
```json
"intent_proposal": {
  "anyOf": [
    { "type": "string", "maxLength": 64, "pattern": "^[a-z][a-z0-9_]*$" },
    { "type": "null" }
  ]
},
"proposal_reason": {
  "anyOf": [
    { "type": "string", "maxLength": 280 },
    { "type": "null" }
  ]
}
```

---

### `coordinator/invoke-intent.ts` — validator swap (V2 → discriminated V2|V3 parse)

**Analog:** self, lines 185-201 (the Phase 65 validator swap from V1 to V2 — the cleanest in-repo precedent for swapping the Zod gate without changing transport).

**Existing pattern to mirror** (`invoke-intent.ts:185-201`):
```typescript
// Phase 65 (D-12): switch validator to v2 ranked-intent schema. The v1 schema
// import is kept alive for Plan 65-05 regression backfill but is no longer
// wired into the production transport.
const validated = intentAgentOutputSchemaV2.safeParse(parsed);
if (!validated.success) {
  const e = new Error(
    `Intent-agent v2 output schema mismatch: ${JSON.stringify(
      validated.error.issues,
    )}`,
  );
  (e as { raw?: string }).raw = raw;
  throw e;
}
return { output: validated.data, raw };
```

**Phase 85 widening — accept both V2 and V3 by sniffing `intent_version` BEFORE running the validator (D-07 backward-compat parser).** This is the *only* discriminator pattern needed; once V3 is validated, downstream `output.intent_version` lets `debtor-email-coordinator.ts` branch on persistence.

```typescript
// Phase 85 D-07: tolerate both V2 and V3 outputs during the rollout window.
// Discriminate on the intent_version string BEFORE validation so the zod
// error message points at the correct schema for the version the agent
// actually returned (otherwise V3 outputs would fail-parse against V2 with
// a confusing literal-mismatch on the intent_version field).
const version = (parsed as { intent_version?: unknown })?.intent_version;
const schema =
  version === INTENT_VERSION_V3
    ? intentAgentOutputSchemaV3
    : intentAgentOutputSchemaV2;
const validated = schema.safeParse(parsed);
// ...same error-wrapping path as today (raw attached for trace)...
return { output: validated.data, raw };
```

**`InvokeIntentResult` type widening** — change `output: IntentAgentOutputV2` → `output: IntentAgentOutputV2 | IntentAgentOutputV3`. Callers (only `debtor-email-coordinator.ts`) then narrow via `if (output.intent_version === INTENT_VERSION_V3)`.

**Strip-fence parser (lines 169-183) stays verbatim** — Orq still wraps in ```json sometimes.

**Transport stays verbatim** — `ORQ_ENDPOINT`, `AGENT_KEY="debtor-intent-agent"`, `TIMEOUT_MS=45_000`, the POST shape, and the `received_at`-out-of-prompt idempotency trick (lines 95-119) all carry forward unchanged. Phase 85 does NOT touch the Orq fetch.

---

### `inngest/functions/debtor-email-coordinator.ts` — persist V3 proposal fields

**Analog:** self, lines 247-313 (Phase 83 D-09 telemetry block — the most recent precedent for "agent returned a new sub-shape, persist it on coordinator_runs.decision_details without a column add").

**Two write sites need an additive nudge — both behind a single `is V3` branch:**

**1. `mergeToolOutputs("intent_first_pass", output)` on line 222-227** — already JSONB, so V3 outputs persist verbatim. **No code change required**; the V3 keys appear naturally in `agent_runs.tool_outputs.intent_first_pass`. Important: the JsonValue cast on line 226 already covers the wider shape.

**2. `emitPipelineEvent` decision_details on line 284-309** — additive surface for the new fields. Pattern to mirror (line 288-302 — note the existing additive "inputs" + "input_size" sub-objects, both added without a column add):
```typescript
decision_details: {
  ranked: output.ranked,
  language: output.language,
  urgency: output.urgency,
  intent_version: output.intent_version, // V2 or V3 — already in scope
  inputs: { /* unchanged */ },
  input_size: { /* unchanged */ },
  // Phase 85 D-04 — additive: only present on V3 outputs. Phase 86 reads.
  ...(output.intent_version === INTENT_VERSION_V3 && {
    intent_proposal: output.intent_proposal,
    proposal_reason: output.proposal_reason,
  }),
},
```
This is the *exact* shape the Phase 83 D-09 additive `input_size` block uses (spread-conditional object) and it lands in the same JSONB column. **No coordinator_runs schema migration in Phase 85** — Phase 86 owns the persistence-surface decision.

**3. Cache-key version bump on lines 190-196.** The `findCachedOutput(... "intent_version", INTENT_VERSION_V2, ...)` call MUST flip to `INTENT_VERSION_V3` once the live agent ships V3. This is the same "version literal flip = automatic cache invalidation" pattern Phase 65 PATTERNS section C documents. **Critical:** flip this in lock-step with the Orq deploy — flipping the constant BEFORE the agent ships V3 produces a cache miss + V2 result on every call (functional, but wastes Orq tokens); flipping AFTER produces a cache miss + V3 result (also functional). The risky ordering is constant-flip without redeploying — that is impossible here because both happen in the same plan task.

**Status-flip + emit-predicted blocks (lines 321-350) require NO change.** Top-1 routing is closed-list `intent` only; `intent_proposal` is silently captured to JSONB and Phase 86 surfaces it.

**`updateRun` hoist on lines 234-244 needs ONE awareness item:** when V3 lands, `top.confidence` etc. still come from `output.ranked[0]` regardless of version. **No back-compat-column change** — the back-compat columns are not the proposal-surface; Phase 86 builds that.

---

### `coordinator/__tests__/types-v3.test.ts` (NEW)

**Analog:** `coordinator/__tests__/types-v2.test.ts` (Phase 65 Plan 65-01) — copy the entire test file shell and bump the names + assertions.

**Mandatory test shape (mirror types-v2.test.ts:1-97):**
```typescript
import { describe, it, expect } from "vitest";
import {
  INTENT_VERSION_V3,
  intentAgentOutputSchemaV3,
  intentAgentOutputSchemaV2, // imported so the back-compat test can prove
  INTENT_VERSION_V2,         // the V2 schema STILL accepts a clean V2 row
} from "../types";

describe("Phase 85 intentAgentOutputSchemaV3", () => {
  it("requires intent_version === '2026-05-19.v3' literal", () => {
    expect(INTENT_VERSION_V3).toBe("2026-05-19.v3");
  });

  it("rejects V2 shape (missing intent_proposal/proposal_reason)", () => {
    // Same v2-shape used in types-v2.test.ts:36-49.
  });

  it("accepts intent_proposal=null + proposal_reason=null (closed-list path)", () => {
    // R-01 mitigation: confirm the schema does NOT require non-null proposal.
  });

  it("accepts intent_proposal='wka_data_request' + non-null reason (open-set path)", () => {
    // R-02 mitigation: confirm the proposal path validates end-to-end.
  });

  it("rejects intent_proposal that violates snake_case regex", () => {
    // Examples: "WKA Data Request", "wka-data-request", "1_invalid".
  });

  it("rejects intent_proposal length > 64", () => {
    // boundary at 65 chars.
  });

  it("rejects proposal_reason length > 280", () => {});

  it("V2 schema STILL accepts a V2 row after V3 lands (D-07 backward-compat)", () => {
    // copy the success case from types-v2.test.ts:80-96 verbatim — proves
    // V3 introduction did not regress the V2 export.
  });
});
```

**Mocking:** none required — schemas are pure modules. (Same posture as the existing `types-v2.test.ts`: zero `vi.mock` calls.)

---

### Live Orq.ai `debtor-intent-agent` — PATCH-only deploy ritual

**Analog:** **Phase 65 Plan 65-02** (PATCH path for `debtor-intent-agent` v2 — already exists) and **Phase 74 Plan 03 STEP 1-6** (the 6-step ritual, though Phase 74 created a new agent; Phase 85 starts at STEP 1 + STEP 5 + STEP 6 only).

**Phase 85 ritual (CLAUDE.md learnings, strictly):**

| Step | Tool | Why this is mandatory | CLAUDE.md anchor |
|---|---|---|---|
| 1. `list_models` pre-flight | `mcp__orqai-mcp__list_models` | Orq's PATCH accepts unknown model IDs silently → Studio Model dropdown renders empty → "Add tool" blocked. | `f980a2a1-4500-4c2e-98c5-803261ab7d78` |
| 2. Studio JSON Schema resource bump | Studio UI (no MCP CRUD for json_schema tools) | Studio is the only path to mutate the `Response Format → JSON Schema` resource; MCP `update_agent` references it by name only. Use `anyOf` form for nullable fields. | `3970bad9-4c97-4ccf-a2f5-46475313ed1a` + 2026-05-01 Studio observation |
| 3. `update_agent` (NOT `create_agent`) | `mcp__orqai-mcp__update_agent` | Agent already exists at `01KQECK191GE21CH8D8KEMTM9J`. `create_agent` would (a) duplicate and (b) silently drop `model.parameters.response_format` on insert. | `cba7352b-4feb-4d11-94f8-0ebd24f15cd0` |
| 3a. PATCH key is the **human-readable key**, not the slug ID | `mcp__orqai-mcp__update_agent({ key: "debtor-intent-agent", ... })` | Generic "Failed to update agent" symptom when slug-id is used. | MEMORY: `feedback_orq_update_agent_key_vs_id` |
| 3b. PATCH payload MUST include full `model.parameters` (incl. `response_format`) AND `instructions` | same call | `update_agent` only persists what is in its payload; partial PATCHes on `model.parameters` can null-out `response_format` if the validator path treats the missing field as "clear". Phase 65 Plan 02 sent the full block; mirror that. | `cba7352b` (create-drops; update-persists-what-you-pass) |
| 4. `get_agent` verify persistence | `mcp__orqai-mcp__get_agent` | Verify `model.parameters.response_format` is populated AND references the V3 json_schema resource by name AND `instructions` contains the new `<intent_definitions>` block. **`get_agent` verifies persistence only, NOT catalog validity — that is step 1's job.** | `f980a2a1` + `cba7352b` |
| 5. Smoke #1 — known-novel email (WKA-gegevens "Breman" 2026-05-11) | `mcp__orqai-mcp__invoke_agent` | CONTEXT verification #2: confirm `intent_proposal` is non-null and semantically reasonable (e.g. `wka_data_request`). | Phase 74 SUMMARY smoke fixture pattern |
| 6. Smoke #2 — clean `copy_document_request` | `mcp__orqai-mcp__invoke_agent` | CONTEXT verification #3: confirm `intent_proposal` is null on a normal copy-doc email. R-01 (over-eager proposals) regression gate. | Phase 74 SUMMARY smoke fixture pattern |
| 7. Smoke #3 — disambiguation sample (12-email `payment_dispute` set from 2026-05-19 session) | `mcp__orqai-mcp__invoke_agent` × 12 | CONTEXT verification #4: ≤1 of 12 may change top-1. | New pattern; closest precedent is the Phase 65 regression-report shape in `65-regression-report.md` |

**Smoke-test invocation shape (mirror the implicit Phase 74 Plan 03 fixture; explicit example from invoke-intent.ts:120-140):**
```typescript
// Either via MCP:
mcp__orqai-mcp__invoke_agent({
  key: "debtor-intent-agent",
  message: { role: "user", parts: [{ kind: "text", text: <prompt-with-assembled-input> }] },
  configuration: { blocking: true, variables: { email_id, ... } },
});
// Or via the existing transport — same fetch as invoke-intent.ts lines 142-150,
// just with a fixture email. The advantage of MCP is no ORQ_API_KEY plumbing
// in the smoke-test scratch buffer.
```

**Operator log file:** mirror Phase 74's `74-AGENT-RITUAL-LOG.md` convention — write `85-AGENT-RITUAL-LOG.md` with: list_models output excerpt, get_agent excerpt showing V3 response_format + intent_definitions presence, the three smoke responses verbatim.

---

## Shared Patterns

### A. Idempotent agent calls via version literal

**Source:** `coordinator/agent-runs.ts` `findCachedOutput` (already imported by coordinator) + `debtor-email-coordinator.ts:190-196`.

**Apply to:** every Phase 85 path that loads or writes intent_first_pass. The cache key is `(email_id, "intent_version", <literal>)`. Flipping `INTENT_VERSION_V2 → INTENT_VERSION_V3` in the call sites invalidates V2 rows automatically. **No SQL migration; no manual cache purge.**

### B. Backward-compat parser — discriminator on `intent_version`

**Source:** GREENFIELD (see "No Analog" below). Closest precedent is the V1-deprecation note in `invoke-intent.ts:185-201`, which is a one-shot swap, not a tolerant parser. The pattern in this PATTERNS.md is the canonical shape for Phase 85.

**Apply to:** `invoke-intent.ts` validator pick (above). **One discriminator site only** — do NOT scatter `if (output.intent_version === ...)` across `debtor-email-coordinator.ts`. The coordinator stays type-narrow via the wider `IntentAgentOutputV2 | IntentAgentOutputV3` return.

### C. Additive JSONB telemetry (no column add)

**Source:** Phase 83 D-09 `decision_details.input_size` (lines 304-308 of `debtor-email-coordinator.ts`) — the most recent precedent for adding a new sub-object to `decision_details` without a column.

**Apply to:** Phase 85's `intent_proposal` + `proposal_reason` capture (spread-conditional shown above). Phase 86 owns the read surface.

### D. Strict json_schema with anyOf nullable

**Source:** CLAUDE.md learning `3970bad9-4c97-4ccf-a2f5-46475313ed1a` (re-applied to Phase 65 PATTERNS section F).

**Apply to:** the Studio JSON Schema resource for V3. NEVER `type:["string","null"]` shorthand. The Zod side (`.nullable()`) is fine.

### E. Orq agent ritual (PATCH variant)

**Source:** Phase 74 Plan 03 STEP 1 + STEP 5 + STEP 6 (skip STEP 2-4: the agent already exists). Phase 65 Plan 65-02 is the closest PATCH-only precedent for *this specific agent*.

**Apply to:** `debtor-intent-agent` deploy. See the table above.

### F. Test mocking posture

**Source:** `coordinator/__tests__/types-v2.test.ts` — pure schema tests use zero `vi.mock` calls; Inngest function tests (not needed in Phase 85) follow the `stage-0-safety-worker.test.ts` mock-step shell.

**Apply to:** Phase 85 only adds `types-v3.test.ts` (pure). No Inngest function test change required — the coordinator's behaviour is unchanged when receiving V3 outputs (the persistence is JSONB merge which is content-agnostic at runtime). **Optional** but recommended: add one integration-shaped test under `coordinator/__tests__/idempotency-cache-v3.test.ts` mirroring `idempotency-cache-v2.test.ts` if it exists — confirms the version-literal flip invalidates V2 cache rows.

---

## No Analog Found / GREENFIELD

| File / Concept | Role | Why no analog |
|---|---|---|
| `intent_version` discriminator inside `invoke-intent.ts` | tolerant Zod parser | The Phase 65 V1→V2 swap was *all-or-nothing* — V1 outputs were intentionally rejected (line 188-189 comment). Phase 85 is the first time the coordinator must accept TWO schema versions in parallel. The pattern is trivial (sniff `intent_version`, pick schema) and the shape above is canonical. |
| 12-email disambiguation regression harness | smoke-test fixture | No prior phase has run a fixed real-world fixture set against a re-deployed prompt. Phase 65 has `65-regression-report.md` as the closest in-spirit artifact (V1→V2 ranked-intent regression), but it was a one-off backfill comparator, not a sample-replay smoke. **Recommendation:** create `85-regression-report.md` modelled on `65-regression-report.md` structure — one row per fixture email with V2 top-1 vs V3 top-1 + V3 proposal. |

Both are low-risk to land without deeper precedent; the shapes above are concrete enough for the planner.

---

## Metadata

**Analog search scope (read once each, no re-reads):**
- `web/lib/automations/debtor-email/coordinator/types.ts` (200 lines)
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (206 lines)
- `web/lib/automations/debtor-email/coordinator/assemble-input.ts` (149 lines)
- `web/lib/automations/debtor-email/coordinator/__tests__/types-v2.test.ts` (97 lines)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` (375 lines)
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-PATTERNS.md` (full)
- `.planning/phases/74-.../74-03-PLAN.md` (grep-bounded sections — Orq ritual steps only)
- `.planning/phases/85-.../85-CONTEXT.md` (full)

**Files scanned:** 8 reads, 0 re-reads.

**Pattern extraction date:** 2026-05-20.

---

## PATTERN MAPPING COMPLETE

**Phase:** 85 — Stage 3 prompt v3 (intent definitions + open-set schema)
**Files classified:** 5 (4 code + 1 external Orq deploy)
**Analogs found:** 5 / 5 with strong in-repo precedents; 1 GREENFIELD trivial pattern (version discriminator) + 1 GREENFIELD smoke harness shape.

### Coverage
- Exact analog: 4 (types.ts, invoke-intent.ts, debtor-email-coordinator.ts, types-v3.test.ts)
- Role-match analog: 1 (Orq deploy — Phase 74 ritual minus create steps)
- No analog: 0 file-level; 2 sub-patterns are GREENFIELD-trivial and shapes are supplied verbatim.

### Key Patterns Identified
- **`coordinator-orchestrator.ts` from CONTEXT does NOT exist** — Phase 80 collapsed it into `debtor-email-coordinator.ts`. All coordinator edits target that file.
- **V2→V3 widening is purely additive** — copy the Phase 65 V1→V2 pattern, keep V2 export alive for one release per D-07.
- **Single discriminator site** in `invoke-intent.ts`; coordinator stays type-narrow via union return.
- **No schema migration** — `intent_proposal` + `proposal_reason` land in existing JSONB columns (`agent_runs.tool_outputs` + `coordinator_runs.decision_details`), mirroring Phase 83 D-09 additive telemetry.
- **Orq deploy is PATCH-only** — agent already exists at slug `01KQECK191GE21CH8D8KEMTM9J`; ritual collapses to `list_models` → Studio JSON Schema bump → `update_agent` (with full `model.parameters` + `instructions`) → `get_agent` verify → 3-way smoke.
- **Hard separation invariant preserved:** closed-list `INTENT` remains the only routing key against `swarm_intents`; `intent_proposal` is telemetry-only and never crosses into `swarm_noise_categories`.

### File Created
`/Users/nickcrutzen/Developer/agent-workforce/.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can reference analog line ranges + the Orq ritual table directly in PLAN.md action blocks.
