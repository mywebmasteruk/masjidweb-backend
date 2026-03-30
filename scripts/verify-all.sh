#!/usr/bin/env bash
# Run full local verification (no cloud credentials required).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> admin-dashboard-v2: tsc + test + build"
(cd admin-dashboard-v2 && npx tsc --noEmit && npm test && npm run build)

echo "==> ycode-masjidweb: tsc + test + lint + build"
(cd ycode-masjidweb && npx tsc --noEmit && npm test && npm run lint && npm run build)

echo "==> All checks passed."
