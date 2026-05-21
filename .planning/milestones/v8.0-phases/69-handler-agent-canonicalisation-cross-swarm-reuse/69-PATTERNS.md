# Phase 69: Handler-agent canonicalisation — Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/20260505a_entity_brand_expansion.sql` | migration (data) | batch transform on jsonb | `supabase/migrations/20260504b_swarms_registry_generalisation.sql` | exact (sibling Phase 68 migration) |
| `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` | migration (one-row UPDATE) | batch | `supabase/migrations/20260430d_orq_agents_enable_label_tiebreaker.sql` | exact (one-row UPDATE on `orq_agents`) |
| `web/lib/swarms/brand-register.ts` | service (registry loader) | request-response, read-heavy with Map cache | `web/lib/swarms/registry.ts` (`loadSwarmCategories` / `loadSwarmIntents`) | exact (same module family) |
| `web/lib/swarms/registry.ts` (MODIFY) | service (registry loader) | request-response | itself — extend pattern in place | exact |
| `web/lib/swarms/types.ts` (MODIFY — `entity_brand` typing) | type (registry row shape) | n/a (type only) | itself (line 57 `entity_brand: string[] \| null`) | exact |
| `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (MODIFY) | controller (Inngest worker) | event-driven request-response | itself (lines 42, 248-284, 437-439) | exact |
| `web/lib/automations/debtor-email/coordinator/types.ts` (MODIFY) | type (enum/zod schemas) | n/a | itself (lines 9-15 `ENTITY` literal) | exact |
| `web/lib/automations/debtor-email/coordinator/entity.generated.ts` (NEW codegen output) | type (codegen output) | build-time write, runtime read | NEW pattern — no existing `*.generated.ts` in repo. Closest convention: codegen header + `as const` literal-union pattern from `coordinator/types.ts:9-15`. | role-only |
| `scripts/gen-entity-types.ts` (NEW) | utility (build-time codegen) | one-shot, file-I/O + DB read | `web/scripts/audit-orq-agents.ts` (Supabase service-role + Orq audit; same env loader, same `tsx` runner) | exact (utility script; same env + supabase pattern) |
| `web/lib/automations/debtor-email/__tests__/canonicalisation/**/*.test.ts` + fixtures | test (vitest unit + integration) | request-response (mocked + live smoke) | `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` (handler harness) + `web/lib/swarms/__tests__/registry.test.ts` (registry-loader unit) | exact |
| `Agents/debtor-email-swarm/agents/debtor-copy-document-body-agent.md` (MODIFY — paste-source) | spec (Orq paste-source) | manual paste → Orq Studio | itself (frontmatter + `<entity_register>` block) | exact |
| `web/package.json` (MODIFY — add `codegen` script) | config | n/a | itself (existing `audit:orq-agents` entry) | exact |

## Pattern Assignments

### `supabase/migrations/20260505a_entity_brand_expansion.sql` (migration, data transform)

**Analog:** `supabase/migrations/20260504b_swarms_registry_generalisation.sql` (Phase 68)

**Header / scope-comment pattern** (lines 1-6):
```sql
-- Phase 68. swarm_registry generalisation + canonical context shape.
-- Lifts hardcoded swarm-specific bindings into data: stage1/2 module paths,
-- stage3 coordinator agent_key, side_effects[], canonical context shape, +
-- per-swarm intent→handler mapping. After this migration, onboarding a new
-- swarm = registry INSERTs only; zero code edits in verdict-worker /
-- label-resolver / coordinator-orchestrator.
```
Phase 69 header should describe: "expand `swarms.entity_brand` from jsonb-of-strings to jsonb-of-objects; idempotent."

**`jsonb_build_array(jsonb_build_object(...))` row-build pattern** (lines 48-57):
```sql
canonical_context_shape    = jsonb_build_object(
  'version', '2026-05-04.v1',
  'fields', jsonb_build_object(
    'customer_account_id', jsonb_build_object('type','string','nullable',true,...),
    'language',            jsonb_build_object('type','string','enum', jsonb_build_array('nl','en','de','fr'), 'default','nl'),
    ...
  )
),
entity_brand = jsonb_build_array('smeba','smeba-fire','sicli-noord','sicli-sud','berki'),
```
**Reuse for D-01:** Same `jsonb_build_array(jsonb_build_object(...), jsonb_build_object(...))` shape, but each child is a full brand metadata object (RESEARCH.md "Migration scaffolding (D-01)" section already drafted this).

**Idempotency pattern (NEW — not in Phase 68):** Phase 69 wraps in `do $$ ... end$$;` with a guard:
```sql
if jsonb_typeof(current_first) = 'object' then
  raise notice '[20260505a] entity_brand already object-shape — skipping';
  return;
