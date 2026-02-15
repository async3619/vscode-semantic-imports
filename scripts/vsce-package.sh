#!/usr/bin/env bash
set -euo pipefail

VERSION="$1"

# Skip marketplace packaging for pre-release versions
if [[ "$VERSION" == *-* ]]; then exit 0; fi

vsce package --no-dependencies

# vsce hardcodes node_modules/** exclusion (microsoft/vscode-vsce#970).
# Inject the TS server plugin into the VSIX (which is a zip archive).
VSIX=$(ls *.vsix)
PLUGIN_SRC="node_modules/semantic-imports-ts-plugin"
PLUGIN_DEST="extension/node_modules/semantic-imports-ts-plugin"

mkdir -p "$PLUGIN_DEST"
cp "$PLUGIN_SRC/package.json" "$PLUGIN_DEST/"
cp "$PLUGIN_SRC/index.js" "$PLUGIN_DEST/"
zip -u "$VSIX" "$PLUGIN_DEST/package.json" "$PLUGIN_DEST/index.js"
rm -rf extension/
