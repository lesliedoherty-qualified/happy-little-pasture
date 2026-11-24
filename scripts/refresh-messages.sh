#!/usr/bin/env bash
# Re-captures the PiperX messenger (Main), one conversation per state, from a fireball
# checkout, then rebuilds site/messages/. Run after fireball's master moves (or after editing
# the timeline there) so the page shows the current markup and CSS.
#
#   npm run messages:refresh                     # uses ~/_Server/qualified/fireball-master
#   FIREBALL=~/path/to/worktree npm run messages:refresh
#
# The default is the fireball-master worktree, which is always on master. Only Jest and
# `panda cssgen` run there: no stack, no database.
#
# The dump test is copied into fireball, run, and removed again (even on failure).
# The stylesheet comes from `panda cssgen` in the same checkout, written into the dump.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
fireball="${FIREBALL:-$HOME/_Server/qualified/fireball-master}"
services="$fireball/services"
rel="app/javascript/widget/multimodal_v2/components/app"
dest_dir="$services/$rel"
test_name="zz_messages_static_dump.test.tsx"
dump_dir="$repo/scripts/messages/dump"

if [[ ! -d "$dest_dir" ]]; then
  echo "Can't find $dest_dir. Set FIREBALL to your fireball checkout." >&2
  exit 1
fi

cp "$here/messages/$test_name" "$dest_dir/$test_name"
trap 'rm -f "$dest_dir/$test_name"' EXIT

# Start clean, so a state removed from the test doesn't linger in the dump.
rm -rf "$dump_dir"
mkdir -p "$dump_dir"
(
  cd "$services"
  MESSAGES_DUMP_DIR="$dump_dir" mise run test:js "$rel/$test_name"
  # The widget's real stylesheet, as the build makes it. Not the test's copy: Jest's Panda
  # transformer rewrites that for jsdom (:host to html, no @layer, no :where()), which breaks
  # it inside a shadow root. Same command the transformer runs, written outside fireball.
  mise exec -- npx panda cssgen --silent \
    --config app/javascript/widget/multimodal_v2/panda.config.ts --outfile "$dump_dir/panda.css"
)

# Mark a capture of uncommitted edits, so the page never passes one off as a commit.
sha="$(git -C "$fireball" rev-parse --short HEAD)"
# The copied dump test is still in place here (the trap removes it on exit), so leave it out.
if [[ -n "$(git -C "$fireball" status --porcelain -- services/app/javascript/widget/multimodal_v2 \
  ":(exclude)services/$rel/$test_name")" ]]; then
  sha="$sha+uncommitted"
fi
echo "Captured from $sha ($(git -C "$fireball" branch --show-current))"
echo "$sha" > "$dump_dir/fireball-sha.txt"

node "$repo/scripts/build-messages.mjs"
