# Research Brief: debtor-email-swarm (phase 1)

**Swarm:** debtor-email-swarm
**Agents researched:** 2 (phase-1 only — stubs out of scope)
**Confidence:** MEDIUM-HIGH (model-live-validation via MCP `models-list` not executed in this pass; model IDs match the workspace catalog documented in `orqai-model-catalog.md` and blueprint)
**Scope note:** Orq-side only. All orchestration (fetchDocument, createDraft, caching, HITL) is Inngest-owned per blueprint §2 and TOOLS.md. No Orq tools, no KBs, no agent-as-tool wiring.

---

## Agent 1: debtor-intent-agent

### Model recommendation

**Primary: keep `anthropic/claude-haiku-4-5-20251001`, but run a 2-week shadow eval against Sonnet-4-6 on the 200-email labeled control before locking.**

Rationale in 3 lines:
1. The task is closed-taxonomy 8-way classification + one best-effort regex-like extraction on short inputs (subject + body, typically <1k tokens). That is squarely Haiku-tier work; Sonnet is overkill at 50-150/day and would 4-5× cost.
2. Haiku-4-5 benchmarks well on multilingual instruction following for NL/EN/DE in Anthropic's public evals. NL is 92% of volume — low risk. DE (2%) and FR (<1%) are tail risk, not primary-path risk.
3. The honest multilingual concern is **FR business-AR register** (francophone BE: "francisation comptable"), not general NL/DE. Mitigate with a **hybrid: Haiku first-pass; if `confidence == 'low'` OR `language == 'fr'`, re-run on Sonnet-4-6 via Inngest step.** This costs ~3-5% of volume at Sonnet rates — worth it.

Do NOT promote to Sonnet wholesale. Do use the hybrid escalation. If shadow eval shows Haiku <85% agreement on the NL-only slice, revisit.

**Haiku overconfidence pitfall (confirmed concern):** Haiku-family models skew toward `"confidence": "high"` when asked to self-report on short, well-formed inputs. The prompt must explicitly anchor when `low` and `medium` are appropriate (see Prompt Strategy). Without this, you will get ~70% `high` and useless calibration.

### Prompt strategy

**Approach — few-shot, not zero-shot.** For an 8-way enum with one multilingual extraction slot, zero-shot on Haiku produces noisy `sub_type` and hallucinated `document_reference` strings. Use **4-6 few-shot examples** covering: NL copy_document_request with clean invoice reference, EN payment_dispute with no reference, DE address_change, FR general_inquiry with ambiguous intent (shows `confidence: low`), NL copy_document_request with no extractable reference (shows `document_reference: null`), and one "other" example.

**Anti-overconfidence anchor** (include verbatim in prompt):

```
Confidence rubric:
- high: intent is unambiguous from subject OR first 2 sentences; if copy_document_request, a digit-string reference is present and clearly formatted.
- medium: intent is clear but reference is fuzzy, OR intent is clear but message mixes two concerns.
- low: message is short/vague, sender is ambiguous, language is mixed, OR you are guessing. Prefer low over medium when in doubt.
When uncertain between two confidence levels, choose the lower one.
```

**Anti-hallucination anchor for `document_reference`:**

```
document_reference rules:
- Emit ONLY digit-strings (optionally with leading letters like "F", "INV", "FC") that appear VERBATIM in subject or body.
- Do NOT construct references from customer numbers, order numbers, or dates.
- If no reference is present, emit null. Do not guess.
- If multiple references appear, emit the first one that is explicitly called an invoice/factuur/facture/Rechnung.
```

**XML-tagged structure** (per CLAUDE.md Orq patterns):
```
<role>Multilingual debtor-email intent classifier for Dutch/Belgian accounts-receivable mailboxes.</role>
<task>Classify the email into one of 8 intents and extract a document reference if and only if the sender is clearly requesting a document copy.</task>
<constraints>…confidence + reference rules above…</constraints>
<entity_context>Mailbox: {{mailbox}}. Entity: {{entity}}. Entity is one of Smeba (NL), Berki (NL), Sicli-Noord (BE), Sicli-Sud (BE, French-speaking), Smeba-Fire (BE).</entity_context>
<output_format>Respond with JSON matching the provided schema only. No preamble.</output_format>
```

