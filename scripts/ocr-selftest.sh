#!/usr/bin/env bash
# Runs the recognizer on a fixture with known Russian and English text.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build-native.sh
[ -x native/bin/avalet-ocr ] || { echo "ocr-selftest: helper not built"; exit 1; }
OUT=$(native/bin/avalet-ocr native/ocr-mac/selftest.png ru-RU,en-US)
for word in "Требование" "Система" "Requirement" "login"; do
  echo "$OUT" | grep -qi "$word" && echo "ok    $word" || { echo "MISSING $word"; echo "$OUT"; exit 1; }
done
echo "ocr-selftest: passed"
