#!/usr/bin/env bash
# The poster still for one entry.
#
#   scripts/render-poster.sh <id> <source> [thumb-json] [custom-image]
#
# `source` is the clip the frame is grabbed from — the raw during an ingest, or
# the committed `_full.mp4` when only the thumbnail is being changed. That second
# case is the point of this file existing separately: changing which frame is the
# poster must not re-encode the work.
#
# `thumb-json` is the spec the admin editor produced: `{time, zoom, cx, cy}`. The
# crop is a zoom about a focal point, NOT a free rectangle, so the poster keeps
# the clip's aspect and still drops into a box shaped by the clip — see
# src/lib/thumbCrop.ts, which defines the same rectangle for the editor's
# preview. `x = cx * (1 - w)` is the transform-origin identity both sides use.
#
# `custom-image` replaces the frame grab entirely: the still becomes that image,
# cover-fitted to the clip's aspect so it fills the same box without bars.
set -euo pipefail
cd "$(dirname "$0")/.."

id="${1:?usage: render-poster.sh <id> <source> [thumb-json] [custom-image]}"
SRC="${2:?usage: render-poster.sh <id> <source> [thumb-json] [custom-image]}"
SPEC="${3:-}"
CUSTOM="${4:-}"
OUT="public/media/${id}_poster.jpg"
mkdir -p public/media

# jq is in every GitHub runner image, and the values are floats — awk parses
# them, bash cannot. Defaults match DEFAULT_THUMB.
read_field() {
  local key="$1" fallback="$2"
  if [ -z "$SPEC" ]; then printf '%s' "$fallback"; return; fi
  printf '%s' "$SPEC" | jq -r --arg k "$key" --arg d "$fallback" \
    'if (.[$k] | type) == "number" then .[$k] else ($d | tonumber) end'
}

TIME="$(read_field time 1)"
ZOOM="$(read_field zoom 1)"
CX="$(read_field cx 0.5)"
CY="$(read_field cy 0.5)"

# The aspect the still has to keep, taken from the clip itself rather than
# assumed: portrait, square and landscape all exist in this archive.
read -r VW VH <<EOF
$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "public/media/${id}_full.mp4" 2>/dev/null \
  | tr ',' ' ' || echo "")
EOF
if [ -z "${VW:-}" ] || [ -z "${VH:-}" ]; then
  # During an ingest the full may not exist yet; probe the source instead.
  read -r VW VH <<EOF
$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$SRC" | tr ',' ' ')
EOF
fi

# The crop, in pixels, even-aligned and clamped — the same arithmetic as
# `cropPixels`, which is unit-tested. Odd dimensions are an ffmpeg error, not a
# slightly-off image.
read -r CW CH CXP CYP <<EOF
$(awk -v w="$VW" -v h="$VH" -v z="$ZOOM" -v cx="$CX" -v cy="$CY" 'BEGIN {
    if (z < 1) z = 1;
    fw = 1 / z; fh = 1 / z;
    cw = int(w * fw / 2 + 0.5) * 2; if (cw < 2) cw = 2; if (cw > w) cw = int(w/2)*2;
    ch = int(h * fh / 2 + 0.5) * 2; if (ch < 2) ch = 2; if (ch > h) ch = int(h/2)*2;
    x = int(cx * (w - cw) + 0.5); if (x < 0) x = 0; if (x > w - cw) x = w - cw;
    y = int(cy * (h - ch) + 0.5); if (y < 0) y = 0; if (y > h - ch) y = h - ch;
    printf "%d %d %d %d\n", cw, ch, x, y
  }')
EOF

if [ -n "$CUSTOM" ]; then
  # A supplied image, cover-fitted to the clip's aspect: scale so it covers, then
  # take the centre. `increase` then `crop` is the ffmpeg spelling of
  # `object-fit: cover`, and it is what keeps an uploaded still from arriving
  # letterboxed in a box shaped by the video. The crop spec then applies on top,
  # so zoom and focal point work on an uploaded image exactly as on a frame.
  ffmpeg -y -v error -i "$CUSTOM" \
    -vf "scale=${VW}:${VH}:force_original_aspect_ratio=increase,crop=${VW}:${VH},crop=${CW}:${CH}:${CXP}:${CYP},scale=-2:480" \
    -frames:v 1 -q:v 4 "$OUT"
  printf '%s: poster from a supplied image, crop %sx%s+%s+%s\n' "$id" "$CW" "$CH" "$CXP" "$CYP"
else
  # `-ss` before `-i` seeks without decoding everything up to that point. It is
  # keyframe-accurate rather than exact, which is right here: this is a still from
  # a 12s loop, and an exact seek costs a full decode for a frame nobody can tell
  # apart from its neighbour.
  ffmpeg -y -v error -ss "$TIME" -i "$SRC" -frames:v 1 \
    -vf "crop=${CW}:${CH}:${CXP}:${CYP},scale=-2:480" -q:v 4 "$OUT"
  printf '%s: poster at %ss, crop %sx%s+%s+%s\n' "$id" "$TIME" "$CW" "$CH" "$CXP" "$CYP"
fi

test -s "$OUT"
