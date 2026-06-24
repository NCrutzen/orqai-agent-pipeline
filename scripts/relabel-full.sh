#!/usr/bin/env bash
# Task 2 FULL relabel (PRODUCTION WRITE). Per-message, retry + pacing.
# Re-scans each inbox for unlabeled mail, applies "AI: <intent>" from the DB
# stage-3 decision (single-intent bucket-c only; AMBIGUOUS + non-c skipped).
# Idempotent; logs every patched id to relabel_applied.tsv for rollback.
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
OUT=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit
CUTOFF="2026-05-23T00:00:00Z"
MAILBOXES=(debiteuren@smeba.nl administratie@fire-control.nl debiteuren@berki.nl)
APPLIED="$OUT/relabel_applied.tsv"; [ -f "$APPLIED" ] || : > "$APPLIED"

# intent lookup: conversation_id -> intent (or AMBIGUOUS), from dry-run file
lookup_intent() { awk -F'\t' -v k="$1" '$1==k{print $2; exit}' "$OUT/c_conv_intent.tsv"; }

# Graph call with retry on empty/transient
G() {
  local out tries=0
  while [ $tries -lt 4 ]; do
    out=$(npx -y @zapier/zapier-sdk-cli@latest curl "$@" -s 2>/dev/null)
    [ -n "$out" ] && { echo "$out"; return 0; }
    tries=$((tries+1)); sleep 1.5
  done
  echo ""; return 1
}

ok=0; skip_amb=0; skip_other=0; already=0; fail=0
for MBX in "${MAILBOXES[@]}"; do
  echo ">> $MBX"
  URL="https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/inbox/messages?\$top=100&\$select=id,conversationId,categories,subject&\$filter=not%20categories/any()%20and%20receivedDateTime%20ge%20$CUTOFF"
  page=0
  while [ -n "$URL" ] && [ "$page" -lt 15 ]; do
    resp=$(G "$URL" --connection "$CONN" -H "ConsistencyLevel: eventual")
    cnt=$(jq '.value|length' <<<"$resp" 2>/dev/null)
    [ -z "$cnt" ] && { echo "   pagina-fout, stop mailbox"; break; }
    while IFS=$'\t' read -r id conv subj; do
      [ -z "$id" ] && continue
      intent=$(lookup_intent "$conv")
      if [ -z "$intent" ]; then skip_other=$((skip_other+1)); continue; fi   # bucket a/b
      if [ "$intent" = "AMBIGUOUS" ]; then skip_amb=$((skip_amb+1)); continue; fi
      # idempotent: skip if already has the AI label (race vs re-scan)
      body=$(jq -nc --arg lab "AI: $intent" '{categories:[$lab]}')
      patch=$(G "https://graph.microsoft.com/v1.0/users/$MBX/messages/$id" --connection "$CONN" -X PATCH --json "$body")
      has=$(jq -r --arg lab "AI: $intent" '[.categories[]?|select(.==$lab)]|length' <<<"$patch" 2>/dev/null)
      if [ "${has:-0}" -gt 0 ]; then
        printf "%s\t%s\t%s\t%s\n" "$MBX" "$id" "$intent" "$conv" >> "$APPLIED"
        ok=$((ok+1))
      else
        echo "   [FAIL] $subj"; fail=$((fail+1))
      fi
      sleep 0.2
    done < <(jq -r '.value[]? | [.id, .conversationId, (.subject//"")[0:40]] | @tsv' <<<"$resp")
    URL=$(jq -r '."@odata.nextLink" // empty' <<<"$resp")
    page=$((page+1))
    echo "   ...pagina $page verwerkt (lopend totaal ok=$ok)"
  done
done

echo ""
echo "=== FULL RELABEL KLAAR ==="
echo "  gelabeld(ok)=$ok  ambigue_overgeslagen=$skip_amb  niet-c_overgeslagen=$skip_other  fail=$fail"
echo "  totaal gelogd in undo: $(wc -l < "$APPLIED" | tr -d ' ')"
echo "  undo-log: $APPLIED"