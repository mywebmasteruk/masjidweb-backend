#!/usr/bin/env bash
# Deploy ycode-masjidweb to the Netlify MT preview site (not production tenant pool).
# Prerequisites: Node 22+, Netlify CLI auth (`netlify login` or NETLIFY_AUTH_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_ID="${NETLIFY_SITE_ID_YCODE_MT_PREVIEW:-ba182366-13f5-4e1b-bcee-a0e5c305e986}"
cd "$ROOT/ycode-masjidweb"
echo "==> npm install --legacy-peer-deps"
npm install --legacy-peer-deps
echo "==> npm run build"
npm run build
echo "==> netlify deploy --prod (site ${SITE_ID})"
exec npx --yes netlify-cli deploy --prod --site "$SITE_ID"
