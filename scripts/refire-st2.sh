#!/usr/bin/env bash
# Re-fire the 153 stage-2-stuck debtor mails (PRODUCTION; Nick authorized "REFIRE").
# Input: audit/st2_stuck_refire_ready.tsv  (email_id, conv, mailbox, st2, date, subj, messageId)
# POSTs {messageId, source_mailbox} to the ingest route. Logs each fired run.
set -u
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
WTENV=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/agent-workforce/web/.env.local
ENDPOINT="https://agent-workforce-eosin.vercel.app/api/automations/debtor-email/ingest"
SECRET=$(grep '^ZAPIER_INGEST_SECRET=' "$WTENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
LOG="$OUT/refire_st2_log.tsv"; : > "$LOG"
SRC="$OUT/st2_stuck_refire_ready.tsv"

total=$(wc -l < "$SRC" | tr -d ' ')
echo "te re-firen: $total"
ok=0; skip=0; fail=0; i=0
while IFS=$'\t' read -r eid conv mbx st2 d subj msgid; do
  i=$((i+1))
  [ -z "$msgid" ] && { skip=$((skip+1)); continue; }
  body=$(jq -nc --arg m "$msgid" --arg sm "$mbx" '{messageId:$m, source_mailbox:$sm}')
  resp=$(curl -s -X POST "$ENDPOINT" -H "x-zapier-secret: $SECRET" -H "Content-Type: application/json" -d "$body")
  action=$(jq -r '.action // "?"' <<<"$resp")
  rid=$(jq -r '.automation_run_id // "-"' <<<"$resp")
  neweid=$(jq -r '.email_id // "-"' <<<"$resp")
  if [ "$action" = "stage_0_dispatched" ]; then
    printf "%s\t%s\t%s\t%s\n" "$mbx" "$neweid" "$rid" "$subj" >> "$LOG"; ok=$((ok+1))
  else
    echo "  [$action] $mbx | $subj | $(jq -rc '.error // .reason // empty' <<<"$resp")"; fail=$((fail+1))
  fi
  [ $((i % 25)) -eq 0 ] && echo "  ...$i/$total (ok=$ok fail=$fail)"
  sleep 0.4
done < "$SRC"

echo ""
echo "=== KLAAR: gevuurd=$ok  overgeslagen=$skip  fail=$fail  (van $total) ==="
echo "log: $LOG"