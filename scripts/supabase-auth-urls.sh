#!/usr/bin/env bash
# Apply Supabase hosted-project auth URL settings via Management API (same as Dashboard
# Authentication → URL Configuration: Site URL + Redirect URLs / uri_allow_list).
#
# Requires: curl, jq
# Token: https://supabase.com/dashboard/account/tokens (needs auth config read/write)
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN='sbp_...'
#   export SUPABASE_PROJECT_REF='your-project-ref'   # project ref / id from dashboard URL
#   ./scripts/supabase-auth-urls.sh
#
# Optional:
#   export SITE_URL='https://masjidweb.com'          # default Site URL (fallback)
#   export DRY_RUN=1                                 # print PATCH body only, do not send
#
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN (Supabase account access token)}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF (e.g. jofgypmriaqphnsyxiks)}"

SITE_URL="${SITE_URL:-https://masjidweb.com}"
API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth"
HDR=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json")

echo "Fetching current auth config..."
if ! current_json="$(curl -sS -f "$API" "${HDR[@]}")"; then
  echo "GET failed (check SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF)." >&2
  exit 1
fi

# Merge uri_allow_list: existing comma-separated + required entries, dedupe
new_allow_list="$(echo "$current_json" | jq -r '
  def split_csv(s):
    if s == null or s == "" then []
    else (s | split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length > 0)))
    end;
  (split_csv(.uri_allow_list)) as $ex
  | [
      "https://*.masjidweb.com/**"
    ] as $req
  | ($ex + $req | unique | join(","))
')"

patch_body="$(jq -n \
  --arg site_url "$SITE_URL" \
  --arg uri_allow_list "$new_allow_list" \
  '{site_url: $site_url, uri_allow_list: $uri_allow_list}')"

echo ""
echo "Planned update:"
echo "  site_url:       $SITE_URL"
echo "  uri_allow_list: $new_allow_list"
echo ""

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN=1 — not sending PATCH."
  echo "$patch_body" | jq .
  exit 0
fi

echo "Applying PATCH..."
if ! curl -sS -f -X PATCH "$API" "${HDR[@]}" -d "$patch_body" -o /dev/null; then
  echo "PATCH failed." >&2
  exit 1
fi

echo "Done. Verifying..."
curl -sS -f "$API" "${HDR[@]}" | jq '{site_url, uri_allow_list}'
