#!/usr/bin/env bash
# Copies a self-hosted Qualified package from a local fireball worktree into site/qualified/
# and builds site/self-hosted.html from it. Both are local-only and git-ignored.
#
#   npm run self-hosted                    # copy the last export, rebuild the page
#   npm run self-hosted -- --export        # export a fresh package from fireball first
#   FIREBALL=~/path/to/worktree npm run self-hosted -- --export
#
# The package's README carries the team's saved settings as of the export, so export again
# after every settings save. The export packages fireball's widget-stable build; rebuild that
# with `mise run build:js:stable` in fireball/services when the widget code changes.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
fireball="${FIREBALL:-$HOME/_Server/qualified/fireball-qai-6672}"
services="$fireball/services"
export_script="tmp/qai-6672-export-local-package.rb"
package_dir="$services/tmp/qai-6672-self-hosted"
dest="$repo/site/qualified"

if [[ "${1:-}" == "--export" ]]; then
  if [[ ! -f "$services/$export_script" ]]; then
    echo "Can't find $services/$export_script. Set FIREBALL to the QAI-6672 worktree." >&2
    exit 1
  fi
  echo "Exporting a fresh package from $fireball"
  # The export adds files without removing old builds; clear them so only this package remains.
  rm -rf "$package_dir/assets"
  (cd "$services" && mise exec -- bin/rails runner "$export_script" 2>/dev/null | grep -E '^(Exported|Saved settings|Build missing|Development only)')
fi

if [[ ! -f "$package_dir/assets/README.md" ]]; then
  echo "No exported package in $package_dir. Run with --export." >&2
  exit 1
fi

mkdir -p "$dest"
rsync -a --delete "$package_dir/assets/" "$dest/"
cp "$package_dir/package.json" "$dest/package-info.json"
node "$repo/scripts/self-hosted/build-page.mjs"
echo "Open a fresh incognito window: http://localhost:${PORT:-4600}/self-hosted.html"
