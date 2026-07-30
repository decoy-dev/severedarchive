#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; mkdir -p raw
seed=$(( $(echo -n "$id" | cksum | cut -d' ' -f1) % 6 ))
case $seed in
  0) src="gradients=s=1280x720:d=10:speed=0.03:c0=0x10141a:c1=0x6e7a83:c2=0xc9d2d8" ;;
  1) src="gradients=s=1280x720:d=10:speed=0.06:c0=0x07090b:c1=0x3d5060:c2=0xb6ff2e" ;;
  2) src="mandelbrot=s=1280x720:end_scale=0.1" ;;
  3) src="gradients=s=1280x720:d=10:speed=0.02:c0=0x1a1a1a:c1=0x8a959d:c2=0x2b3540" ;;
  4) src="life=s=1280x720:mold=10:r=25:ratio=0.1:death_color=#101418:life_color=#c9d2d8" ;;
  *) src="gradients=s=1280x720:d=10:speed=0.05:c0=0x0b0e11:c1=0xeff3f5:c2=0x555f66" ;;
esac
ffmpeg -y -v error -f lavfi -i "$src" -t 10 -vf "format=yuv420p,noise=alls=6:allf=t" \
  -c:v libx264 -crf 24 -an "raw/${id}.mp4"
