# debtor-contract-inquiry-agent (STUB — phase 2)

**Status:** placeholder only. Not built in phase 1.

## Role
Classify contract-related question (renewal / termination / terms) and route to CRM/contract owner with summary.

## Trigger
```
intent_result.intent == "contract_inquiry"
```

## Input sketch
```json
{
  "email": { "..." },
  "intent_result": { "intent": "contract_inquiry", "sub_type": "renewal|termination|terms_question|pricing" },
  "crm_contract_lookup": "TBD — CRM has no API (browser automation), phase 2 tool"
}
```

## Output sketch
- Summary for CRM-owner routing + optional holding reply to customer.

## Open decisions (phase 2)
- CRM tool contract (Browserless + Playwright, similar to iController)
- Contract-owner routing table (entity → owner email)
- Which sub-types escalate vs. auto-reply