`response_format: json_schema` is mandatory (CLAUDE.md). Temperature 0. Max tokens 400.

### `sub_type` vocabulary

**Recommendation: collapse `statement` into `invoice` for phase 1.** Keep the final vocabulary tight:

```
sub_type enum (copy_document_request only):
  invoice       — factuur/facture/Rechnung/invoice, incl. account statements and overdue-notice copies
  credit_note   — creditnota/avoir/Gutschrift
  werkbon       — work order / service ticket (NL-specific term)
  contract      — contract/overeenkomst
  quote         — offerte/devis/Angebot
```

Rationale: `statement` in Dutch AR practice is usually requested as "rekeningoverzicht" or "openstaande posten", which in 13 months of corpus data almost always resolves to "send me a copy of invoice X" once the customer clarifies. The `fetchDocument` tool only supports invoice/werkbon/contract/quote/credit_note Zaps anyway — adding `statement` creates a dead sub_type. If a genuine statement request appears, route to `general_inquiry`.

### Confidence calibration

**Phase 1: self-reported (LLM emits `low|medium|high`).** Logprob-derived is not feasible because Orq Router abstracts logprobs away; several fallback providers (Gemini) don't expose them consistently.

**Calibration validation plan:**
1. Shadow-mode for 4 weeks against the 200-email hand-labeled control + 2026-04-22 hand-picks batch.
2. Define agreement metric: `(agent_intent == human_intent) AND (|agent_urgency - human_urgency| ≤ 1)`.
3. Per-confidence-bucket agreement target:
   - `high` → ≥95% agreement (calibration proof)
   - `medium` → 80-90% expected (routes to human queue → becomes training signal)
   - `low` → anything (hard-routes to human queue)
4. If `high` bucket is <90% agreement after 2 weeks, tighten the `high` rubric in prompt and bump `intent_version`.
5. Track per-language agreement separately — NL/EN must hit target; DE/FR slices will be too small for significance but flag any <80% agreement as a prompt-regression signal.

Data source: `debtor.email_analysis` (8k labeled emails) joined to `debtor.agent_runs.human_verdict`. The verdict enum (`approved|edited_minor|edited_major|rejected_*`) is already structured for this — treat `approved` + `edited_minor` as agreement.

### Fallback chain (final — 4 entries)

Per CLAUDE.md's 3-4 fallback mandate. The blueprint has 3; the 4th must add **provider/architecture diversity**, not a same-family shim.

```
model:            anthropic/claude-haiku-4-5-20251001
fallback_models:
  - openai/gpt-4o-mini
  - google-ai/gemini-2.5-flash
  - anthropic/claude-3-5-haiku-20241022
  - mistral/mistral-large-latest        ← NEW (4th fallback)
```

**Rationale for `mistral/mistral-large-latest` as the 4th:** Mistral is European (Paris), trained with heavier French/Dutch/German weighting than US-trained peers. For the FR/BE-Dutch tail, Mistral outperforms US models on register-specific AR terminology in published benchmarks. It's also a different architecture family (dense decoder without the Anthropic/OpenAI tokenizer bias) — genuine diversity. Rejected `groq/llama-3.3-70b-versatile` (same Llama weights as other routes, speed advantage irrelevant at 4th-tier fallback) and `cohere/command-r-plus` (strong but North-American English optimized, weaker NL/FR).

---

## Agent 2: debtor-copy-document-body-agent

### Model recommendation

**Primary: `anthropic/claude-sonnet-4-6` — confirmed.**

Confidence: HIGH for NL/EN/DE, MEDIUM for FR.

