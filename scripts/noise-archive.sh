#!/usr/bin/env bash
# ② Retroactive noise cleanup (inbox-first). Scans the CURRENT inbox, matches each
# message's conversationId to a DB noise classification, then labels + moves to the
# mailbox archive folder. Retry-wrapped. Logs to noise_archive_applied.tsv (rollback).
# Usage: noise-archive.sh <mailbox> <archive_folder_id> [limit]
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
REF=mvqjhlxfvtqqubqgdvhz
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
MBX="$1"; ARCHIVE="$2"; LIMIT="${3:-9999}"
LOG="$OUT/noise_archive_applied.tsv"; [ -f "$LOG" ] || : > "$LOG"
runsql() { jq -Rs '{query: .}' <<<"$1" | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @-; }
G() { local o t=0; while [ $t -lt 4 ]; do o=$(zapier-sdk curl "$@" --connection "$CONN" -s 2>/dev/null); [ -n "$o" ] && { echo "$o"; return 0; }; t=$((t+1)); sleep 1; done; echo ""; return 1; }

# 1) DB noise-conv -> outlook_label map (whole debtor swarm, categorize_archive cats)
runsql "select e.conversation_id || '	' || nc.outlook_label as r
from email_pipeline.emails e
join pipeline_events pe on pe.email_id=e.id and pe.stage=1
join swarm_noise_categories nc on nc.swarm_type='debtor-email' and nc.category_key=pe.decision and nc.action='categorize_archive' and nc.outlook_label is not null
where e.mailbox='$MBX' and e.received_at>=now()-interval '90 days'
  and not exists(select 1 from pipeline_events p3 where p3.email_id=e.id and p3.stage=3)" | jq -r '.[]?.r' > "$OUT/_noisemap_$MBX.tsv"
echo "noise-convs in DB-map ($MBX): $(wc -l < "$OUT/_noisemap_$MBX.tsv" | tr -d ' ')"
lbl() { awk -F'\t' -v k="$1" '$1==k{print $2; exit}' "$OUT/_noisemap_$MBX.tsv"; }

# 2) page the inbox; for each msg, if its conv is in the noise-map -> label + move
INBOX=$(G "https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox?\$select=id" | jq -r '.id')
URL="https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox/messages?\$top=50&\$select=id,conversationId,categories"
ok=0; skip=0; fail=0; seen=0; page=0
while [ -n "$URL" ] && [ "$page" -lt 30 ] && [ "$ok" -lt "$LIMIT" ]; do
  resp=$(G "$URL"); [ -z "$(jq '.value|length' <<<"$resp" 2>/dev/null)" ] && break
  while IFS=$'\t' read -r id conv cats; do
    [ -z "$id" ] && continue; seen=$((seen+1))
    label=$(lbl "$conv"); [ -z "$label" ] && { skip=$((skip+1)); continue; }   # not noise
    echo "$cats" | grep -q "$label" || {
      cur=$(jq -nc --arg l "$label" --argjson c "${cats:-[]}" '($c + [$l])|unique')
      G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$id" -X PATCH --json "$(jq -nc --argjson c "$cur" '{categories:$c}')" >/dev/null
    }
    newid=$(G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$id/move" -X POST --json "$(jq -nc --arg d "$ARCHIVE" '{destinationId:$d}')" | jq -r '.id // empty')
    if [ -n "$newid" ]; then printf "%s\t%s\t%s\n" "$MBX" "$newid" "$label" >> "$LOG"; ok=$((ok+1)); else fail=$((fail+1)); fi
    [ "$ok" -ge "$LIMIT" ] && break
    sleep 0.15
  done < <(jq -r '.value[]? | [.id, .conversationId, (.categories|tostring)] | @tsv' <<<"$resp")
  URL=$(jq -r '."@odata.nextLink" // empty' <<<"$resp"); page=$((page+1))
  echo "  ...pagina $page  gearchiveerd=$ok (gezien=$seen, niet-noise=$skip, fail=$fail)"
done
echo ""
echo "=== $MBX KLAAR: gearchiveerd=$ok  niet-noise=$skip  fail=$fail  (inbox-msgs gezien=$seen) ==="