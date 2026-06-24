#!/usr/bin/env bash
# ② full retroactive noise cleanup across the 3 live debtor mailboxes.
# Resolves each mailbox's WELL-KNOWN archive folder id, then runs noise-archive.sh.
set -u
CONN=0299d86c-13e5-8091-804c-2e66aeb4b0e6
DIR=/Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/agent-workforce/scripts
for MBX in debiteuren@smeba.nl debiteuren@berki.nl administratie@fire-control.nl; do
  AID=$(zapier-sdk curl "https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/archive?\$select=id,displayName" --connection "$CONN" -s 2>/dev/null | jq -r '.id // empty')
  dn=$(zapier-sdk curl "https://graph.microsoft.com/v1.0/users/$MBX/mailFolders/archive?\$select=displayName" --connection "$CONN" -s 2>/dev/null | jq -r '.displayName // "?"')
  echo "############ $MBX  → archive='$dn' ############"
  [ -z "$AID" ] && { echo "  geen well-known archive — overslaan"; continue; }
  bash "$DIR/noise-archive.sh" "$MBX" "$AID"
  echo ""
done
echo "ALLE 3 KLAAR. Totaal gearchiveerd-log: $(wc -l < /Users/nickcrutzen/gsd-workspaces/debtor-label-coverage/audit/noise_archive_applied.tsv | tr -d ' ')"