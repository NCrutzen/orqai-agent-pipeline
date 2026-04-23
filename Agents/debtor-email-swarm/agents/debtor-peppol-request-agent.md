# debtor-peppol-request-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Handle Peppol enrollment / e-invoicing requests; generate reply with enrollment instructions per entity.

## Trigger
```
intent_result.intent == "peppol_request"
```

## Input sketch
```json
{
  "email": { "..." },
  "intent_result": { "intent": "peppol_request", "sub_type": "enrollment|endpoint_change|format_question" },
  "entity_peppol_config": "TBD — Supabase lookup (entity → Peppol ID + contact)"
}
```

## Output sketch
- HTML reply with entity-specific enrollment instructions OR Peppol endpoint.

## Open decisions (phase 2)
- `entity_peppol_config` data-model (Supabase table structure)
- NL vs BE regulatory copy-text per language
- Escalation path for unsupported formats
