---
phase: 87
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - web/lib/automations/debtor-email/coordinator/invoke-intent.ts
  - web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts
autonomous: true
requirements: [REQ-87-06]
tags: [phase-87, invoke-intent, telemetry, non-breaking]
must_haves:
  truths:
    - "invokeIntentAgent() returns usage telemetry (input_tokens, output_tokens, total_tokens) alongside output/raw"
    - "All existing callers of invokeIntentAgent() continue to compile and behave unchanged"
    - "The new `usage` field reflects Orq /responses `usage` block (RESEARCH.md A2 verified)"
  artifacts:
    - path: web/lib/automations/debtor-email/coordinator/invoke-intent.ts
      provides: "InvokeIntentResult extended with optional usage"
      exports: ["invokeIntentAgent", "InvokeIntentInput", "InvokeIntentResult"]
  key_links:
    - from: web/lib/automations/debtor-email/coordinator/invoke-intent.ts
      to: web/lib/automations/orq-agents/client.ts
      via: "invokeOrqAgentWithUsage returns usage from /responses"
      pattern: "usage.total_tokens"
---

<objective>
Extend `invokeIntentAgent()` to surface Orq token-usage telemetry without breaking any existing caller. RESEARCH.md Pitfall 2 flags this: D-03 requires total token usage per `run_id`, but today the helper only returns `{ output, raw }`. The Orq `/responses` API already carries `usage.{input,output,total}_tokens` (verified at `web/lib/automations/orq-agents/client.ts:198-208`); plumb it through.

Purpose: Plan 04's retro loop needs `usage.total_tokens` per call to accumulate into the closure summary.

Output: `InvokeIntentResult` extended with `usage?: { input_tokens: number; output_tokens: number; total_tokens: number }`; live coordinator behaviour unchanged; one new spec verifying the surface.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-RESEARCH.md
@web/lib/automations/debtor-email/coordinator/invoke-intent.ts
@web/lib/automations/orq-agents/client.ts

<interfaces>
Current shape (web/lib/automations/debtor-email/coordinator/invoke-intent.ts):
```typescript
export type InvokeIntentResult = {
  output: IntentAgentOutput;
  raw: unknown;
};
export async function invokeIntentAgent(
  input: InvokeIntentInput,
  options?: InvokeIntentOptions,
): Promise<InvokeIntentResult>;
```

Target shape (extension, additive):
```typescript
export type InvokeIntentUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};
export type InvokeIntentResult = {
  output: IntentAgentOutput;
  raw: unknown;
  usage?: InvokeIntentUsage;   // present whenever Orq returned a usage block
};
```

From web/lib/automations/orq-agents/client.ts:198-208 (RESEARCH.md A2 verified):
- `invokeOrqAgentWithUsage(...)` returns `{ output, raw, usage: { input_tokens, output_tokens, total_tokens } }` derived from Orq /responses payload.
- If `invokeIntentAgent` today calls `invokeOrqAgent` (non-usage variant), switch to `invokeOrqAgentWithUsage` and forward the usage. If it already calls the with-usage variant, just stop dropping the field.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add usage to InvokeIntentResult + plumbing</name>
  <files>
    web/lib/automations/debtor-email/coordinator/invoke-intent.ts,
    web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts
  </files>
  <behavior>
    - Test 1 (RED): when the underlying Orq client returns `usage: { input_tokens: 1500, output_tokens: 120, total_tokens: 1620 }`, `invokeIntentAgent()` resolves with `result.usage.total_tokens === 1620`.
    - Test 2: when the Orq client omits usage (older API path, edge case), `result.usage` is `undefined` and the call still resolves successfully with `output` + `raw`.
    - Test 3 (non-regression): existing callers destructuring `{ output, raw }` continue to compile (TypeScript: `usage` is optional, additive only).
  </behavior>
  <action>
    1. Read `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` to confirm which Orq helper it currently calls (`invokeOrqAgent` vs `invokeOrqAgentWithUsage`). Per RESEARCH.md the with-usage variant exists at `web/lib/automations/orq-agents/client.ts:198-208`.
    2. Write `__tests__/invoke-intent-usage.test.ts` with the 3 cases above. Mock `invokeOrqAgentWithUsage` (or whichever helper invoke-intent calls) via `vi.mock`. Run — RED.
    3. Edit `invoke-intent.ts`:
       - Add `export type InvokeIntentUsage = { input_tokens: number; output_tokens: number; total_tokens: number };`
       - Extend `InvokeIntentResult` with `usage?: InvokeIntentUsage;`
       - In the implementation, if the helper already calls a with-usage variant: forward `usage` into the return. If it calls a non-usage variant: switch to `invokeOrqAgentWithUsage` (signature compatible per RESEARCH.md) and forward `usage`.
       - Touch NOTHING else — same prompt assembly, same Zod validation, same timeout, same fallback chain. Pure extension.
    4. Run tests — GREEN. Run `cd web && npx tsc --noEmit` to verify no caller broke. Commit: `feat(87-03): surface usage telemetry from invokeIntentAgent (non-breaking)`.
  </action>
  <verify>
    <automated>cd web && npx vitest run --no-coverage lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Spec green. `tsc --noEmit` exits 0 (no caller broke). `usage` exposed on `InvokeIntentResult` as optional field.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Helper ↔ Orq /responses | Untrusted external API surface; usage block already parsed by `invokeOrqAgentWithUsage` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-87-01b | I (Info Disclosure) | Token-usage telemetry persisted to `stage_3_retro_runs.token_usage_total` | accept | Numeric metadata only; no PII. |
| T-87-regression | T (Tampering) | Breaking change to live coordinator | mitigate | Field is additive + optional; `tsc --noEmit` gate; spec covers both with-usage and without-usage paths. |
</threat_model>

<verification>
- All existing `invokeIntentAgent` callers (live coordinator, Phase 65 backfill script if extant) still compile and behave identically.
- New spec asserts the `usage` field shape.
</verification>

<success_criteria>
- [ ] `InvokeIntentResult.usage?: InvokeIntentUsage` exported
- [ ] One new spec file green
- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] Zero changes to prompt builder, Zod schema, or fallback chain
</success_criteria>

<output>
Create `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-03-SUMMARY.md` per template.
</output>
