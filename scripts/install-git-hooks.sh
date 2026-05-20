#!/usr/bin/env bash
# Wire repository-managed git hooks into .git/hooks.
#
# Idempotent. Run once after cloning, or after pulling new hooks.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
src_dir="$repo_root/scripts/git-hooks"
dst_dir="$repo_root/.git/hooks"

if [ ! -d "$src_dir" ]; then
  echo "No hook source directory at $src_dir" >&2
  exit 1
fi

mkdir -p "$dst_dir"
installed=0
for hook in "$src_dir"/*; do
  name="$(basename "$hook")"
  dst="$dst_dir/$name"
  if [ -e "$dst" ] && ! cmp -s "$hook" "$dst"; then
    backup="$dst.bak.$(date +%s)"
    mv "$dst" "$backup"
    echo "Backed up existing $name → $backup"
  fi
  cp "$hook" "$dst"
  chmod +x "$dst"
  echo "Installed: $name"
  installed=$((installed + 1))
done

echo ""
echo "Installed $installed hook(s) into $dst_dir."
echo "Bypass any hook for one push with: git push --no-verify"