end if;
```
Phase 68's migration is `alter table ... add column if not exists` (column-level idempotency). Phase 69 is row-level (data shape) — needs the `do $$ ... end$$` PL/pgSQL block. RESEARCH.md lines 494-549 has the full template.

---

### `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` (migration, one-row UPDATE)

**Analog:** `supabase/migrations/20260430d_orq_agents_enable_label_tiebreaker.sql`

**Full body to copy (file is 21 lines)** (lines 1-21):
```sql
-- Phase 56-02 wave 3 part 2 follow-up: activate the label-tiebreaker agent.
--
-- Created on Orq.ai 2026-04-30 in "Debtor Team/debtor-email-swarm" with
-- the spec at Agents/debtor-email-swarm/agents/label-tiebreaker.md.
-- ...

update public.orq_agents
   set orqai_id   = '01KQEEZ5KH37TZQJXS9C5TA8RQ',
       version    = '2026-04-30.v1',
       enabled    = true,
       notes      = 'Active. Spec: ...',
       updated_at = now()
 where agent_key = 'label-tiebreaker';
```
**Reuse for D-08:** Same `update public.orq_agents set <field> = <value>, updated_at = now() where agent_key = '<key>'` shape. Phase 69 sets `swarm_type = 'cross-cutting'` and bumps `notes` to mention CANO-03. Don't forget `updated_at = now()` (precedent).

---

### `web/lib/swarms/brand-register.ts` (service, request-response)

**Analog:** `web/lib/swarms/registry.ts` (`loadSwarmCategories`, `loadSwarmIntents`, `loadCanonicalContextShape`)

**Imports + cache-declaration pattern** (lines 1-22):
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SwarmRow, SwarmCategoryRow, ... } from "./types";

const SWARM_CACHE = new Map<string, { value: SwarmRow | null; expires: number }>();
const CATEGORIES_CACHE = new Map<string, { value: SwarmCategoryRow[]; expires: number }>();
const INTENTS_CACHE = new Map<string, { value: SwarmIntentRow[]; expires: number }>();
const TTL_MS = 60_000;
```

**TTL-cache loader pattern (`loadSwarmCategories`)** (lines 48-70) — copy verbatim, swap table name + cache:
```typescript
export async function loadSwarmCategories(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmCategoryRow[]> {
  const now = Date.now();
  const hit = CATEGORIES_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await admin
    .from("swarm_categories")
    .select("*")
    .eq("swarm_type", swarmType)
    .eq("enabled", true)
    .order("display_order", { ascending: true });

  if (error) {
    if (hit) return hit.value;          // last-known-good on error
    return [];
  }
  const value = (data as SwarmCategoryRow[] | null) ?? [];
  CATEGORIES_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}
```

**Derived-from-loadSwarm helper pattern** (lines 109-115) — best fit for `loadAllBrandRegisters` since `entity_brand` lives ON the `swarms` row:
```typescript
export async function loadCanonicalContextShape(
  admin: SupabaseClient,
  swarmType: string,
): Promise<CanonicalContextShape | null> {
  const swarm = await loadSwarm(admin, swarmType);
  return swarm?.canonical_context_shape ?? null;
}
```
**Reuse for `loadAllBrandRegisters`:** Routing through `loadSwarm` (already TTL-cached) is the cheapest path. RESEARCH.md "Pattern 1" lines 234-282 shows a more defensive variant that throws when the migration hasn't run — adopt that variant; keep the inner read via `loadSwarm`.

**Test-helper pattern** (lines 117-122):
```typescript
export function __resetCacheForTests(): void {
  SWARM_CACHE.clear();
  CATEGORIES_CACHE.clear();
  INTENTS_CACHE.clear();
}
```
New module exports its own `__resetCacheForTests` clearing the brand-register Map.

---

### `web/lib/swarms/registry.ts` (MODIFY — extend exports)

**Analog:** itself — `loadSwarmIntents` (lines 74-94) was the precedent extension in Phase 68.