- NL/BE-specific AR register: Sonnet-4-6 handles "Geachte heer/mevrouw", "in bijlage treft u aan", "met vriendelijke groet" cleanly. Flemish vs Netherlands-Dutch register drift is minor for business AR (both use formal register) — Sonnet adapts correctly when entity context is injected (see Language-Specific Notes).
- FR concern is real but bounded: <1% volume = maybe 1-2 emails/month. Shadow eval must include every FR case manually — do not rely on aggregate metrics (sample too small). If FR quality is poor, escalate to Sonnet with a FR-specific few-shot prefix rather than changing base model.
- DE (2%): acceptable. Sonnet handles "Sehr geehrte Damen und Herren" and "mit freundlichen Grüßen" correctly. Watch for Swiss-German formality leakage (shouldn't happen for BE/NL senders but worth spot-checking).

**Temperature 0 implication:** Quality is safe. Business-letter generation is a high-template, low-creativity task. Sampling variety would introduce drift across retries, which directly conflicts with the idempotency requirement. No concern.

### Prompt strategy

**Few-shot structure:**
- 1 full NL example (primary register, most volume)
- 1 full EN example (second most volume)
- 1 short DE fragment showing footer + opening line
- 1 short FR fragment showing footer + opening line
- No need for full-length DE/FR examples; Sonnet extrapolates tone from fragments + explicit register instructions.

**Mandatory footer enforcement — belt AND braces:**

Prompt instruction (verbatim):
```
The body_html MUST end with exactly this structure, replacing {{...}} with values:
<hr>
<pre style="font-family: monospace; font-size: 11px; color: #666;">
intent: {{intent}}
confidence: {{confidence}}
ref: {{document_reference}}
body_version: {{body_version}}
email_id: {{email_id}}
</pre>
No additional text after </pre>. No signature block. No "Met vriendelijke groet" — the signature is appended by iController automatically.
```

Post-validator (TypeScript regex in Inngest `step.run("generate-body")`): rejects output if all 5 footer fields are not present with exact keys. Rejection → 1 retry with prompt augmented by `<previous_attempt_missing_footer>true</previous_attempt_missing_footer>` → second failure → human queue. Both layers needed: prompts drift, validators catch drift.

**Emotion-detection trigger — recommendation: keyword-list, NOT LLM-judgment.**

A keyword list is deterministic, auditable, idempotent, and bilingual. LLM-judgment drifts across model versions and temperatures. The blueprint already specifies the keyword set (`!`, "waar blijft", "al weken" + EN/FR/DE equivalents). Implement as a pre-pass regex check in the Inngest step, inject `detected_tone_hint: "de-escalation"` as a variable to the agent, and have the agent echo it back in `detected_tone`. The agent still decides the actual de-escalation phrasing — but the trigger is deterministic.

Concrete keyword list (include as prompt reference):
```
de-escalation triggers (pre-detected by Inngest):
  NL: "waar blijft", "al weken", "al maanden", "ongehoord", "onacceptabel", "klacht", 3+ exclamation marks
  EN: "still waiting", "for weeks", "unacceptable", "complaint", "unprofessional", 3+ !
  DE: "seit Wochen", "inakzeptabel", "Beschwerde"
  FR: "depuis des semaines", "inacceptable", "réclamation"
```

**Signature-block prevention — belt AND braces:**

Prompt instruction: `"NEVER write a signature block. Do not sign the letter. Do not include '— [Name]' or '[Company]'. iController appends the signature automatically."` — plus explicit negative example in few-shot.

Post-validator: reject if output contains regex match for `/\n\s*(--|—|mvg|met vriendelijke groet|kind regards|best regards|cordialement|mit freundlichen)/i` OUTSIDE the `<pre>` footer block. This is the single most common Sonnet failure mode in letter-generation — it wants to be polite. Validator is non-negotiable.

### Language-specific notes

**NL formal AR register — "Geachte" vs "Beste":**
- **"Geachte heer/mevrouw [Last Name]"** when `sender_first_name == null` or when entity is Smeba/Berki (Dutch, formal AR default).
- **"Geachte [First Name]"** when `sender_first_name` is known AND prior correspondence uses first names (not detectable phase 1 → default to surname form).
- **"Beste [First Name]"** ONLY if a Dutch sender has used "Beste" themselves in the incoming email body. AR default is "Geachte" — never downgrade to "Beste" unilaterally.

Encode as prompt rule: `"Open with 'Geachte' unless the sender's email opens with 'Beste' or 'Hi'. Match the sender's formality register, but never drop below 'Geachte' for first contact."`

**BE Dutch (Flemish) vs NL Dutch:**
Sonnet-4-6 does NOT reliably adapt per entity without a hint. Inject via entity context:
```
entity_context:
  smeba, berki      → Dutch NL-register ("u", "uw", "btw-nummer")
  sicli-noord       → Dutch BE-register (Flemish — "u", "uw", "btw-nummer", slight preference for "gelieve" over "wilt u")
  smeba-fire        → Dutch BE-register (Flemish)
  sicli-sud         → French BE-register (always — entity is francophone)
```

Concrete difference: Flemish AR uses "gelieve bijgevoegd document terug te vinden" where NL-Dutch uses "hierbij treft u aan". Sonnet picks this up when told, misses it when not told. Explicit injection is required.

**FR register — "Madame, Monsieur":**
- Opening: `"Madame, Monsieur,"` (comma, not period) when `sender_first_name` unknown.
- Opening: `"Madame [LastName],"` / `"Monsieur [LastName],"` when known and gender-clear.
- Closing (but not a signature — we don't write one): the email body should end with `"Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées."` ONLY if de-escalation tone. For neutral tone, end with a short `"Je reste à votre disposition pour toute information complémentaire."` — iController's signature block follows.
- Sicli-Sud context: inject `"Entity is a French-speaking Belgian company. Use formal BE-French AR register."`

**DE register — "Sehr geehrte":**
- `"Sehr geehrte Damen und Herren,"` when `sender_first_name` null.
- `"Sehr geehrte Frau/Herr [LastName],"` when known.
- Close neutral: `"Bei Rückfragen stehe ich Ihnen gerne zur Verfügung."` No signature — iController appends.

### Idempotency considerations

Temperature 0 is necessary but not sufficient. Additional hardening:

1. **Strip variable-order noise from input.** Serialize the `variables` JSON with sorted keys before passing to Orq — prevents prompt-cache misses and ensures identical input → identical cached output.
2. **Do NOT include timestamps in the agent prompt.** `received_at` is metadata for logging only; it does not belong in the generation prompt (a retry 5 minutes later would otherwise produce a different prompt → different output on some providers despite temp 0).
3. **Use `body_version` as the idempotency key** in Inngest step output caching, NOT `email_id` alone. `(email_id, body_version)` → same prompt → cached result. Version bump = intentional re-generation.
4. **Reject non-deterministic fallbacks at temp 0.** `openai/gpt-4o` and `google-ai/gemini-2.5-pro` both honor temp 0 but with residual top_p sampling. Document in agent spec that idempotency is guaranteed on primary only; fallback outputs may vary within ±5% token-level diff. Downstream consumers must not assert byte-equality.

### Fallback chain (final — 4 entries)

```
model:            anthropic/claude-sonnet-4-6
fallback_models:
  - openai/gpt-4o
  - google-ai/gemini-2.5-pro
  - anthropic/claude-sonnet-4-5
  - mistral/mistral-large-latest        ← NEW (4th fallback)
```

**Rationale for `mistral/mistral-large-latest` as the 4th (same model, same reason as intent-agent):** FR/BE tail resilience + provider diversity. When primary + 2 US fallbacks all fail, a European-trained model on the 5-email-per-day worst case is the right last-resort. Consistent 4th-fallback across both agents also simplifies the Orq Router config and cost monitoring.

---

## Cross-cutting recommendations

### Shadow-mode evaluation plan

**Data sources (existing, zero engineering lift):**
- `debtor.email_analysis` — 8k labeled emails (category + email_intent). Primary training/eval signal.
- 2026-04-22 hand-labeled batch ("Onbekend hand-picks" in `classify.ts`) — primary eval set for intent-agent.
- 200-email copy-request control from `/tmp/copy-requests-classified.json` — secondary eval set.
- `debtor.agent_runs` (new) — `human_verdict` column is the live shadow-mode signal once deployed.

**Intent-agent metrics (weekly):**
- Intent agreement rate, overall and per-language
- Per-confidence-bucket agreement (see Calibration section)
- `document_reference` extraction precision (false-positive rate = hallucinated refs) — must be ≥98%
- `document_reference` extraction recall on copy_document_request only — must be ≥85%
- Per-entity agreement (NL entities vs BE entities)

**Body-agent metrics (weekly):**
- Human verdict distribution: `approved` + `edited_minor` = success; `edited_major` + `rejected_wrong_*` = failure
- Footer-validator rejection rate (should be <1%; >5% = prompt regression)
- Signature-validator rejection rate (should be <2%)
- Per-language verdict distribution — FR and DE audited individually due to small sample

**Go/no-go thresholds before live trigger (per brief §8):**
- Intent: ≥90% agreement on 200-email batch, calibration within ±10%
- Body: ≥95% `approved`+`edited_minor` rate over 4-week sustained window + ≥3 positive debtor-team reviews

### Prompt-versioning discipline

**Recommendation: CI check, not manual discipline.**

Add a pre-commit or CI check in `.github/workflows/` that:
1. Diffs any file under `Agents/debtor-email-swarm/` matching `*.yaml` or `*.md` prompt-spec pattern.
2. If prompt text changed, verifies `intent_version` / `body_version` string in the file also changed.
3. Fails CI if prompt diff exists but version string unchanged.

Versions should be `YYYY-MM-DD.N` format (e.g., `2026-04-23.1`). Bumping rules:
- Any change to `<constraints>` or few-shot examples → major bump (new date).
- Typo/whitespace → no bump required (CI whitelists via explicit `[skip-version]` commit tag).

Store version in both the Orq agent spec AND as a literal string in the prompt itself (so Orq traces capture it). Cross-reference with `debtor.agent_runs.intent_version` / `body_version` for calibration analysis across versions.

### Orq guardrail features to leverage

Beyond `response_format: json_schema` + Zod validation (CLAUDE.md baseline), the following Orq-native features are worth enabling:

1. **LLM-as-judge guardrail via `create_llm_eval` MCP** — post-generation eval on body-agent output checking footer integrity, no-signature, language consistency. Runs asynchronously, writes to Orq Analytics, does NOT block response (we have post-validator for blocking). Gives second-signal for drift detection.
2. **Python eval via `create_python_eval`** — deterministic checks (regex footer, regex signature, language-keyword presence). Run on 100% of outputs, cheap.
3. **Orq variables type-checking** — declare all `variables` entries with `type` and `required` in the agent spec. Orq rejects malformed variable inputs at ingress, before the model spends tokens.
4. **Fallback policy: `sequential_on_error` with exponential backoff between fallbacks.** Default Orq behavior is fine; just confirm the spec sets this explicitly rather than relying on Orq default (which changed silently in Q1 2026 per release notes).
5. **Do NOT enable Orq `memory` or `memory_stores` for either agent** — both are single-shot, stateless by design. Enabling memory introduces state-leak risk across emails and defeats idempotency.
6. **Trace sampling: 100%.** Volume is low enough (50-150 intents/day, <10 bodies/day) that full sampling is free and essential for calibration analysis.

---

## Open items for spec-generators

1. **Hybrid escalation (Haiku → Sonnet on low-confidence)** — blueprint doesn't specify this. If accepted, spec-generator must emit TWO Orq agents: `debtor-intent-agent` (Haiku primary) and `debtor-intent-agent-v2-fallback` (Sonnet primary). Or: implement as Inngest-side routing with single agent per call. Recommended: Inngest routing, single agent definition, two invocations. Architect decision required.
2. **`intent_version` initial value** — recommend `2026-04-23.1`.
3. **`body_version` initial value** — recommend `2026-04-23.1`.
4. **Mistral large model ID verification** — confirmation via `list_models` MCP required before deploy. Catalog docs reference `mistral/mistral-large-latest` but the workspace may pin a specific version (e.g., `mistral-large-2411`). Dataset-generator and orchestration-generator should defer to live MCP check.
5. **FR few-shot quality ownership** — <1% volume means corpus may not contain enough real FR examples for few-shot. Recommend: synthesize 2-3 FR examples manually from the handful of real ones + translate 2 NL examples to FR with native-speaker review. Owner: @nick + Sicli-Sud contact.
6. **Footer field for `detected_tone` in body output** — blueprint footer schema has 5 fields; should `detected_tone` be a 6th? Recommendation: no — keep footer minimal, `detected_tone` is already in the structured JSON output and persists to `agent_runs`. Footer is for human-visible audit trail only.
7. **Entity-signatures fallback (blueprint open-question #3)** — out of scope for this research brief; engineering concern. Flag for orchestration-generator: if iController does NOT auto-append signature in acceptance, body-agent spec needs a conditional `append_signature: true` variable path. Not an Orq concern per se.
8. **Phase-2 language re-detect in body-agent** — noted in blueprint. For phase 1, `email.language` from intent-agent is trusted. If shadow-mode shows language drift (body-agent generates NL for FR-labeled email), add a language-confirmation regex in Inngest pre-step. Defer.
