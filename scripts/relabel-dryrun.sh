#!/usr/bin/env bash
# Task 2 dry-run (READ-ONLY). Builds the relabel target list for bucket (c):
# unlabeled inbox mail whose conversation has a Stage-3 intent in the DB.
# Writes the intent we WOULD apply; flags conversations with >1 distinct intent
# as AMBIGUOUS (excluded from auto-relabel). No writes.
set -u
source ~/.secrets.env 2>/dev/null
REF=mvqjhlxfvtqqubqgdvhz
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
runsql() { jq -Rs '{query: .}' <<<"$1" | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @-; }
MAILBOXES=(debiteuren@smeba.nl administratie@fire-control.nl debiteuren@berki.nl debiteuren@smeba-fire.be)

# bucket-c conversations from the audit
awk -F'\t' '$2=="c"{print $1}' "$OUT/conv_bucket.tsv" | sort -u > "$OUT/c_convs.txt"
NC=$(wc -l < "$OUT/c_convs.txt" | tr -d ' ')
echo "bucket-c conversations: $NC"

# DB: distinct stage-3 intents per conversation
CONVS=$(cat "$OUT/c_convs.txt")
ARR=$(awk 'NF{printf "%s'\''%s'\''", (NR>1?",":""), $0}' <<<"$CONVS")
runsql "
with c as (select unnest(ARRAY[$ARR]) as conversation_id)
select c.conversation_id,
  array_agg(distinct pe.decision) as intents
from c
join email_pipeline.emails e on e.conversation_id=c.conversation_id
join pipeline_events pe on pe.email_id=e.id and pe.stage=3
group by c.conversation_id;" > "$OUT/c_intents.json"

# conv -> intent  (single) or AMBIGUOUS
jq -r '.[]? | [.conversation_id, (if (.intents|length)==1 then .intents[0] else "AMBIGUOUS" end)] | @tsv' "$OUT/c_intents.json" > "$OUT/c_conv_intent.tsv"

# Join audit messages (bucket c) to mailbox + intent → full target list
: > "$OUT/relabel_targets.tsv"
for MBX in "${MAILBOXES[@]}"; do
  FILE="$OUT/msgs_${MBX}.jsonl"; [ -s "$FILE" ] || continue
  while IFS= read -r line; do
    conv=$(jq -r '.conv' <<<"$line"); subj=$(jq -r '.subj' <<<"$line")
    intent=$(awk -F'\t' -v k="$conv" '$1==k{print $2; exit}' "$OUT/c_conv_intent.tsv")
    [ -z "$intent" ] && continue   # not a bucket-c conv
    printf "%s\t%s\t%s\t%s\n" "$MBX" "$intent" "$conv" "$subj" >> "$OUT/relabel_targets.tsv"
  done < "$FILE"
done

echo ""
echo "=============== DRY-RUN: relabel targets ==============="
total=$(wc -l < "$OUT/relabel_targets.tsv" | tr -d ' ')
amb=$(awk -F'\t' '$2=="AMBIGUOUS"' "$OUT/relabel_targets.tsv" | wc -l | tr -d ' ')
echo "totaal te relabelen mails: $total   (waarvan AMBIGUOUS/handmatig: $amb)"
echo ""
echo "--- per mailbox ---"
awk -F'\t' '$2!="AMBIGUOUS"{c[$1]++} END{for(m in c) printf "  %-32s %s\n", m, c[m]}' "$OUT/relabel_targets.tsv"
echo ""
echo "--- per intent (auto-relabelbaar) ---"
awk -F'\t' '$2!="AMBIGUOUS"{c[$2]++} END{for(i in c) printf "  %-24s %s\n", i, c[i]}' "$OUT/relabel_targets.tsv" | sort -k2 -rn
echo ""
echo "--- steekproef (10) ---"
awk -F'\t' '$2!="AMBIGUOUS"' "$OUT/relabel_targets.tsv" | head -10 | awk -F'\t' '{printf "  [%s] %-18s %s\n", $1, $2, $4}'
echo "======================================================="
echo "Volledige lijst: $OUT/relabel_targets.tsv"