**Extension pattern (Phase 68 added these in-place at the bottom of the file, before `__resetCacheForTests`):**
```typescript
// Phase 68 — load swarm_intents for a swarm_type. Mirrors the TTL +
// last-known-good pattern used by loadSwarmCategories.
export async function loadSwarmIntents(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmIntentRow[]> { ... }

// Phase 68 — resolve an intent_key to its handler_event for a swarm_type.
export async function loadHandlerEvent(
  admin: SupabaseClient,
  swarmType: string,
  intentKey: string,
): Promise<string | null> {
  const intents = await loadSwarmIntents(admin, swarmType);
  return intents.find((i) => i.intent_key === intentKey)?.handler_event ?? null;
}
```
**Reuse for Phase 69:** Add a marker comment `// Phase 69 — entity_brand registry helpers.` and re-export from `brand-register.ts` (or co-locate; D-13 indicates "add `loadEntityBrand` and `loadEntityBrandRegister` exports"). Keep `__resetCacheForTests` updated to clear the new map.

---

### `web/lib/swarms/types.ts` (MODIFY — `entity_brand` jsonb typing)

**Current state** (line 57): `entity_brand: string[] | null;`

**Modify pattern:** Replace with `BrandRegister[] | null` (or `BrandRegister[] | string[] | null` for one wave during the data migration). RESEARCH.md A1/A6 flags suggest: keep `entity_brand` typing in `types.ts` aligned with the *post-migration* shape (`BrandRegister[] | null`); the runtime guard in `loadAllBrandRegisters` throws if a string-shape row is observed (RESEARCH.md Pattern 1 lines 257-263).

**Type-shape precedent** (lines 24-37, `CanonicalContextShape`):
```typescript
export interface CanonicalContextShape {
  version: string;
  fields: Record<
    string,
    {
      type: string;
      nullable?: boolean;
      enum?: string[];
      default?: unknown;
      ...
    }
  >;
}
```
`BrandRegister` interface follows the same flat-object shape (no nested generics) — RESEARCH.md D-11 spec at CONTEXT.md lines 154-163.

---

### `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (MODIFY)

**Analog:** itself.

**Imports block to update** (lines 32-37):
```typescript
import {
  bodyAgentOutputSchema,
  BODY_VERSION,
  type Entity,                             // Phase 69 — REMOVE; replaced by import from entity.generated.ts (or string)
  type Language,
} from "@/lib/automations/debtor-email/coordinator/types";
```
**Phase 69 add:** `import { loadBrandRegister } from "@/lib/swarms/brand-register";` keeping the existing `createAdminClient` import (already present at line 27).

**Existing `step.run("generate-body")` block to refactor** (lines 254-284). Current `inputs` object has `email_entity: entity, email_language: language`. Phase 69 replaces with the new shape per CONTEXT.md D-04 (lines 84-115). RESEARCH.md "Loading a brand register at handler invocation" lines 430-491 has the fully-drafted replacement.

**Replay-safety constraint (CRITICAL — CLAUDE.md Phase 65 learning):** `loadBrandRegister(...)` MUST be called **inside** `step.run("generate-body")`, not hoisted to function top-level. RESEARCH.md Pitfall §5 lines 411-415 documents the failure mode.

**Function-level helper to delete** (lines 429-439):
```typescript
function inferLanguageFromEntity(entity: Entity): Language {
  return entity === "sicli-sud" ? "fr" : "nl";
}
```
Phase 69 deletes this entire function. Replacement: `language: brandReg.register_language` (D-04 input shape). Single call site at line 249 — verified by RESEARCH.md.

**Settings read pattern (UNCHANGED — read this for context, do not modify)** (line 163, see test mock):
```typescript
data: { dry_run: true, entity: "smeba", icontroller_company: null }
// → settingsRow.entity is the brand_code passed to loadBrandRegister
```

---

### `web/lib/automations/debtor-email/coordinator/types.ts` (MODIFY)

**Analog:** itself.

**Block to remove** (lines 9-15):
```typescript
export const ENTITY = [
  "smeba",
  "berki",
  "sicli-noord",
  "sicli-sud",
  "smeba-fire",
] as const;
```

**Type alias to replace** (line 67):
```typescript
export type Entity = (typeof ENTITY)[number];
```

