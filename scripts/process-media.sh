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
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 8 -vf "scale=-2:240,fps=24,format=yuv420p" \
    -c:v libx264 -crf 32 -preset slow -movflags +faststart -an "public/media/${id}_thumb.mp4"
  if [ "$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "raw/${id}.mp4")" = "audio" ]; then
    AUDIO_ARGS="-c:a aac -b:a 96k"
  else
    AUDIO_ARGS="-an"
  fi
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart \
    $AUDIO_ARGS "public/media/${id}_full.mp4"
  ffmpeg -y -v error -ss 1 -i "raw/${id}.mp4" -frames:v 1 -vf "scale=-2:480" -q:v 4 "public/media/${id}_poster.jpg"
done
# Encodes and metadata are regenerated together or they drift apart again.
node scripts/gen-media-meta.mjs
du -sh public/media
