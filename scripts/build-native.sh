#!/usr/bin/env bash
# Compiles the native helpers. Today that is only the macOS text recognizer
# (native/ocr-mac/ocr.swift -> native/bin/avalet-ocr). A Windows helper would
# be built here too, behind its own platform check.
# Missing tools are a warning, not an error: the app runs without the helper,
# it just cannot read text from screenshots.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(uname)" != "Darwin" ]; then
  echo "build-native: skipped (macOS helper only)"
  exit 0
fi

SRC=native/ocr-mac/ocr.swift
OUT=native/bin/avalet-ocr
mkdir -p native/bin

if [ -f "$OUT" ] && [ "$OUT" -nt "$SRC" ]; then
  echo "build-native: up to date"
  exit 0
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "build-native: WARNING swiftc not found, screenshot text recognition will be unavailable." >&2
  echo "              Install the Xcode Command Line Tools: xcode-select --install" >&2
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if swiftc -O -target arm64-apple-macos13.0 "$SRC" -o "$TMP/arm64" 2>"$TMP/err-arm64" \
   && swiftc -O -target x86_64-apple-macos13.0 "$SRC" -o "$TMP/x86_64" 2>"$TMP/err-x86"; then
  lipo -create "$TMP/arm64" "$TMP/x86_64" -output "$OUT"
  echo "build-native: built universal $OUT"
elif swiftc -O "$SRC" -o "$OUT" 2>"$TMP/err-host"; then
  echo "build-native: built for this Mac only: $OUT"
else
  echo "build-native: WARNING compile failed, screenshot text recognition will be unavailable:" >&2
  cat "$TMP/err-host" >&2
  exit 0
fi
