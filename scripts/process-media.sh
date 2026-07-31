#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/media
# background: 720p, hard-compressed, silent, 10s loopable
ffmpeg -y -v error -i raw/bg.mp4 -t 10 -vf "scale=-2:720,fps=24,format=yuv420p" \
  -c:v libx264 -crf 30 -preset slow -movflags +faststart -an public/media/bg.mp4
ffmpeg -y -v error -ss 1 -i raw/bg.mp4 -frames:v 1 -vf "scale=-2:720" -q:v 4 public/media/bg_poster.jpg
for id in file01 file02 file03 file04 file05 file06 file07 file08 file09 file10 file11 file12; do
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
du -sh public/media
