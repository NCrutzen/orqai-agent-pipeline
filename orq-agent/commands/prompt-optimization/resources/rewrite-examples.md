# Prompt Rewrite Examples

This file is the exemplar library consumed **only** by `/orq-agent:prompt-optimization` Step 5 (rewrite). Each example is a concrete before/after pattern the skill can pattern-match against before generating a fresh rewrite.

Single-consumer: do not reference from other skills. Lives under `commands/prompt-optimization/resources/` so lint auto-excludes the path.

Each example has:

- **Original prompt** — actual-shape input.
- **Guideline gap** — one of the 11 anchor slugs from `11-guidelines.md`.
- **Why it fails** — the specific pass-criterion that breaks.
- **Rewritten prompt** — minimal intervention, `{{variable}}` placeholders preserved verbatim.
- **Diff** — unified diff of the change.

All 5 rewrites preserve `{{variable}}` tokens literally. The skill never renames or interpolates a variable without a separate approval step (variable-usage rule).

---

## Example 1 — Missing `role` + buried `task`

**Guideline gap:** `role` (absent) + `task` (buried).

**Why it fails.** `role` pass-criteria require a persona in the first 1–3 lines; this prompt opens with 4 lines of meta-context. `task` is reachable only after reading ~80 words of framing.

### Original

```
This prompt is used by our customer support automation. It was updated
last quarter to reflect new refund policies that took effect after the
pricing change. When a customer writes in, we want to make sure their
concerns are handled properly and they feel heard.

Answer the customer message below:

{{customer_message}}
```

### Rewritten

```
You are a senior customer-support agent specializing in refund policy for {{product_name}}.

## Task
Respond to the customer message below. Your response must address the customer's concern directly and reflect current refund policy.

## Customer message
{{customer_message}}
```

### Diff

```diff
-This prompt is used by our customer support automation. It was updated
-last quarter to reflect new refund policies that took effect after the
-pricing change. When a customer writes in, we want to make sure their
-concerns are handled properly and they feel heard.
-
-Answer the customer message below:
-
-{{customer_message}}
+You are a senior customer-support agent specializing in refund policy for {{product_name}}.
+
+## Task
+Respond to the customer message below. Your response must address the customer's concern directly and reflect current refund policy.
+
+## Customer message
+{{customer_message}}
```

Notes: `{{customer_message}}` preserved verbatim. `{{product_name}}` is a *new* variable — the skill flags this as a separate variable-usage decision before committing the rewrite.

---

## Example 2 — `output-format` fuzzy + missing example

**Guideline gap:** `output-format`.

**Why it fails.** "Respond in JSON" with no schema and no example. Model invents keys.

### Original

```
You are a ticket triage bot. Classify the incoming support ticket and respond in JSON.

Ticket: {{ticket_body}}
```

### Rewritten

```
You are a ticket triage bot.

## Task
Classify {{ticket_body}} and return a single JSON object matching the schema below.

## Output format
Return exactly this shape — no prose, no markdown fences:

{
  "category": "billing" | "bug" | "feature-request" | "other",
  "priority": "low" | "medium" | "high",
  "requires_human": true | false
}

### Example
Input: "My card was charged twice this month"
Output:
{
  "category": "billing",
  "priority": "high",
  "requires_human": true
}
```

### Diff

```diff
 You are a ticket triage bot.
-Classify the incoming support ticket and respond in JSON.
-
-Ticket: {{ticket_body}}
+
+## Task
+Classify {{ticket_body}} and return a single JSON object matching the schema below.
+
+## Output format
+Return exactly this shape — no prose, no markdown fences:
+
+{
+  "category": "billing" | "bug" | "feature-request" | "other",
+  "priority": "low" | "medium" | "high",
+  "requires_human": true | false
+}
+
+### Example
+Input: "My card was charged twice this month"
+Output:
+{
+  "category": "billing",
+  "priority": "high",
+  "requires_human": true
+}
```

Notes: `{{ticket_body}}` preserved verbatim.

---

## Example 3 — `stress` inflation + `unnecessary-content`

**Guideline gap:** `stress` (inflated) + `unnecessary-content` (pleasantries + duplicates).

**Why it fails.** Every bullet is marked IMPORTANT; signal is lost. Politeness phrases and a duplicated rule dilute the prompt.

### Original

```
You are a meeting-notes summarizer. Please help us summarize the meeting.

IMPORTANT: Please be concise.
IMPORTANT: Please use bullet points.
IMPORTANT: Please don't invent facts.
IMPORTANT: Please keep it short.
IMPORTANT: Thank you for helping!

Summarize: {{transcript}}
```

### Rewritten

```
You are a meeting-notes summarizer.

## Task
Summarize {{transcript}} as a bulleted list of decisions and action items.

## Guidelines
- Use bullet points.
- Each bullet ≤ 15 words.
- Include only facts present in the transcript.

IMPORTANT: Never invent facts or attribute statements to people not quoted in the transcript.
```

### Diff

```diff
-You are a meeting-notes summarizer. Please help us summarize the meeting.
-
-IMPORTANT: Please be concise.
-IMPORTANT: Please use bullet points.
-IMPORTANT: Please don't invent facts.
-IMPORTANT: Please keep it short.
-IMPORTANT: Thank you for helping!
-
-Summarize: {{transcript}}
+You are a meeting-notes summarizer.
+
+## Task
+Summarize {{transcript}} as a bulleted list of decisions and action items.
+
+## Guidelines
+- Use bullet points.
+- Each bullet ≤ 15 words.
+- Include only facts present in the transcript.
+
+IMPORTANT: Never invent facts or attribute statements to people not quoted in the transcript.
```

