#!/usr/bin/env bash
# Slices the team character sheet (3 columns x 2 rows) into six portraits
# for the team section: site/img/team/1.png ... 6.png, left to right,
# top row first.
#
#   npm run team -- path/to/character-sheet.png
#
# Uses sips, which ships with macOS. No other dependencies.
set -euo pipefail

src="${1:-art/character-sheet.png}"
out_dir="$(cd "$(dirname "$0")/.." && pwd)/site/img/team"
size="${TEAM_PORTRAIT_SIZE:-480}"
# Characters on the sheet sit off-centre and close together (16px apart in
# the bottom row), so a plain grid cut catches slivers of the neighbours.
# Instead each character is cut to its own horizontal range (measured on the
# 1536px sheet, plus a small margin, scaled for other sizes) at full row
# height, then padded back to a square with the sheet's cream.
# Top trims drop pixels from the top of a crop, for a floor shadow from the
# row above that crosses the row line. Order: left to right, top row first.
read -r -a ranges <<< "${TEAM_X_RANGES:-130-560 584-884 978-1384 225-598 630-1031 1031-1346}"
read -r -a top_trims <<< "${TEAM_TOP_TRIMS:-0 0 0 0 0 20}"
pad_color="${TEAM_PAD_COLOR:-FEF7EE}"

if [[ ! -f "$src" ]]; then
  echo "Character sheet not found: $src" >&2
  echo "Usage: npm run team -- path/to/character-sheet.png" >&2
  exit 1
fi

mkdir -p "$out_dir"
width=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
height=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
row_h=$((height / 2))

for n in 1 2 3 4 5 6; do
  range="${ranges[$((n - 1))]}"
  x0=$(( ${range%-*} * width / 1536 ))
  x1=$(( ${range#*-} * width / 1536 ))
  crop_w=$((x1 - x0))
  side=$((crop_w > row_h ? crop_w : row_h))
  trim=$(( top_trims[n - 1] * width / 1536 ))
  y=$(( (n <= 3 ? 0 : row_h) + trim ))
  crop_h=$((row_h - trim))
  # sips ignores an offset of 0 and crops from the centre instead.
  x0=$((x0 < 1 ? 1 : x0))
  y=$((y < 1 ? 1 : y))
  dest="$out_dir/$n.png"
  sips --cropToHeightWidth "$crop_h" "$crop_w" --cropOffset "$y" "$x0" "$src" --out "$dest" >/dev/null
  sips --padToHeightWidth "$side" "$side" --padColor "$pad_color" "$dest" >/dev/null 2>&1
  sips --resampleHeightWidth "$size" "$size" "$dest" >/dev/null
  echo "wrote site/img/team/$n.png"
done
