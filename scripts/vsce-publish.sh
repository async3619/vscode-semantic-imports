#!/usr/bin/env bash
set -euo pipefail

VERSION="$1"

# Skip marketplace publishing for pre-release versions
if [[ "$VERSION" == *-* ]]; then exit 0; fi

vsce publish --no-dependencies --packagePath *.vsix
