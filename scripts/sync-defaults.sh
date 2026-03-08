#!/usr/bin/env bash
# sync-defaults.sh
#
# Copies files from defaults/ into ~/.yapflows/ (or $YAPFLOWS_DIR).
# Safe to run repeatedly — only overwrites managed defaults, never touches
# user data (settings.json, chats/, memory/, runs/, tasks/, triggers/, log/).
#
# Usage:
#   scripts/sync-defaults.sh [--dry-run]

set -euo pipefail

YAPFLOWS_DIR="${USER_DIR:-$HOME/yapflows}"
DEFAULTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/defaults"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] No files will be written."
fi

# Subdirectories in defaults/ that map 1:1 to ~/.yapflows/
SYNC_DIRS=(agents environments knowledge skills tools tasks)

copy_file() {
  local src="$1"
  local dst="$2"
  local dst_dir
  dst_dir="$(dirname "$dst")"

  if $DRY_RUN; then
    echo "  would copy: $src -> $dst"
    return
  fi

  mkdir -p "$dst_dir"
  cp "$src" "$dst"
  echo "  copied: ${src#"$DEFAULTS_DIR/"} -> ${dst#"$YAPFLOWS_DIR/"}"
}

echo "Syncing defaults -> $YAPFLOWS_DIR"
echo ""

count=0
for dir in "${SYNC_DIRS[@]}"; do
  src_dir="$DEFAULTS_DIR/$dir"
  dst_dir="$YAPFLOWS_DIR/$dir"

  [[ -d "$src_dir" ]] || continue

  while IFS= read -r -d '' src_file; do
    rel="${src_file#"$src_dir/"}"
    dst_file="$dst_dir/$rel"
    copy_file "$src_file" "$dst_file"
    ((count++)) || true
  done < <(find "$src_dir" -type f -print0)
done

echo ""
if $DRY_RUN; then
  echo "Dry run complete. $count file(s) would be synced."
else
  echo "Done. $count file(s) synced."
fi
