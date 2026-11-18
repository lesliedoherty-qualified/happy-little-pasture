#!/usr/bin/env bash
# Re-captures the PiperX meeting booker from a local fireball checkout, then
# rebuilds site/booker/. Run after pulling fireball (or editing the booker there)
# so the lab page shows the current markup and CSS.
#
#   npm run booker:refresh                     # uses ~/_Server/qualified/fireball
#   FIREBALL=~/path/to/worktree npm run booker:refresh
#
# The dump test is copied into fireball, run, and removed again (even on failure).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
fireball="${FIREBALL:-$HOME/_Server/qualified/fireball}"
services="$fireball/services"
dest_dir="$services/app/javascript/widget/multimodal_v2/components/meetings"
test_name="zz_booker_static_dump.test.tsx"
dump_dir="$repo/scripts/booker/dump"

if [[ ! -d "$dest_dir" ]]; then
  echo "Can't find $dest_dir. Set FIREBALL to your fireball checkout." >&2
  exit 1
fi

cp "$here/booker/$test_name" "$dest_dir/$test_name"
trap 'rm -f "$dest_dir/$test_name"' EXIT

mkdir -p "$dump_dir"
(
  cd "$services"
  BOOKER_DUMP_DIR="$dump_dir" mise run test:js "app/javascript/widget/multimodal_v2/components/meetings/$test_name"
)

# Mark a capture of uncommitted edits, so the lab never passes one off as a commit.
sha="$(git -C "$fireball" rev-parse --short HEAD)"
# The copied dump test is still in place here (the trap removes it on exit), so leave it out.
if [[ -n "$(git -C "$fireball" status --porcelain -- services/app/javascript/widget/multimodal_v2 \
  ":(exclude)services/app/javascript/widget/multimodal_v2/components/meetings/$test_name")" ]]; then
  sha="$sha+uncommitted"
fi
echo "Captured from $sha ($(git -C "$fireball" branch --show-current))"
echo "$sha" > "$dump_dir/fireball-sha.txt"

node "$repo/scripts/build-booker.mjs"
