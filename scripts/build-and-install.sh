#!/usr/bin/env bash
# Rebuilds Avalet and drops it straight into /Applications — no .dmg step.
# Locally-built + locally-copied means no com.apple.quarantine xattr, so no
# Gatekeeper "unidentified developer" prompt either. Use this for personal
# daily-use updates; use `npm run dist:mac:unsigned` alone when you actually
# need the .dmg file (e.g. to hand to someone else / a video download link).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run dist:mac:dir

APP_SRC=$(find release -maxdepth 2 -name "Avalet.app" -print -quit)
if [ -z "$APP_SRC" ]; then
  echo "error: Avalet.app not found under release/ — check the build output above." >&2
  exit 1
fi

WAS_RUNNING=false
if pgrep -x Avalet >/dev/null 2>&1; then
  WAS_RUNNING=true
  osascript -e 'quit app "Avalet"' 2>/dev/null || true
  sleep 1
fi

rm -rf "/Applications/Avalet.app"
cp -R "$APP_SRC" /Applications/
echo "Installed: /Applications/Avalet.app"

if [ "$WAS_RUNNING" = true ]; then
  open -a Avalet
  echo "Relaunched Avalet."
fi
