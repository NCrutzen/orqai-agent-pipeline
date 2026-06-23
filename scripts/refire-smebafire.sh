#!/usr/bin/env bash
# Item 1 — re-fire smeba-fire dead-window backlog (2026-06-09→06-22 outage, never ingested).
# PRODUCTION, shadow-mode safe (debiteuren@smeba-fire.be triage_shadow_mode=true → iController write SHADOWED).
# Uses the message id DIRECTLY from the Graph fetch (no conversationId re-resolve → no dup labels).
# Usage: refire-smebafire.sh <targets.tsv>   (tsv: msgid \t conv \t received \t sender \t subject)
set -u
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
WTENV=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/agent-workforce/web/.env.local
ENDPOINT="https://agent-workforce-eosin.vercel.app/api/automations/debtor-email/ingest"
MBX="debiteuren@smeba-fire.be"
SECRET=$(grep '^ZAPIER_INGEST_SECRET=' "$WTENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
TARGETS="${1:?usage: refire-smebafire.sh <targets.tsv>}"
LOG="$OUT/refire_smebafire_log.tsv"

fired=0; skip=0
while IFS=$'\t' read -r msgid conv received sender subj; do
  [ -z "$msgid" ] && continue
  body=$(jq -nc --arg m "$msgid" --arg sm "$MBX" '{messageId:$m, source_mailbox:$sm}')
  resp=$(curl -s -X POST "$ENDPOINT" -H "x-zapier-secret: $SECRET" -H "Content-Type: application/json" -d "$body")
  action=$(jq -r '.action // "?"' <<<"$resp")
  rid=$(jq -r '.automation_run_id // "-"' <<<"$resp")
  eid=$(jq -r '.email_id // "-"' <<<"$resp")
  if [ "$action" = "stage_0_dispatched" ]; then
    printf "%s\t%s\t%s\t%s\t%s\n" "$MBX" "$eid" "$rid" "$sender" "$subj" >> "$LOG"; fired=$((fired+1))
    echo "  [OK] $sender | ${subj:0:55}"
  else
    echo "  [$action] $sender | ${subj:0:45}  ($(jq -rc '.error // .reason // empty' <<<"$resp"))"; skip=$((skip+1))
  fi
  sleep 0.6
done < "$TARGETS"
echo ""
echo "=== GEVUURD: $fired   overgeslagen: $skip ==="
echo "log: $LOG"
