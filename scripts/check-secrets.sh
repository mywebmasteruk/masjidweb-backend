#!/usr/bin/env bash
# Fail if tracked or staged files contain likely secrets (JWTs, API keys, tokens).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

scan_paths() {
  if git rev-parse --git-dir >/dev/null 2>&1; then
    git ls-files
  else
    find . -type f \
      ! -path './.git/*' \
      ! -path './node_modules/*' \
      ! -path './admin-dashboard-v2/node_modules/*' \
      ! -path './ycode-masjidweb/node_modules/*' \
      ! -path './admin-dashboard-v2/dist/*'
  fi
}

violations=0

while IFS= read -r file; do
  [[ -z "$file" || ! -f "$file" ]] && continue
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.woff|*.woff2|*.ttf|*.eot|package-lock.json|*.lock)
      continue
      ;;
    scripts/check-secrets.sh|docs/SECRET_LEAK_RESPONSE.md|.cursor/rules/no-secrets-in-repo.mdc)
      continue
      ;;
  esac

  if grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "$file" 2>/dev/null; then
    echo "SECRET SCAN: possible JWT in $file"
    violations=$((violations + 1))
    continue
  fi

  if grep -qE '\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_live_[A-Za-z0-9]{10,})\b' "$file" 2>/dev/null; then
    echo "SECRET SCAN: possible API token in $file"
    violations=$((violations + 1))
    continue
  fi

  if [[ "$file" == *".example"* ]]; then
    continue
  fi

  if grep -qE '(SUPABASE_SERVICE_ROLE_KEY|NETLIFY_AUTH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|STRIPE_SECRET)[[:space:]]*=[[:space:]]*eyJ[A-Za-z0-9_-]{10,}' "$file" 2>/dev/null; then
    echo "SECRET SCAN: possible env secret assignment in $file"
    violations=$((violations + 1))
    continue
  fi

  if grep -E '(SUPABASE_SERVICE_ROLE_KEY|NETLIFY_AUTH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|STRIPE_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$file" 2>/dev/null \
    | grep -qE '[A-Za-z0-9/+=_-]{32,}' \
    && ! grep -E '(SUPABASE_SERVICE_ROLE_KEY|NETLIFY_AUTH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|STRIPE_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$file" 2>/dev/null \
    | grep -qE '\.\.\.'; then
    echo "SECRET SCAN: possible env secret assignment in $file"
    violations=$((violations + 1))
  fi
done < <(scan_paths)

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "Found $violations possible secret(s). Remove them before commit."
  echo "See docs/SECRET_LEAK_RESPONSE.md"
  exit 1
fi

echo "Secret scan passed."
