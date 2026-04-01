#!/usr/bin/env bash
# Automated checks for MasjidWeb multi-tenant + Supabase auth URL setup.
# Usage:
#   ./scripts/verify-masjidweb-checks.sh
# Optional (enables live Supabase auth config read):
#   export SUPABASE_ACCESS_TOKEN='sbp_...'
#   export SUPABASE_PROJECT_REF='jofgypmriaqphnsyxiks'
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

echo "========== 1) Public HTTP reachability =========="
for url in "https://masjidweb.com" "https://masjidemo1.masjidweb.com"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-redirs 8 -L "$url" || echo "000")
  if [[ "$code" =~ ^[0-9]+$ ]] && [[ "$code" -ge 200 && "$code" -lt 400 ]]; then
    echo "OK  $url -> HTTP $code"
  else
    echo "BAD $url -> HTTP $code" >&2
    FAIL=1
  fi
done
# Optional: tenant admin dashboard on admin.<domain> (add DNS + Netlify custom domain after scripts/cloudflare_masjidweb_dns.sh)
for url in "https://admin.masjidweb.com"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-redirs 8 -L "$url" 2>/dev/null || echo "000")
  if [[ "$code" =~ ^[0-9]+$ ]] && [[ "$code" -ge 200 && "$code" -lt 400 ]]; then
    echo "OK  $url -> HTTP $code"
  else
    echo "SKIP/WARN $url -> HTTP $code (add admin DNS + TLS or ignore until configured)" >&2
  fi
done

echo ""
echo "========== 2) Repo: provision invite redirectTo (tenant subdomain) =========="
if grep -q 'domainSuffix}/ycode/accept-invite' \
  admin-dashboard-v2/src/lib/provision-pipeline.ts 2>/dev/null; then
  echo "OK  provision-pipeline.ts uses per-tenant redirectTo"
else
  echo "BAD provision-pipeline.ts missing expected redirectTo pattern" >&2
  FAIL=1
fi

echo ""
echo "========== 3) Repo: InviteUserButton uses window.location.origin =========="
if grep -q "window.location.origin + '/ycode/accept-invite'" \
  ycode-masjidweb/app/ycode/components/InviteUserButton.tsx 2>/dev/null; then
  echo "OK  InviteUserButton redirectTo is origin-based"
else
  echo "BAD InviteUserButton pattern not found" >&2
  FAIL=1
fi

echo ""
echo "========== 4) Repo: signUp emailRedirectTo =========="
if grep -q 'emailRedirectTo:.*window.location.origin' \
  ycode-masjidweb/stores/useAuthStore.ts 2>/dev/null; then
  echo "OK  useAuthStore emailRedirectTo uses window.location.origin"
else
  echo "BAD useAuthStore emailRedirectTo pattern not found" >&2
  FAIL=1
fi

echo ""
echo "========== 5) Netlify deploy workflow present =========="
if [[ -f ycode-masjidweb/.github/workflows/deploy-to-netlify.yml ]]; then
  echo "OK  ycode-masjidweb/.github/workflows/deploy-to-netlify.yml exists"
else
  echo "BAD deploy workflow missing" >&2
  FAIL=1
fi

echo ""
echo "========== 6) Supabase hosted auth URL config (Management API) =========="
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "SKIP  Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF to verify Site URL + uri_allow_list live."
  echo "      Example: export SUPABASE_PROJECT_REF='jofgypmriaqphnsyxiks'"
else
  API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth"
  HDR=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json")
  if ! json="$(curl -sS -f "$API" "${HDR[@]}")"; then
    echo "BAD GET $API failed (token or ref invalid?)" >&2
    FAIL=1
  else
    site_url="$(echo "$json" | jq -r '.site_url // empty')"
    allow="$(echo "$json" | jq -r '.uri_allow_list // empty')"
    echo "site_url: $site_url"
    echo "uri_allow_list: $allow"
    if echo "$allow" | grep -qE '\*\.masjidweb\.com'; then
      echo "OK  uri_allow_list includes wildcard *.masjidweb.com"
    else
      echo "BAD uri_allow_list should include https://*.masjidweb.com/**" >&2
      FAIL=1
    fi
    if [[ "$site_url" == *"masjidweb.com"* ]]; then
      echo "OK  site_url is under masjidweb.com"
    else
      echo "WARN site_url unexpected: $site_url" >&2
    fi
  fi
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "========== RESULT: all runnable checks passed =========="
else
  echo "========== RESULT: some checks failed ==========" >&2
  exit 1
fi
