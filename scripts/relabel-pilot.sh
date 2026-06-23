#!/usr/bin/env bash
# Task 2 PILOT (PRODUCTION WRITE — 20 mails). Adds the Outlook category
# "AI: <intent>" to unlabeled inbox messages. Idempotent. Logs every patched
# message id to pilot_applied.tsv for rollback. Verifies after each write.
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
G() { npx -y @zapier/zapier-sdk-cli@latest curl "$@" -s 2>/dev/null; }
APPLIED="$OUT/pilot_applied.tsv"; : > "$APPLIED"

# Select 20 non-ambiguous targets with intent diversity (<=3 per intent)
awk -F'\t' '$2!="AMBIGUOUS"' "$OUT/relabel_targets.tsv" \
  | awk -F'\t' '{ if (++c[$2]<=3 && n<20){print; n++} }' > "$OUT/pilot_targets.tsv"
echo "pilot-doelen: $(wc -l < "$OUT/pilot_targets.tsv" | tr -d ' ')"
echo ""

ok=0; skip=0; fail=0
while IFS=$'\t' read -r mbx intent conv subj; do
  FILTER=$(printf "conversationId eq '%s'" "$conv" | jq -sRr @uri)
  msgs=$(G "https://graph.microsoft.com/v1.0/users/$mbx/mailFolders/inbox/messages?\$filter=$FILTER&\$select=id,categories" --connection "$CONN")
  ids=$(jq -r '.value[]? | select([.categories[]?|select(startswith("AI:"))]|length==0) | .id' <<<"$msgs")
  if [ -z "$ids" ]; then echo "  [skip] al gelabeld/geen inbox-msg | $subj"; skip=$((skip+1)); continue; fi
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    cur=$(jq -c --arg i "AI: $intent" '([.value[]|select(.id==$ID).categories[]?] + [$i])|unique' --arg ID "$id" <<<"$msgs" 2>/dev/null)
    # build body: existing cats of THIS msg + AI:intent
    cur=$(jq -c --arg id "$id" --arg lab "AI: $intent" '([.value[]|select(.id==$id)|.categories[]?] + [$lab])|unique' <<<"$msgs")
    body=$(jq -nc --argjson c "$cur" '{categories:$c}')
    patch=$(G "https://graph.microsoft.com/v1.0/users/$mbx/messages/$id" --connection "$CONN" -X PATCH --json "$body")
    # verify
    newcats=$(jq -rc '.categories // []' <<<"$patch")
    has=$(jq -r --arg lab "AI: $intent" '[.categories[]?|select(.==$lab)]|length' <<<"$patch" 2>/dev/null)
    if [ "${has:-0}" -gt 0 ]; then
      printf "%s\t%s\t%s\t%s\n" "$mbx" "$id" "$intent" "$conv" >> "$APPLIED"
      echo "  [OK]   AI: $intent  ->  $subj"
      ok=$((ok+1))
    else
      echo "  [FAIL] $subj  resp=$(jq -rc '.error.message // .categories' <<<"$patch" | head -c 80)"
      fail=$((fail+1))
    fi
  done <<< "$ids"
done < "$OUT/pilot_targets.tsv"

echo ""
echo "=== PILOT KLAAR: ok=$ok  skip=$skip  fail=$fail ==="
echo "Undo-log: $APPLIED"
