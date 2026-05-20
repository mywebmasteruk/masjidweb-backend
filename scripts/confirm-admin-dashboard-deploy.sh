#!/usr/bin/env bash
# Wait for the GitHub Actions deploy workflow for a commit (default: HEAD).
# Usage: ./scripts/confirm-admin-dashboard-deploy.sh [commit-sha]
# Exit 0 only when "Deploy admin dashboard to Netlify" succeeds for that commit.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-mywebmasteruk/masjidweb-backend}"
SHA="${1:-$(git rev-parse HEAD)}"
SHORT="${SHA:0:7}"

echo "Looking for deploy workflow run for commit ${SHORT} in ${REPO}..."

RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(gh run list \
    --repo "$REPO" \
    --workflow "deploy-admin-dashboard.yml" \
    --commit "$SHA" \
    --json databaseId,status \
    --limit 1 \
    -q '.[0].databaseId // empty' 2>/dev/null || true)"
  if [ -n "$RUN_ID" ]; then
    break
  fi
  sleep 2
done

if [ -z "$RUN_ID" ]; then
  echo "No deploy workflow run found for commit ${SHORT}." >&2
  echo "Push to main with admin-dashboard-v2 changes, or run workflow_dispatch." >&2
  exit 1
fi

echo "Watching run ${RUN_ID}..."
gh run watch "$RUN_ID" --repo "$REPO" --exit-status

CONCLUSION="$(gh run view "$RUN_ID" --repo "$REPO" --json conclusion -q .conclusion)"
URL="$(gh run view "$RUN_ID" --repo "$REPO" --json url -q .url)"

if [ "$CONCLUSION" != "success" ]; then
  echo "Deploy workflow finished with conclusion: ${CONCLUSION}" >&2
  echo "Run: ${URL}" >&2
  exit 1
fi

echo ""
echo "Deploy confirmed for commit ${SHORT}."
echo "Workflow: ${URL}"
echo "Production: https://admin.masjidweb.com"
echo "Open the job summary on GitHub for Netlify deploy URL and commit details."
