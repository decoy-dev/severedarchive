#!/usr/bin/env bash
# One uploaded still → the three renditions the site serves.
#
#   scripts/process-photo.sh <raw-path> <id> [thumb-json]
#
# The photo counterpart of process-upload.sh, and deliberately the same shape:
# `_full`, `_thumb` and `_poster`, so every surface can ask for the same three
# things and only the extension differs. A still's ladder is `.jpg`.
#
# The true-frame ruling applies here exactly as it does to clips: `_thumb` must
# share `_full`'s aspect ratio to within 0.1%, because an unfocused window plays
# the thumb inside a box laid out from the full's dimensions. For an image that
# is easy — one scale factor, both axes — but it is asserted rather than assumed,
# because "easy" is how the video ladder's drift got shipped once already.
#
# The raw is NEVER committed. It lands in raw/, which is gitignored.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW="${1:?usage: process-photo.sh <raw-path> <id> [thumb-json]}"
id="${2:?usage: process-photo.sh <raw-path> <id> [thumb-json]}"
SPEC="${3:-}"
mkdir -p public/media

# A still with an alpha channel or a CMYK profile becomes a muddy JPEG without
# this: flatten onto black, which is the page's own ground, and convert to
# limited-range YUV like every other rendition here.
FLATTEN="format=yuv420p"

# `_full` is the reference, exactly as the video ladder's is: its dimensions are
# what `gen-media-meta.mjs` probes and what every window's box is laid out from.
# Capped on the LONG edge rather than the height, so a portrait still is not
# blown up to 1440 tall and a landscape one is not left at 4000 wide. `-2` keeps
# the other axis even and proportional.
LONG_AXIS="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$RAW" \
  | awk -F, '{ print ($1 >= $2) ? "w" : "h" }')"
if [ "$LONG_AXIS" = "w" ]; then
  FULL_SCALE="scale='min(1440,iw)':-2"
else
  FULL_SCALE="scale=-2:'min(1440,ih)'"
fi

ffmpeg -y -v error -i "$RAW" -vf "${FULL_SCALE},${FLATTEN}" -frames:v 1 -q:v 3 \
  "public/media/${id}_full.jpg"

# Derived from the full's REAL dimensions, never independently from the raw —
# the same rule as the video ladder, and for the same reason. Two independent
# scales of the same source disagree by a pixel, and that pixel is visible bars.
FULL="public/media/${id}_full.jpg"
read -r FW FH <<EOF
$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$FULL" | tr ',' ' ')
EOF

# The thumb's box is SEARCHED, not computed — lifted from process-upload.sh's
# per-file loop, which exists for exactly this reason.
#
# A single `scale=416:-2` looks obviously correct and is not: at 1440x960 it
# yields 416x278, which is 1.4964 against the full's 1.5000 — a 0.24% drift, over
# the 0.1% the true-frame ruling allows, and visible bars on every unfocused
# window. The search finds 414x276, which is exactly 1.5. One even-pixel choice
# either way is the whole difference, and it cannot be reasoned about per image.
#
# `-2` in ffmpeg rounds to the nearest even number; the search picks the box where
# that rounding lands on the ratio instead of near it.
read -r TW TH TERR <<EOF
$(awk -v fw="$FW" -v fh="$FH" -v long="$LONG_AXIS" 'BEGIN {
    r = fw/fh;
    # Target the long edge at 416, which is what the video thumbs measure.
    target = (long == "w") ? int(416/r + 0.5) : 416;
    # Snapped DOWN to even, and this is not cosmetic: the loop steps by 2, so an
    # odd start searches only odd heights. At 1440x960 that meant target 277 and
    # a search over 217,219,…,337 — which never tries 276, the box that is
    # exactly 1.5. It settled on 506x337 at 0.0989%, just inside the tolerance,
    # which is the worst kind of pass: a real drift that looks like a near miss.
    target = target - (target % 2);
    lo = (target > 40) ? target - 60 : 8; hi = target + 60;
    best = 1e9; bd = 1e9;
    for (th = lo; th <= hi; th += 2) {
      tw = int(r*th/2 + 0.5) * 2; if (tw < 2) tw = 2;
      e = tw/th - r; if (e < 0) e = -e; e = e/r;
      d = th - target; if (d < 0) d = -d;
      if (e < best - 1e-12 || (e < best + 1e-12 && d < bd)) { best = e; bd = d; bw = tw; bh = th }
    }
    printf "%d %d %.6f\n", bw, bh, best*100
  }')
EOF

# The true-frame assertion, 0.1% — the same budget process-upload.sh holds itself
# to for clips. It fires BEFORE the encode, so a bad box is a refusal rather than
# a shipped rendition nobody measures.
awk -v e="$TERR" 'BEGIN { exit (e < 0.1) ? 0 : 1 }' \
  || { echo "process-photo: no ${id} thumb box within 0.1% of its full (best ${TERR}%)" >&2; exit 1; }

ffmpeg -y -v error -i "$FULL" -vf "scale=${TW}:${TH},${FLATTEN}" -frames:v 1 -q:v 5 \
  "public/media/${id}_thumb.jpg"

# The poster, through the same renderer clips use, so a still's thumbnail is
# croppable and re-framable exactly like a clip's. `_full.jpg` is the source: the
# spec's `time` means nothing for an image, and render-poster.sh ignores it when
# handed one.
./scripts/render-poster.sh "$id" "$FULL" "$SPEC" "$FULL"

printf '%s: photo full %sx%s + thumb %sx%s (%s%% from full) + poster\n' "$id" "$FW" "$FH" "$TW" "$TH" "$TERR"
