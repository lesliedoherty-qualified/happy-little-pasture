#!/usr/bin/env bash
# Slices the team character sheet (3 columns x 2 rows) into six portraits
# for the team section: site/img/team/1.png ... 6.png, left to right,
# top row first.
#
#   npm run team -- path/to/character-sheet.png
#
# Uses sips, which ships with macOS. No other dependencies.
set -euo pipefail

src="${1:-site/img/team/character-sheet.png}"
out_dir="$(cd "$(dirname "$0")/.." && pwd)/site/img/team"
size="${TEAM_PORTRAIT_SIZE:-480}"

if [[ ! -f "$src" ]]; then
  echo "Character sheet not found: $src" >&2
  echo "Usage: npm run team -- path/to/character-sheet.png" >&2
  exit 1
fi

mkdir -p "$out_dir"
width=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
height=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
cell_w=$((width / 3))
cell_h=$((height / 2))
cell=$((cell_w < cell_h ? cell_w : cell_h))

n=1
for row in 0 1; do
  for col in 0 1 2; do
    # Square crop centred in each grid cell.
    x=$((col * cell_w + (cell_w - cell) / 2))
    y=$((row * cell_h + (cell_h - cell) / 2))
    dest="$out_dir/$n.png"
    sips --cropToHeightWidth "$cell" "$cell" --cropOffset "$y" "$x" "$src" --out "$dest" >/dev/null
    sips --resampleHeightWidth "$size" "$size" "$dest" >/dev/null
    echo "wrote site/img/team/$n.png"
    n=$((n + 1))
  done
done