**Phase 69 replacement pattern (D-Discretion — re-export from generated):**
```typescript
// Phase 69 — Entity literal-union sourced from registry-driven codegen.
// DO NOT add brands here; INSERT into swarms.entity_brand + run `npm run codegen`.
export { ENTITY_BRANDS as ENTITY, type Entity } from "./entity.generated";
```
This keeps the `import { type Entity } from ".../coordinator/types"` import surface unchanged for downstream callers (RESEARCH.md Pitfall §3 lines 399-403 lists `agent-runs.ts` and `classifier-spotcheck-sampler.ts` as additional importers).

**Version bump pattern** (line 78):
```typescript
export const BODY_VERSION = "2026-04-23.v1" as const;
```
Phase 69 D-Discretion bumps this to `"2026-05-04.v2"`. RESEARCH.md Pitfall §1 lines 381-391 lists the 5-7 places that must be updated atomically.

---

### `web/lib/automations/debtor-email/coordinator/entity.generated.ts` (NEW)

**Analog:** RESEARCH.md "Pattern 2" lines 285-326 (no existing `*.generated.ts` in repo; this is a new convention).

**Codegen header pattern (NEW convention):**
```typescript
// AUTO-GENERATED by scripts/gen-entity-types.ts. DO NOT EDIT.
// Source: public.swarms.entity_brand for swarm_type='debtor-email'.
// Run: npm run codegen
// Brands: <count> (<comma-list>)
export const ENTITY_BRANDS = ["berki", "sicli-noord", ...] as const;
export type Entity = "berki" | "sicli-noord" | ...;
```

**`as const` literal-union pattern** (already used at `coordinator/types.ts:9-15`):
```typescript
export const ENTITY = ["smeba", ...] as const;
export type Entity = (typeof ENTITY)[number];
```
The codegen output uses the **direct union** (`"smeba" | "berki" | ...`) per RESEARCH.md Pattern 2 line 321 — both are TS-equivalent, but direct-union renders as a single line and diffs cleanly when brands are added/removed. Keep the `as const` array too so downstream code can iterate at runtime.

**Stable-diff requirement:** sort codes alphabetically before emit (RESEARCH.md Pattern 2 line 313: `codes.sort()`).

---

### `scripts/gen-entity-types.ts` (NEW)

**Analog:** `web/scripts/audit-orq-agents.ts` (existing tsx script with same Supabase service-role + dotenv pattern)

**Shebang + JSDoc header pattern** (lines 1-23):
```typescript
#!/usr/bin/env tsx
/**
 * Orq.ai agent ↔ catalog audit
 *
 * Cross-checks every model ID stored in `public.orq_agents` ...
 *
 * Run locally: `npx tsx scripts/audit-orq-agents.ts`
 * CI gate:    `npm run audit:orq-agents` (exits non-zero on any mismatch)
 *
 * Env required (web/.env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ORQ_API_KEY ...
 */
```

**Env-loader + supabase-client pattern** (lines 25-40):
```typescript
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "✗ NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set",
  );
  process.exit(1);
}
```
**Reuse:** Same env-loader, same exit-on-missing pattern. Phase 69 doesn't need `ORQ_API_KEY` — drop that var.

**Alternative env-loader (no dotenv dep)** — `scripts/phase-65-regression-backfill.ts` lines 28-50 has a minimal in-script `.env.local` parser. Pick `audit-orq-agents.ts` style (uses `dotenv` package which is already a dep) for simplicity.

**File-write + exit pattern (RESEARCH.md Pattern 2 lines 290-325):**
```typescript
import { writeFileSync } from "node:fs";
const OUT_PATH = resolve(__dirname, "../web/lib/automations/debtor-email/coordinator/entity.generated.ts");
// ... query, build content ...
writeFileSync(OUT_PATH, content);
console.log(`Wrote ${OUT_PATH} with ${codes.length} brands.`);
```
**Idempotency**: write only when content differs (compare with `readFileSync` + string equality before write) — keeps CI git-clean checks fast. Otherwise CI fails with "uncommitted codegen output".

**`package.json` script entry** (analog: existing `audit:orq-agents` line in `web/package.json`):
```json
"audit:orq-agents": "tsx scripts/audit-orq-agents.ts"
```
**Phase 69 add:** `"codegen": "tsx ../scripts/gen-entity-types.ts"` (path is relative to `web/` since npm scripts run from `web/`; D-13 puts the script at repo-root `scripts/`).

