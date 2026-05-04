#!/usr/bin/env bash
# Phase 67 smoke — fire one synthetic debtor-email/icontroller-tag.requested
# event for a real matched-customer row on smeba.
#
# Usage:  bash scripts/phase-67-smoke.sh
#
# IMPORTANT — production blast radius:
#   This is NOT a dry-run. The tagger will:
#     1. Open Browserless session vs production iController.
#     2. Search the smeba mailbox for the email by sender+subject+received_at.
#     3. Click into the detail page.
#     4. Type customer_account_id "506909" into the accounts typeahead.
#     5. Verify the brand suffix matches /smeba/ (R-04 brand-mismatch defense).
#     6. CLICK CONFIRM — real production write to iController.
#
# Pre-flight verified:
#   - email_label_id 371e35b2 currently has icontroller_tag_status='pending'
#   - email is 5 days old (2026-04-29) — should still be in iController list
#   - customer 506909 (Vos Logistics) is a real iController customer

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${1:-/tmp/phase-66-vercel-prod.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  echo "Run: vercel env pull --environment=production $ENV_FILE" >&2
  exit 1
fi

EVENT_KEY=$(grep -E '^INNGEST_EVENT_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/\\n$//' | sed 's/[[:space:]]*$//')

if [ -z "$EVENT_KEY" ]; then
  echo "ERROR: INNGEST_EVENT_KEY not found / empty in $ENV_FILE" >&2
  echo "Note: Vercel may redact sensitive values; pull the value from the Inngest dashboard manually if needed." >&2
  exit 1
fi

PAYLOAD=$(cat <<'JSON'
{
  "name": "debtor-email/icontroller-tag.requested",
  "data": {
    "email_label_id": "371e35b2-b2bb-4e41-b178-e0fcdaff6c65",
    "email_id": "0124b57b-da76-4c4a-b0d8-85acbbb68190",
    "customer_account_id": "506909",
    "customer_name": "Vos Logistics Technical Department B.V.",
    "source_mailbox": "debiteuren@smeba.nl",
    "icontroller_company": "smeba",
    "icontroller_mailbox_id": 4,
    "icontroller_message_url": "https://walkerfire.icontroller.eu/messages/index/mailbox/4",
    "entity": "smeba",
    "automation_run_id": "00000000-0000-0000-0000-000000000067",
    "sender_email": "jvanschaijk@voslogistics.com",
    "subject": "Vraag over factuur",
    "received_at": "2026-04-29T14:56:14Z"
  }
}
JSON
)

echo "BEFORE: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "PAYLOAD email_label_id: 371e35b2-b2bb-4e41-b178-e0fcdaff6c65"
echo "PAYLOAD customer:        506909 (Vos Logistics)"
echo "PAYLOAD mailbox:         debiteuren@smeba.nl"
echo

RESPONSE=$(curl -sS -X POST "https://inn.gs/e/${EVENT_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "RESPONSE: $RESPONSE"
echo "AFTER:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Verify in Supabase after ~30s:"
echo "  select icontroller_tag_status, icontroller_msg_id, error,"
echo "         screenshot_before_url, screenshot_after_url, labeled_at"
echo "  from debtor.email_labels where id='371e35b2-b2bb-4e41-b178-e0fcdaff6c65';"
