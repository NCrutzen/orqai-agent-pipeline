#!/usr/bin/env bash
# Task 1 — Debtor inbox label coverage audit (READ-ONLY).
# For each mailbox: page recent unlabeled inbox mail from Graph, then classify
# per conversation by the highest pipeline stage reached in the DB.
#   stage3 present            -> (c) classified-but-label-write-failed
#   stage1 reached, no stage3 -> (b) legit noise (stopped at Stage 1)
#   no events / stage0 only   -> (a) genuine miss / never processed
set -u
source ~/.secrets.env 2>/dev/null
REF=mvqjhlxfvtqqubqgdvhz
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
CUTOFF="2026-05-23T00:00:00Z"
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
mkdir -p "$OUT"
MAILBOXES=(debiteuren@smeba.nl administratie@fire-control.nl debiteuren@berki.nl debiteuren@smeba-fire.be)

G() { npx -y @zapier/zapier-sdk-cli@latest curl "$1" --connection "$CONN" -H "ConsistencyLevel: eventual" -s 2>/dev/null; }
runsql() { jq -Rs '{query: .}' <<<"$1" | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @-; }

ALLCONV="$OUT/all_conversations.txt"; : > "$ALLCONV"

for MBX in "${MAILBOXES[@]}"; do
  echo ">> $MBX : pagen van ongelabelde recente inbox-mail..."
  FILE="$OUT/msgs_${MBX}.jsonl"; : > "$FILE"
  URL="https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox/messages?\$top=100&\$select=conversationId,internetMessageId,subject,receivedDateTime&\$filter=not%20categories/any()%20and%20receivedDateTime%20ge%20$CUTOFF"
  page=0
  while [ -n "$URL" ] && [ "$page" -lt 15 ]; do
    resp=$(G "$URL")
    cnt=$(jq '.value|length' <<<"$resp" 2>/dev/null)
    [ -z "$cnt" ] && { echo "   pagina-fout, stop"; break; }
    jq -c '.value[]? | {conv:.conversationId, imid:.internetMessageId, subj:(.subject//"")[0:60], recv:.receivedDateTime}' <<<"$resp" >> "$FILE"
    URL=$(jq -r '."@odata.nextLink" // empty' <<<"$resp")
    page=$((page+1))
  done
  n=$(wc -l < "$FILE" | tr -d ' ')
  echo "   $MBX : $n ongelabelde mails verzameld ($page pagina's)"
  jq -r '.conv' "$FILE" >> "$ALLCONV"
done

# Bulk DB-classificatie per conversation_id
echo ">> DB-classificatie per conversation..."
CONVS=$(sort -u "$ALLCONV" | grep -v '^$')
NCONV=$(wc -l <<<"$CONVS" | tr -d ' ')
echo "   unieke conversations: $NCONV"
# bouw ARRAY[...] veilig (base64url bevat geen single quotes)
ARR=$(awk 'NF{printf "%s'\''%s'\''", (NR>1?",":""), $0}' <<<"$CONVS")
cat > "$OUT/classify.sql" <<SQL
with c as (select unnest(ARRAY[$ARR]) as conversation_id)
select c.conversation_id,
  bool_or(pe.stage=3) as has3,
  bool_or(pe.stage=1) as has1,
  bool_or(pe.stage=0) as has0,
  count(pe.*) as events
from c
left join email_pipeline.emails e on e.conversation_id=c.conversation_id
left join pipeline_events pe on pe.email_id=e.id
group by c.conversation_id;
SQL
runsql "$(cat "$OUT/classify.sql")" > "$OUT/classify.json"
# map conv -> bucket
jq -r '.[]? | [.conversation_id, (if .has3 then "c" elif .has1 then "b" elif (.events>0) then "a0" else "a" end)] | @tsv' "$OUT/classify.json" > "$OUT/conv_bucket.tsv" 2>/dev/null

echo ""
echo "=================== SAMENVATTING ==================="
printf "%-32s %6s %6s %6s %6s %6s\n" "mailbox" "totaal" "a_miss" "b_noise" "c_relab" "onbek"
for MBX in "${MAILBOXES[@]}"; do
  FILE="$OUT/msgs_${MBX}.jsonl"
  [ -s "$FILE" ] || { printf "%-32s %6s\n" "$MBX" "0"; continue; }
  tot=0; a=0; b=0; cc=0; unk=0
  while IFS= read -r conv; do
    tot=$((tot+1))
    bucket=$(awk -F'\t' -v k="$conv" '$1==k{print $2; exit}' "$OUT/conv_bucket.tsv")
    case "$bucket" in
      c) cc=$((cc+1));; b) b=$((b+1));; a|a0) a=$((a+1));; *) unk=$((unk+1));;
    esac
  done < <(jq -r '.conv' "$FILE")
  printf "%-32s %6s %6s %6s %6s %6s\n" "$MBX" "$tot" "$a" "$b" "$cc" "$unk"
done
echo "===================================================="
echo "Detail-bestanden in $OUT/"
