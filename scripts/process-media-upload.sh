#!/usr/bin/env bash
# One uploaded file → its renditions, whichever kind it is.
#
#   scripts/process-media-upload.sh <raw-path> <id> <kind> [thumb-json] [thumb-image]
#
# The single entry point both workflows call. The kind decides the ladder, and it
# lives here rather than in the YAML because a branch in a workflow is a branch
# nothing can run locally.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW="${1:?usage: process-media-upload.sh <raw-path> <id> <kind> [thumb-json] [thumb-image]}"
id="${2:?usage: process-media-upload.sh <raw-path> <id> <kind> [thumb-json] [thumb-image]}"
kind="${3:?usage: process-media-upload.sh <raw-path> <id> <kind> [thumb-json] [thumb-image]}"
SPEC="${4:-}"
THUMB_IMAGE="${5:-}"

# The other kind's ladder must go, or `gen-media-meta.mjs` finds two fulls for one
# id and refuses — which is the right refusal, but it would strand a legitimate
# kind change (a video replaced by a still) as a failed run.
case "$kind" in
  photo)
    rm -f "public/media/${id}_full.mp4" "public/media/${id}_thumb.mp4"
    ./scripts/process-photo.sh "$RAW" "$id" "$SPEC"
    ;;
  video)
    rm -f "public/media/${id}_full.jpg" "public/media/${id}_thumb.jpg"
    THUMB_SPEC="$SPEC" THUMB_IMAGE="$THUMB_IMAGE" ./scripts/process-upload.sh "$RAW" "$id"
    ;;
  *)
    echo "process-media-upload: unknown kind ${kind}" >&2
    exit 1
    ;;
esac
