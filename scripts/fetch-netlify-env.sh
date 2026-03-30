#!/usr/bin/env bash
# Writes Netlify site env vars to admin-dashboard-v2/.env for local `npm run dev`.
# Usage: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... bash scripts/fetch-netlify-env.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

NODE="node"
if [[ -x "$REPO_ROOT/.tools/node-v22.14.0-darwin-arm64/bin/node" ]]; then
  NODE="$REPO_ROOT/.tools/node-v22.14.0-darwin-arm64/bin/node"
fi

export NETLIFY_AUTH_TOKEN
export NETLIFY_SITE_ID
exec "$NODE" "$ROOT/fetch_netlify_env.mjs" "$@"