---

### `web/lib/automations/debtor-email/__tests__/canonicalisation/**` (NEW tests + fixtures)

**Analog 1 (handler integration test):** `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`

**Vi-mock setup pattern** (lines 9-37):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));

vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/coordinator/detect-emotion", () => ({
  detectEmotion: vi.fn(async () => ({ match: false })),
}));
```

**Chainable supabase-admin stub pattern** (lines 44-80) — programs `.from(<table>)` with per-table responses including the `entity` field on `labeling_settings`:
```typescript
vi.mock("@/lib/supabase/admin", () => {
  function makeChainForTable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === "labeling_settings") {
        return Promise.resolve({
          data: { dry_run: true, entity: "smeba", icontroller_company: null },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    ...
  }
});
```
**Reuse for canonicalisation tests:** parameterise `entity: <code>` per fixture (smeba, sicli-sud, etc.). Add `.from("swarms")` mock returning the jsonb-of-objects `entity_brand` array so `loadBrandRegister` succeeds without a real DB.

**Analog 2 (registry-loader unit test):** `web/lib/swarms/__tests__/registry.test.ts` (lines 1-80)

**Mock-supabase-with-call-counter pattern** (lines 33-95):
```typescript
function makeAdmin(opts: {
  swarm?: () => SwarmResult;
  categories?: () => CategoriesResult;
  intents?: () => IntentsResult;
}): {
  admin: SupabaseClient;
  swarmCalls: { count: number };
  ...
} {
  const swarmCalls = { count: 0 };
  const swarmsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      swarmCalls.count += 1;
      return opts.swarm ? opts.swarm() : { data: null, error: null };
    }),
  };
  ...
}
```
**Reuse for `brand-register.test.ts`:** Reuse the `swarmsBuilder` shape — `loadAllBrandRegisters` reads through `loadSwarm`, so the mock is identical. Add assertions for: cache hit (call-count stays at 1 across two reads), missing-brand throw (`loadBrandRegister(...,'unknown-brand')` rejects), string-shape detection throw (jsonb-of-strings row triggers the migration-not-run guard).

**Live-smoke gate pattern (RESEARCH.md "Don't Hand-Roll"):** `it.skipIf(process.env.LIVE_SMOKE !== "1")(...)` — gates the 3 live Orq calls behind an env flag so CI stays cost-free.

**Fixture-row pattern (vitest `describe.each`):** RESEARCH.md "Don't Hand-Roll" line 360 recommends `describe.each(fixtures)`. Each fixture row is `{ brand_code, expected_register_language, expected_signoff, expected_formal_address, email_payload }`.

---

### `Agents/debtor-email-swarm/agents/debtor-copy-document-body-agent.md` (MODIFY)

**Analog:** itself (existing frontmatter + Configuration table).

**Frontmatter version-bump pattern** (lines 1-12):
```yaml
---
key: debtor-copy-document-body-agent
role: Debtor Copy-Document Cover-Letter Generator
version: 2026-04-23.v1                      # Phase 69 → "2026-05-04.v2"
swarm: debtor-email-swarm
phase: 1
pattern: external-orchestration (Inngest)
orqai_id: "01KQECMBEMRKX28E0F0T64A43K"
deployed_at: "2026-04-30T00:00:00Z"          # Phase 69 → "2026-05-04T..."
deploy_channel: "mcp"
---
```
**Phase 69 changes:** bump `version` + `deployed_at`; ALSO change `swarm` from `debtor-email-swarm` to a value reflecting `swarm_type='cross-cutting'` if convention demands (D-08 — operator decides at Wave 4).

**Model spec section (lines ~25-40)** lists 4 fallbacks; one is `mistral/mistral-large-latest` which CLAUDE.md forbids (RESEARCH.md Pitfall §7 lines 422-425). Phase 69 fix: replace with `mistral/mistral-large-2411` (dated pin) as part of the same Wave 4 PATCH.

**Prompt body refactor (D-05):** Replace the `<entity_register>` block (5 hardcoded `<entity code="...">...` children) with a single templated `<brand_register>` block. CONTEXT.md lines 119-130 has the new XML shape. Variables-block in Orq Studio also gets the new `brand_register` object key.

---

### `web/package.json` (MODIFY — add `codegen` script)

**Analog:** itself, existing `scripts` block:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "audit:orq-agents": "tsx scripts/audit-orq-agents.ts"
}
```
**Phase 69 add (one entry):**
```json
"codegen": "tsx ../scripts/gen-entity-types.ts"
```
Note the `../scripts/` path: existing `audit:orq-agents` points at `scripts/audit-orq-agents.ts` which resolves to `web/scripts/audit-orq-agents.ts` (verified). For Phase 69, D-13 places the new codegen at repo-root `scripts/gen-entity-types.ts`, so the npm script needs `../scripts/`. Alternative: place codegen at `web/scripts/gen-entity-types.ts` to match the existing audit-script convention — recommend the planner pick consistent location and set the path accordingly.

