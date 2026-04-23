# debtor-credit-request-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Acknowledge credit-note request, extract context (invoice ref, amount, reason), route to debtor team for approval.

## Trigger
```
intent_result.intent == "credit_request"
```

## Input sketch
```json
{
  "email": { "..." },
  "intent_result": { "intent": "credit_request", "document_reference": "invoice-nr to be credited" },
  "nxt_invoice_lookup": "TBD — Inngest step"
}
```

## Output sketch
```json
{
  "extracted_credit_request": {
    "invoice_reference": "...",
    "claimed_amount": "...",
    "reason": "incorrect_charge|return_goods|service_dispute|...",
    "language": "nl|en|de|fr"
  },
  "ack_html": "<p>...holding reply acknowledging request...</p>"
}
```

## Open decisions (phase 2)
- Auto-approve threshold (low-value credits under X euro)
- NXT credit-note creation tool (Zapier)
- Approval workflow UI in swarm page
