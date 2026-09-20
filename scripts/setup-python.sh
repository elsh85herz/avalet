#!/usr/bin/env bash
# Creates the python-sidecar venv used in dev mode and bundled into personal
# (unsigned) packaged builds — see electron/python-runtime.ts and
# electron-builder.config.mjs extraResources.
set -euo pipefail
cd "$(dirname "$0")/../python-sidecar"

# --copies instead of the default symlinks: symlinked venvs point at the
# system python3 by absolute path and break once copied into an app bundle's
# Resources/ (packaged builds run on a machine that may not have python3 at
# that exact path, or at all). Real copies keep the venv self-contained.
python3 -m venv --copies .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

echo "python-sidecar venv ready at python-sidecar/.venv"
