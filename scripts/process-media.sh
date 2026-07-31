#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/media
# background: 720p, hard-compressed, silent, 10s loopable
ffmpeg -y -v error -i raw/bg.mp4 -t 10 -vf "scale=-2:720,fps=24,format=yuv420p" \
  -c:v libx264 -crf 30 -preset slow -movflags +faststart -an public/media/bg.mp4
ffmpeg -y -v error -ss 1 -i raw/bg.mp4 -frames:v 1 -vf "scale=-2:720" -q:v 4 public/media/bg_poster.jpg
# Discover, never enumerate: the hand-written file01..fileNN loop silently
# skipped raw/file07..file12 when they landed, which is how eleven durations
# and every aspect ratio went stale at once.
shopt -s nullglob
raws=(raw/file*.mp4)
if [ ${#raws[@]} -eq 0 ]; then echo "no raw/fileNN.mp4 to process" >&2; exit 1; fi
for path in "${raws[@]}"; do
  id="$(basename "$path" .mp4)"
  if [ "$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "raw/${id}.mp4")" = "audio" ]; then
    AUDIO_ARGS="-c:a aac -b:a 96k"
  else
    AUDIO_ARGS="-an"
  fi
  # The full encode is the reference: generated metadata is probed from it, and
  # every window's box is laid out from that metadata. So it is encoded FIRST and
  # the thumb is derived from what it actually came out as.
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart \
    $AUDIO_ARGS "public/media/${id}_full.mp4"

  # Derive the thumb's box from the full's real dimensions, never from an
  # independent `scale=-2:240`.
  #
  # Independent scaling rounds each encode to its own nearest even number, and at
  # 240p one pixel of width is ~0.7% of the frame: file07/file08 came out 136x240
  # (0.5667) against a full of 406x720 (0.5639), and file01 426x240 (1.7750)
  # against 1280x720 (1.7778). The window is sized from the full's ratio, so that
  # drift is ~3px of bars on every unfocused window — the letterboxing the
  # true-frame ruling forbids outright.
  #
  # An exact match is not always representable (406/720 reduces to 203/360, and
  # 203 is odd, so no smaller even-sided box has that ratio). Instead, search the
  # even boxes around 240p for the one closest to the full's ratio, preferring
  # 240p on a tie, and refuse to encode if the best is worse than 0.1%.
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
    || { echo "process-media: no ${id} thumb box within 0.1% of its full (best ${TERR}%)" >&2; exit 1; }
  # Same 12s trim as the full: the tier swap lands the playhead back where it was,
  # which is only meaningful if both encodes are the same length of clip.
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=${TW}:${TH},fps=24,format=yuv420p" \
    -c:v libx264 -crf 32 -preset slow -movflags +faststart -an "public/media/${id}_thumb.mp4"
  printf '%s thumb %sx%s (%s%% from full)\n' "$id" "$TW" "$TH" "$TERR"

  ffmpeg -y -v error -ss 1 -i "raw/${id}.mp4" -frames:v 1 -vf "scale=-2:480" -q:v 4 "public/media/${id}_poster.jpg"
done
# Encodes and metadata are regenerated together or they drift apart again.
node scripts/gen-media-meta.mjs
du -sh public/media
