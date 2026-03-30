#!/usr/bin/env bash
# Downloads official Node.js into .tools/ if missing, then prints export instructions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VER="${NODE_VERSION:-22.14.0}"
ARCH="darwin-arm64"
TARBALL="node-v${NODE_VER}-${ARCH}"
DEST="$ROOT/.tools/${TARBALL}"

if [[ ! -x "$DEST/bin/node" ]]; then
  mkdir -p "$ROOT/.tools"
  echo "Installing Node.js ${NODE_VER} (${ARCH}) into $ROOT/.tools ..."
  curl -fsSL -o "$ROOT/.tools/node.tar.xz" "https://nodejs.org/dist/v${NODE_VER}/${TARBALL}.tar.xz"
  tar -xJf "$ROOT/.tools/node.tar.xz" -C "$ROOT/.tools"
  rm -f "$ROOT/.tools/node.tar.xz"
fi

echo "Node is ready at: $DEST/bin/node"
"$DEST/bin/node" -v
"$DEST/bin/npm" -v
echo ""
echo "Add to PATH for this shell:"
echo "  export PATH=\"$DEST/bin:\$PATH\""
