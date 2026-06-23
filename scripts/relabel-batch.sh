#!/usr/bin/env bash
# Task 2 FULL relabel via Graph $batch (PRODUCTION WRITE, fast).
# Phase 1: gather unlabeled bucket-c inbox messages (id, mbx, intent).
# Phase 2: PATCH 20 per $batch call. Idempotent (re-scan = only unlabeled).
# Logs applied ids to relabel_applied.tsv for rollback.
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
CUTOFF="2026-05-23T00:00:00Z"
MAILBOXES=(debiteuren@smeba.nl administratie@fire-control.nl debiteuren@berki.nl)
APPLIED="$OUT/relabel_applied.tsv"; [ -f "$APPLIED" ] || : > "$APPLIED"
TARGETS="$OUT/batch_targets.tsv"; : > "$TARGETS"
WORK="$OUT/_batchwork"; mkdir -p "$WORK"; rm -f "$WORK"/chunk_* 2>/dev/null

G() { local o t=0; while [ $t -lt 4 ]; do o=$(npx -y @zapier/zapier-sdk-cli@latest curl "$@" -s 2>/dev/null); [ -n "$o" ] && { echo "$o"; return 0; }; t=$((t+1)); sleep 1.5; done; echo ""; return 1; }
lookup_intent() { awk -F'\t' -v k="$1" '$1==k{print $2; exit}' "$OUT/c_conv_intent.tsv"; }

echo "=== Fase 1: doelen verzamelen ==="
for MBX in "${MAILBOXES[@]}"; do
  URL="https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox/messages?\$top=100&\$select=id,conversationId&\$filter=not%20categories/any()%20and%20receivedDateTime%20ge%20$CUTOFF"
  page=0; before=$(wc -l < "$TARGETS" | tr -d ' ')
  while [ -n "$URL" ] && [ "$page" -lt 15 ]; do
    resp=$(G "$URL" --connection "$CONN" -H "ConsistencyLevel: eventual")
    [ -z "$(jq '.value|length' <<<"$resp" 2>/dev/null)" ] && break
    while IFS=$'\t' read -r id conv; do
      [ -z "$id" ] && continue
      intent=$(lookup_intent "$conv")
      [ -z "$intent" ] && continue
      [ "$intent" = "AMBIGUOUS" ] && continue
      printf "%s\t%s\t%s\n" "$MBX" "$id" "$intent" >> "$TARGETS"
    done < <(jq -r '.value[]? | [.id, .conversationId] | @tsv' <<<"$resp")
    URL=$(jq -r '."@odata.nextLink" // empty' <<<"$resp"); page=$((page+1))
  done
  echo "  $MBX : $(($(wc -l < "$TARGETS" | tr -d ' ')-before)) doelen"
done
NT=$(wc -l < "$TARGETS" | tr -d ' ')
echo "  totaal doelen: $NT"

echo ""
echo "=== Fase 2: batch-PATCH (20/call) ==="
split -l 20 "$TARGETS" "$WORK/chunk_"
ok=0; fail=0; cnum=0
for CH in "$WORK"/chunk_*; do
  cnum=$((cnum+1))
  # build batch requests
  : > "$WORK/reqs.jsonl"; j=0
  while IFS=$'\t' read -r mbx id intent; do
    jq -nc --arg id "$j" --arg url "/users/$mbx/messages/$id" --arg lab "AI: $intent" \
      '{id:$id, method:"PATCH", url:$url, headers:{"Content-Type":"application/json"}, body:{categories:[$lab]}}' >> "$WORK/reqs.jsonl"
    j=$((j+1))
  done < "$CH"
  body=$(jq -sc '{requests:.}' "$WORK/reqs.jsonl")
  resp=$(G "https://graph.microsoft.com/v1.0/\$batch" --connection "$CONN" -X POST --json "$body")
  # parse statuses
  while IFS=$'\t' read -r rid status; do
    line=$(sed -n "$((rid+1))p" "$CH")
    mbx=$(cut -f1 <<<"$line"); id=$(cut -f2 <<<"$line"); intent=$(cut -f3 <<<"$line")
    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ] 2>/dev/null; then
      printf "%s\t%s\t%s\t%s\n" "$mbx" "$id" "$intent" "batch" >> "$APPLIED"; ok=$((ok+1))
    else
      echo "  [FAIL $status] $mbx ${id:0:20}"; fail=$((fail+1))
    fi
  done < <(jq -r '.responses[]? | [.id, .status] | @tsv' <<<"$resp" 2>/dev/null)
  echo "  batch $cnum/$(ls "$WORK"/chunk_* | wc -l | tr -d ' ') : lopend ok=$ok fail=$fail"
done

rm -f "$WORK"/chunk_* "$WORK/reqs.jsonl"
echo ""
echo "=== KLAAR: ok=$ok fail=$fail ==="
echo "  totaal in undo-log: $(wc -l < "$APPLIED" | tr -d ' ')"