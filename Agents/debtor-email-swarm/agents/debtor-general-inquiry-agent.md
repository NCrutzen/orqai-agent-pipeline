# debtor-general-inquiry-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Catch-all drafter for `general_inquiry` intent — produces polite holding reply in sender's language and routes to human queue.

## Trigger
```
intent_result.intent == "general_inquiry"
```

## Input sketch
```json
{
  "email": { "..." },
  "intent_result": { "intent": "general_inquiry", "language": "nl|en|de|fr" }
}
```

## Output sketch
- Short HTML holding reply: "Dank voor uw bericht, wij nemen binnen X werkdagen contact op" in `email.language`.
- Human-queue routing metadata.

## Open decisions (phase 2)
- SLA tekst per entity (werkdagen-toezegging)
- Wanneer upgraden naar meer-specifieke sub-agent (emerging pattern detection)
- Overlap met `intent=other` bucket handling
