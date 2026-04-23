# debtor-address-change-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Extract new address fields from free-text request, emit structured update proposal for NXT customer record (human confirms before write).

## Trigger
```
intent_result.intent == "address_change"
```

## Input sketch
```json
{
  "email": { "...same as body-agent input..." },
  "intent_result": { "intent": "address_change" },
  "current_customer_record": "TBD — NXT lookup via Inngest step"
}
```

## Output sketch
```json
{
  "proposed_address": { "street": "...", "city": "...", "postal_code": "...", "country": "..." },
  "confidence_per_field": { "street": "high|medium|low", "..." },
  "ack_html": "<p>...reply confirming receipt...</p>"
}
```

## Open decisions (phase 2)
- Write-back tool contract (NXT customer update via Zapier)
- Address validation (Postcode API Nederland / BE)
- Language-specific extraction heuristics
