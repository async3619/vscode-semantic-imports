#!/usr/bin/env bash
set -euo pipefail

VERSION="$1"

# Skip marketplace packaging for pre-release versions
if [[ "$VERSION" == *-* ]]; then exit 0; fi

vsce package --no-dependencies
