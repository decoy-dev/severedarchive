#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p raw
while read -r id url; do
  [ -z "$id" ] && continue
  if [ "$url" = "SYNTH" ]; then
    ./scripts/synth-fallback.sh "$id"
    continue
  fi
  if ! curl -fsSL --retry 2 -o "raw/${id}.mp4" "$url" || ! ffprobe -v error "raw/${id}.mp4" 2>/dev/null; then
    echo "FETCH FAILED for ${id} — synthesizing fallback"
    ./scripts/synth-fallback.sh "$id"
  fi
done < scripts/sources.txt
