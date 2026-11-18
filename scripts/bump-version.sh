#!/usr/bin/env bash
# Bump the BankApp version and date the Unreleased changelog section.
# Usage: scripts/bump-version.sh patch|minor|major
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIND="${1:?usage: bump-version.sh patch|minor|major}"
CURRENT="$(tr -d '[:space:]' < "$ROOT/VERSION")"
IFS=. read -r MA MI PA <<< "$CURRENT"
case "$KIND" in
  major) MA=$((MA+1)); MI=0; PA=0 ;;
  minor) MI=$((MI+1)); PA=0 ;;
  patch) PA=$((PA+1)) ;;
  *) echo "unknown bump: $KIND" >&2; exit 1 ;;
esac
NEW="$MA.$MI.$PA"
DATE="$(date +%Y-%m-%d)"
if ! grep -q '^## \[Unreleased\]' "$ROOT/CHANGELOG.md"; then echo "CHANGELOG.md has no Unreleased section" >&2; exit 1; fi
if ! awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f && /^- /{found=1} END{exit !found}' "$ROOT/CHANGELOG.md"; then
  echo "Unreleased section is empty: add the changes first" >&2; exit 1
fi
python3 - "$ROOT/CHANGELOG.md" "$NEW" "$DATE" <<'PY'
import sys
path, new, date = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding='utf-8').read()
s = s.replace('## [Unreleased]\n', f'## [Unreleased]\n\n## [{new}] - {date}\n', 1)
open(path, 'w', encoding='utf-8').write(s)
PY
printf '%s\n' "$NEW" > "$ROOT/VERSION"
echo "$CURRENT -> $NEW"
