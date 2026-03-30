#!/usr/bin/env bash
# Pushes KEY=value pairs to Netlify using scripts/sync_netlify_env.mjs (Node 18+).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
ENV_FILE="${1:?Usage: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... $0 <env-file>}"

NODE="node"
if [[ -x "$REPO_ROOT/.tools/node-v22.14.0-darwin-arm64/bin/node" ]]; then
  NODE="$REPO_ROOT/.tools/node-v22.14.0-darwin-arm64/bin/node"
fi

export NETLIFY_AUTH_TOKEN
export NETLIFY_SITE_ID
exec "$NODE" "$ROOT/sync_netlify_env.mjs" "$ENV_FILE"