Notes: IMPORTANT now reserved for the single hard constraint. `{{transcript}}` preserved verbatim.

---

## Example 4 — `tool-calling` ambiguity + missing error path

**Guideline gap:** `tool-calling`.

**Why it fails.** "Use tools when appropriate" has no heuristic. No error handling specified; a tool timeout falls through silently.

### Original

```
You are an order-status assistant. You have access to lookup_order and refund_order.

Use tools when appropriate to answer {{user_message}}.
```

### Rewritten

```
You are an order-status assistant.

## Tools
- `lookup_order(order_id)` — returns current status. Call ONLY when the user provides an order ID matching /^[A-Z0-9]{8}$/.
- `refund_order(order_id, reason)` — initiates refund. Call ONLY after the user explicitly confirms the refund amount.

## Task
Answer {{user_message}}.

## Error handling
- If a tool returns an error or times out: retry once. If it fails again, respond: "I can't reach our order system right now — please try again in a few minutes or contact support@example.com."
- Never invent an order status if `lookup_order` fails.
```

### Diff

```diff
-You are an order-status assistant. You have access to lookup_order and refund_order.
-
-Use tools when appropriate to answer {{user_message}}.
+You are an order-status assistant.
+
+## Tools
+- `lookup_order(order_id)` — returns current status. Call ONLY when the user provides an order ID matching /^[A-Z0-9]{8}$/.
+- `refund_order(order_id, reason)` — initiates refund. Call ONLY after the user explicitly confirms the refund amount.
+
+## Task
+Answer {{user_message}}.
+
+## Error handling
+- If a tool returns an error or times out: retry once. If it fails again, respond: "I can't reach our order system right now — please try again in a few minutes or contact support@example.com."
+- Never invent an order status if `lookup_order` fails.
```

Notes: `{{user_message}}` preserved verbatim. Tool names match the registered tool registry exactly.

---

## Example 5 — Missing `recap` + missing `examples`

**Guideline gap:** `recap` (absent) + `examples` (absent, refusal path unmodeled).

**Why it fails.** Long prompt with no terminal anchor; model drops the JSON requirement by the end. No refusal example, so boundary cases hallucinate answers.

### Original

```
You are a legal-document clause extractor. Given a contract clause, return
a JSON object with fields: clause_type, risk_level, and recommended_action.
Clause types are: indemnity, termination, payment, liability, other.
Risk levels are: low, medium, high.
If the text is not a clause (e.g., preamble or signature block),
respond with an error message.

Clause: {{clause_text}}
```

### Rewritten

```
You are a legal-document clause extractor.

## Task
Given {{clause_text}}, return a JSON object classifying the clause.

## Output format
{
  "clause_type": "indemnity" | "termination" | "payment" | "liability" | "other",
  "risk_level": "low" | "medium" | "high",
  "recommended_action": string
}

If the input is not a clause (preamble, signature block, boilerplate), return:
{ "error": "not_a_clause" }

## Examples

Input: "Either party may terminate this agreement with 30 days' written notice."
Output:
{
  "clause_type": "termination",
  "risk_level": "low",
  "recommended_action": "Standard termination clause, no changes needed"
}

Input: "Signed on this day by the undersigned parties."
Output:
{ "error": "not_a_clause" }

Remember: return JSON only, no prose. If the input is not a clause, return `{"error": "not_a_clause"}`.
```

### Diff

```diff
-You are a legal-document clause extractor. Given a contract clause, return
-a JSON object with fields: clause_type, risk_level, and recommended_action.
-Clause types are: indemnity, termination, payment, liability, other.
-Risk levels are: low, medium, high.
-If the text is not a clause (e.g., preamble or signature block),
-respond with an error message.
-
-Clause: {{clause_text}}
+You are a legal-document clause extractor.
+
+## Task
+Given {{clause_text}}, return a JSON object classifying the clause.
+
+## Output format
+{
+  "clause_type": "indemnity" | "termination" | "payment" | "liability" | "other",
+  "risk_level": "low" | "medium" | "high",
+  "recommended_action": string
+}
+
+If the input is not a clause (preamble, signature block, boilerplate), return:
+{ "error": "not_a_clause" }
+
+## Examples
+
+Input: "Either party may terminate this agreement with 30 days' written notice."
+Output:
+{
+  "clause_type": "termination",
+  "risk_level": "low",
+  "recommended_action": "Standard termination clause, no changes needed"
+}
+
+Input: "Signed on this day by the undersigned parties."
+Output:
+{ "error": "not_a_clause" }
+
+Remember: return JSON only, no prose. If the input is not a clause, return `{"error": "not_a_clause"}`.
```

Notes: `{{clause_text}}` preserved verbatim. The `Remember:` paragraph is the `recap` anchor; refusal example added under `examples`.

---

## How the skill uses these

Step 5 of `/orq-agent:prompt-optimization` does NOT copy these examples verbatim. The skill:

1. Matches the approved suggestions against the `Guideline gap` tags above.
2. Picks the 1–2 most structurally similar examples as rewrite templates.
3. Generates a fresh rewrite preserving the caller's voice and all `{{variable}}` placeholders.
4. Presents the rewrite as a side-by-side markdown diff for approval via `AskUserQuestion` before creating a new prompt version (POPT-03).

If the skill finds a gap whose pattern isn't represented here, it falls back to the `Improvement levers` list in `11-guidelines.md` and synthesizes a rewrite from scratch.