---

## Shared Patterns

### Replay-safety in Inngest workers (CLAUDE.md Phase 65 learning)
**Source:** CLAUDE.md "Inngest" section + `classifier-invoice-copy-handler.ts:75-90, 254-284`
**Apply to:** Any `step.run` block touching `loadBrandRegister`.
**Rule:** Async lookups (`loadBrandRegister`, `createAdminClient`) inside the same `step.run` that uses their result. Do NOT hoist to outer function scope or close over them across multiple `step.run` blocks. Pass results forward via the Inngest-returned object only.

### Supabase service-role admin client
**Source:** `web/lib/supabase/admin.ts` (`createAdminClient`); used at `classifier-invoice-copy-handler.ts:69` and `audit-orq-agents.ts:25-40`
**Apply to:** `brand-register.ts`, `gen-entity-types.ts`, every test mock.
**Rule:** Server-only. Codegen scripts in `scripts/` use `createClient` directly with env vars; runtime workers call `createAdminClient()`.

### Migration letter-suffix convention
**Source:** Phase 68 (`20260504a`, `20260504b`); Phase 69 continues with `20260505a`, `20260505b`.
**Apply to:** Both new SQL files.
**Rule:** Date prefix + `a`/`b`/... letter suffix per migration-of-the-day; consistent ordering by file name.

### Orq agent update flow (CLAUDE.md `cba7352b` learning)
**Source:** CLAUDE.md "Orq.ai" section.
**Apply to:** Wave 4 prompt PATCH (NOT a code commit; runs at execution time).
**Rule:** `list_models` → `get_agent` (capture baseline to `orq-baseline-prompt.txt`) → `update_agent` PATCH → `get_agent` verify. Never `create_agent` (drops `response_format`) or `delete + create` (loses orqai_id and analytics).

### Test-cache reset
**Source:** `registry.ts:117-122` (`__resetCacheForTests`)
**Apply to:** `brand-register.ts` and any test importing it.
**Rule:** Module exports a `__resetCacheForTests()` that clears every Map declared at module top-level. Tests call it in `beforeEach`.

### Last-known-good fallback on Supabase error
**Source:** `registry.ts:39-42, 63-66, 87-90`
**Apply to:** `loadAllBrandRegisters`.
**Rule:**
```typescript
if (error) {
  if (hit) return hit.value;   // last-known-good
  return [];                   // empty array, never throw at this layer
}
```
EXCEPTION (Phase 68 D-12 / Phase 69 D-11): `loadBrandRegister(swarm, brand_code)` THROWS on missing brand_code (no fallback). The list-load tolerates errors; the single-lookup is strict.

## No Analog Found

No files in this phase lack an analog. The codegen pattern (`scripts/gen-entity-types.ts` → `entity.generated.ts`) is new to the repo, but the *script-shape* is fully analogous to `web/scripts/audit-orq-agents.ts` and the *output-shape* is fully analogous to the `as const` literal-union pattern at `coordinator/types.ts:9-15`. Treat the combination as the "novel" piece; both halves have strong precedent.

## Metadata

**Analog search scope:**
- `supabase/migrations/` (all dated SQL files)
- `web/lib/swarms/` (registry + types + tests)
- `web/lib/inngest/functions/` (handler + test analog)
- `web/lib/automations/debtor-email/coordinator/` (types, body-agent invocation)
- `web/scripts/` and `scripts/` (existing tsx utilities)
- `Agents/debtor-email-swarm/agents/` (Orq paste-source spec)

**Files scanned:** 12 (all read targeted, no full-tree scans).
**Pattern extraction date:** 2026-05-04
