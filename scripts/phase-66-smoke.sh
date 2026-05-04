#!/usr/bin/env bash
# Phase 66 smoke — fire one synthetic debtor-email/coordinator.requested
# event for the Path 4 (unknown → coordinator) regression path.
#
# Usage:  bash scripts/phase-66-smoke.sh
#
# Reads INNGEST_EVENT_KEY from the Vercel production env file. Returns the
# Inngest event id on success. Disposable script — safe to delete after
# Phase 66 closes.
#
# Setup (run once, in your shell):
#   vercel env pull --environment=production /tmp/phase-66-vercel-prod.env

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${1:-/tmp/phase-66-vercel-prod.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  echo "Run: vercel env pull --environment=production $ENV_FILE" >&2
  exit 1
fi

# Load INNGEST_EVENT_KEY from the Vercel-pulled env file
EVENT_KEY=$(grep -E '^INNGEST_EVENT_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/\\n$//' | sed 's/[[:space:]]*$//')

if [ -z "$EVENT_KEY" ]; then
  echo "ERROR: INNGEST_EVENT_KEY not found in $ENV_FILE" >&2
  exit 1
fi

PAYLOAD=$(cat <<'JSON'
{
  "name": "debtor-email/coordinator.requested",
  "data": {
    "email_id": "b7222a80-efca-4c7f-8521-dda930ba2b54",
    "entity": "smeba",
    "subject": "Retour van factuur 17340872",
    "body_text": "CAUTION: External Sender\n\nGeachte heer, mevrouw,\n\nAangezien er een referentie op de factuur wordt vermeld, beginnend met JMB-xxx dient u de factuur te sturen naar rsc-jumbofacturen@rap.partners. Zij beoordelen de factuur en sturen deze na akkoord naar ons door.\n\nMet vriendelijke groet,\nKostencrediteuren Jumbo",
    "sender_email": "kostencrediteuren@jumbo.com",
    "mailbox": "debiteuren@smeba.nl",
    "received_at": "2026-05-01T09:16:48Z"
  }
}
JSON
)

echo "BEFORE: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

RESPONSE=$(curl -sS -X POST "https://inn.gs/e/${EVENT_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "RESPONSE: $RESPONSE"
echo "AFTER:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
