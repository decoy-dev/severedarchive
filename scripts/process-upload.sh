#!/usr/bin/env bash
# One uploaded file → the three renditions the site serves.
#
#   scripts/process-upload.sh <raw-path> <id>
#
# The ladder is lifted verbatim from process-media.sh's per-file loop, including
# the thumb-box search and its 0.1% tolerance. It is duplicated rather than
# imported because that script processes the whole of raw/ in one pass and this
# one runs per upload in CI — but they must stay in step: a thumb whose ratio
# drifts from its full is the letterboxing the true-frame ruling forbids.
#
# The raw is NEVER committed. It lands in raw/, which is gitignored, and CI
# discards the checkout afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW="${1:?usage: process-upload.sh <raw-path> <id>}"
id="${2:?usage: process-upload.sh <raw-path> <id>}"
mkdir -p public/media

if [ "$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$RAW")" = "audio" ]; then
  AUDIO_ARGS="-c:a aac -b:a 96k"
else
  AUDIO_ARGS="-an"
fi

# The full encode is the reference: generated metadata is probed from it, and
# every window's box is laid out from that metadata. So it is encoded FIRST and
# the thumb is derived from what it actually came out as.
# shellcheck disable=SC2086
ffmpeg -y -v error -i "$RAW" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
  -c:v libx264 -crf 26 -preset slow -movflags +faststart \
  $AUDIO_ARGS "public/media/${id}_full.mp4"

# Derive the thumb's box from the full's real dimensions, never from an
# independent `scale=-2:240` — see the long note in process-media.sh. One pixel
# of width at 240p is ~0.7% of the frame, and that drift becomes visible bars on
# every unfocused window.
FULL="public/media/${id}_full.mp4"
read -r TW TH TERR <<EOF
$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$FULL" \
  | awk -F, '{
      r = $1/$2; best = 1e9; bd = 1e9;
      for (th = 180; th <= 300; th += 2) {
        tw = int(r*th/2 + 0.5) * 2; if (tw < 2) tw = 2;
        e = tw/th - r; if (e < 0) e = -e; e = e/r;
        d = th - 240; if (d < 0) d = -d;
        if (e < best - 1e-12 || (e < best + 1e-12 && d < bd)) { best = e; bd = d; bw = tw; bh = th }
      }
      printf "%d %d %.6f\n", bw, bh, best*100
    }')
EOF
awk -v e="$TERR" 'BEGIN { exit (e < 0.1) ? 0 : 1 }' \
  || { echo "process-upload: no ${id} thumb box within 0.1% of its full (best ${TERR}%)" >&2; exit 1; }

# Same 12s trim as the full: the tier swap lands the playhead back where it was,
# which is only meaningful if both encodes are the same length of clip.
ffmpeg -y -v error -i "$RAW" -t 12 -vf "scale=${TW}:${TH},fps=24,format=yuv420p" \
  -c:v libx264 -crf 32 -preset slow -movflags +faststart -an "public/media/${id}_thumb.mp4"

# The poster is its own script: which frame it comes from, how it is cropped and
# whether it is a frame at all are editable after the fact, and changing them must
# not re-encode the work. THUMB_SPEC and THUMB_IMAGE are set by the workflow.
./scripts/render-poster.sh "$id" "$RAW" "${THUMB_SPEC:-}" "${THUMB_IMAGE:-}"

printf '%s: full + thumb %sx%s (%s%% from full) + poster\n' "$id" "$TW" "$TH" "$TERR"
