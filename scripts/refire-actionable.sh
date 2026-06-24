#!/usr/bin/env bash
# Task 3 — re-fire remaining actionable bucket-(a) mails (PRODUCTION, shadow-mode safe).
# Resolves Graph messageId per unique conversation, POSTs to the ingest route.
# Uses global `zapier-sdk` (fast). Logs fired runs to refire_log.tsv.
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
WTENV=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/agent-workforce/web/.env.local
ENDPOINT="https://agent-workforce-eosin.vercel.app/api/automations/debtor-email/ingest"
SECRET=$(grep '^ZAPIER_INGEST_SECRET=' "$WTENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
ALREADY="AAMkAGUwMGQ4ZjE2LTY2YTctNDFlYi05NTlkLTU5YTg3ZWUxMGQzZgBGAAAAAACZmTT9LPgzR5SDOnovPifIBwB9W7oKiVFDQK57ZmbPH5LMAAAAAAEMAAB9W7oKiVFDQK57ZmbPH5LMAAKbNvZcAAA="  # pilot, skip
LOG="$OUT/refire_log.tsv"; : > "$LOG"
G() { zapier-sdk curl "$@" --connection "$CONN" -s 2>/dev/null; }

# unieke conversaties (mbx \t conv \t subj), dedupe op conv
awk -F'\t' '!seen[$2]++' "$OUT/a_actionable.tsv" > "$OUT/_uniq_actionable.tsv"
echo "unieke actionable conversaties: $(wc -l < "$OUT/_uniq_actionable.tsv" | tr -d ' ')"
echo ""

fired=0; skip=0
while IFS=$'\t' read -r mbx conv subj; do
  FILTER=$(printf "conversationId eq '%s'" "$conv" | jq -sRr @uri)
  msgid=$(G "https://graph.microsoft.com/v1.0/users/$mbx/mailFolders/inbox/messages?\$filter=$FILTER&\$select=id&\$top=1" | jq -r '.value[0].id // empty')
  if [ -z "$msgid" ]; then echo "  [geen msg] $subj"; skip=$((skip+1)); continue; fi
  if [ "$msgid" = "$ALREADY" ]; then echo "  [skip pilot] $subj"; skip=$((skip+1)); continue; fi
  body=$(jq -nc --arg m "$msgid" --arg sm "$mbx" '{messageId:$m, source_mailbox:$sm}')
  resp=$(curl -s -X POST "$ENDPOINT" -H "x-zapier-secret: $SECRET" -H "Content-Type: application/json" -d "$body")
  action=$(jq -r '.action // "?"' <<<"$resp")
  rid=$(jq -r '.automation_run_id // "-"' <<<"$resp")
  eid=$(jq -r '.email_id // "-"' <<<"$resp")
  if [ "$action" = "stage_0_dispatched" ]; then
    printf "%s\t%s\t%s\t%s\n" "$mbx" "$eid" "$rid" "$subj" >> "$LOG"; fired=$((fired+1))
    echo "  [OK $action] $subj"
  else
    echo "  [$action] $subj  ($(jq -rc '.error // .reason // empty' <<<"$resp"))"; skip=$((skip+1))
  fi
  sleep 0.5
done < "$OUT/_uniq_actionable.tsv"

echo ""
echo "=== GEVUURD: $fired   overgeslagen: $skip ==="
echo "log: $LOG"