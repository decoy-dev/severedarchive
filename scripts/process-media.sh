#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/media
# background: 720p, hard-compressed, silent, 10s loopable
ffmpeg -y -v error -i raw/bg.mp4 -t 10 -vf "scale=-2:720,fps=24,format=yuv420p" \
  -c:v libx264 -crf 30 -preset slow -movflags +faststart -an public/media/bg.mp4
ffmpeg -y -v error -ss 1 -i raw/bg.mp4 -frames:v 1 -vf "scale=-2:720" -q:v 4 public/media/bg_poster.jpg
for id in file01 file02 file03 file04 file05 file06; do
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 8 -vf "scale=-2:240,fps=24,format=yuv420p" \
    -c:v libx264 -crf 32 -preset slow -movflags +faststart -an "public/media/${id}_thumb.mp4"
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart \
    -c:a aac -b:a 96k "public/media/${id}_full.mp4" 2>/dev/null || \
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart -an "public/media/${id}_full.mp4"
  ffmpeg -y -v error -ss 1 -i "raw/${id}.mp4" -frames:v 1 -vf "scale=-2:480" -q:v 4 "public/media/${id}_poster.jpg"
done
du -sh public/media
