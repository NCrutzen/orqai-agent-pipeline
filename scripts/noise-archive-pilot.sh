#!/usr/bin/env bash
# ② Retroactive noise cleanup PILOT (smeba, 10 mails). Label + move to "Archiveren".
# Per mail: resolve msgid -> PATCH noise outlook_label -> move to archive folder -> verify.
# Logs to noise_archive_applied.tsv for rollback (move back to inbox).
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
REF=mvqjhlxfvtqqubqgdvhz
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
MBX="debiteuren@smeba.nl"
ARCHIVE="AAMkAGUwMGQ4ZjE2LTY2YTctNDFlYi05NTlkLTU5YTg3ZWUxMGQzZgAuAAAAAACZmTT9LPgzR5SDOnovPifIAQB9W7oKiVFDQK57ZmbPH5LMAAAAAAETAAA="
INBOX=$(zapier-sdk curl "https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox?\$select=id" --connection "$CONN" -s 2>/dev/null | jq -r '.id')
runsql() { jq -Rs '{query: .}' <<<"$1" | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @-; }
G() { zapier-sdk curl "$@" --connection "$CONN" -s 2>/dev/null; }
LOG="$OUT/noise_archive_applied.tsv"; : > "$LOG"

# 10 noise mails in smeba inbox-path (st1 noise, no st3), with their outlook_label
runsql "select e.conversation_id || '|' || nc.outlook_label || '|' || left(e.subject,40) as r
from email_pipeline.emails e
join pipeline_events pe on pe.email_id=e.id and pe.stage=1
join swarm_noise_categories nc on nc.swarm_type='debtor-email' and nc.category_key=pe.decision and nc.action='categorize_archive'
where e.mailbox='$MBX' and e.direction in ('incoming','inbound') and e.received_at>=now()-interval '60 days'
  and not exists(select 1 from pipeline_events p3 where p3.email_id=e.id and p3.stage=3)
order by e.received_at desc limit 10;" | jq -r '.[]?.r' > "$OUT/_noise_pilot.txt"
echo "pilot-doelen: $(wc -l < "$OUT/_noise_pilot.txt" | tr -d ' ')"

ok=0; fail=0
while IFS='|' read -r conv label subj; do
  [ -z "$conv" ] && continue
  FILTER=$(printf "conversationId eq '%s'" "$conv" | jq -sRr @uri)
  # alleen het inbox-bericht van deze thread
  msg=$(G "https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox/messages?\$filter=$FILTER&\$select=id,categories&\$top=1")
  id=$(jq -r '.value[0].id // empty' <<<"$msg")
  [ -z "$id" ] && { echo "  [geen inbox-msg] $subj"; continue; }
  cur=$(jq -c --arg l "$label" '([.value[0].categories[]?] + [$l])|unique' <<<"$msg")
  # 1) label
  G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$id" -X PATCH --json "$(jq -nc --argjson c "$cur" '{categories:$c}')" >/dev/null
  # 2) move -> Archiveren (geeft nieuw id terug)
  newid=$(G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$id/move" -X POST --json "$(jq -nc --arg d "$ARCHIVE" '{destinationId:$d}')" | jq -r '.id // empty')
  if [ -n "$newid" ]; then
    # 3) verify: nieuwe parentFolderId == Archiveren?
    pf=$(G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$newid?\$select=parentFolderId,categories" | jq -r '.parentFolderId')
    if [ "$pf" = "$ARCHIVE" ]; then
      printf "%s\t%s\t%s\t%s\n" "$MBX" "$newid" "$label" "$subj" >> "$LOG"; ok=$((ok+1))
      echo "  ✅ [$label] $subj"
    else echo "  ⚠️ verplaatst maar niet in archief? $subj"; fail=$((fail+1)); fi
  else echo "  ❌ move faalde: $subj"; fail=$((fail+1)); fi
  sleep 0.3
done < "$OUT/_noise_pilot.txt"
echo ""
echo "=== PILOT KLAAR: gearchiveerd=$ok fail=$fail ==="
echo "rollback-log (move terug naar inbox $INBOX): $LOG"