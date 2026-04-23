# debtor-payment-dispute-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Draft empathetic acknowledgment + internal-routing note for payment disputes, flagging dispute type.

## Trigger
```
intent_result.intent == "payment_dispute"
```

## Input sketch
```json
{
  "email": { "...same as body-agent input..." },
  "intent_result": { "intent": "payment_dispute", "sub_type": "already_paid|incorrect_amount|service_not_delivered|other" },
  "payment_history": "TBD — NXT lookup via Inngest step"
}
```

## Output sketch
- Acknowledgment HTML + structured dispute tag for debtor-team queue.

## Open decisions (phase 2 `/orq-agent` re-run)
- Model tier (Sonnet vs Haiku)
- NXT payment-history tool contract
- De-escalation prompt calibration (emotional category by default)
