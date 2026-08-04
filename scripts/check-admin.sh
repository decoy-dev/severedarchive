#!/usr/bin/env bash
# End-to-end check of the deployed admin Worker.
#
#   ./scripts/check-admin.sh
#
# Logs in with the passcode, then reads the content file back through the
# session. That second call is the part that proves GITHUB_TOKEN works: the
# Worker cannot answer it without reaching the GitHub API.
#
# The passcode is read from the terminal with echo off and passed to curl
# through a file descriptor, never as an argument — an argument is visible in
# `ps` to every process on the machine, and lands in shell history.
#
# Needs a real terminal. Every login counts against the rate limit: 8 per IP
# per hour, and a lockout waits the window out rather than being let in.
set -euo pipefail

BASE="${ADMIN_BASE:-https://severedarchive-admin.chris-216.workers.dev}"
ORIGIN="${ADMIN_ORIGIN:-https://decoy-dev.github.io}"

if [ ! -t 0 ]; then
  echo "check-admin: needs a terminal (the passcode is typed, not piped)." >&2
  exit 1
fi

command -v jq >/dev/null || { echo "check-admin: needs jq" >&2; exit 1; }

read -rsp 'Passcode: ' PASSCODE
echo

JAR="$(mktemp -t sa-admin-cookies)"
# The cookie jar holds a live session; remove it whatever happens.
trap 'rm -f "$JAR"' EXIT

# jq builds the JSON so a passcode containing a quote or a backslash cannot
# break out of the body, and --arg keeps it off the command line.
BODY="$(jq -nc --arg p "$PASSCODE" '{passcode:$p}')"
unset PASSCODE

printf '1. POST /api/session … '
CODE="$(printf '%s' "$BODY" | curl -sS -o /tmp/sa-login.json -w '%{http_code}' \
  -c "$JAR" -X POST -H "origin: $ORIGIN" -H 'content-type: application/json' \
  --data-binary @- "$BASE/api/session")"
unset BODY
if [ "$CODE" = "200" ]; then
  echo "200 — passcode accepted"
elif [ "$CODE" = "429" ]; then
  echo "429 — rate limited; wait out the hour"; exit 1
else
  echo "$CODE — passcode rejected"; cat /tmp/sa-login.json; exit 1
fi

printf '2. session cookie is httpOnly … '
grep -q 'HttpOnly\|#HttpOnly' "$JAR" && echo 'yes' || echo 'NO — investigate'

printf '3. GET /api/content (proves GITHUB_TOKEN reaches GitHub) … '
CODE="$(curl -sS -o /tmp/sa-content.json -w '%{http_code}' -b "$JAR" "$BASE/api/content")"
case "$CODE" in
  200) echo "200 — GitHub reachable"; jq -r 'if .content == null then "   (content.json does not exist yet — expected before the first edit)" else "   content.json read, \(.content|length) bytes" end' /tmp/sa-content.json ;;
  502) echo "502 — the Worker could not reach GitHub. Check GITHUB_TOKEN's scopes."; exit 1 ;;
  *)   echo "$CODE — unexpected"; cat /tmp/sa-content.json; exit 1 ;;
esac

rm -f /tmp/sa-login.json /tmp/sa-content.json
echo
echo 'Admin backend is live and authenticated.'
