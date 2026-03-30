#!/usr/bin/env bash
# Upsert Cloudflare DNS for masjidweb.com (admin dashboard, template builder master.*, wildcard tenants, optional legacy manage.*).
# Requires: curl, jq
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'   # User API token: Zone > DNS > Edit, scoped to masjidweb.com
#   export MANAGE_CNAME_TARGET='cname-from-ycode.ycodeapp.com'   # optional legacy manage.*; skip if unset
#   ./scripts/cloudflare_masjidweb_dns.sh
#
# CF_PROXIED_NETLIFY applies to every CNAME below (Netlify + optional manage/YCode).
# Keep it false (default) for Netlify ACME and for YCode SaaS custom domains — orange cloud
# often causes redirect or certificate issues. To fix an existing proxied CNAME only,
# use: ./scripts/cloudflare_manage_dns_only.sh

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"

ZONE_NAME="${ZONE_NAME:-masjidweb.com}"
API="https://api.cloudflare.com/client/v4"
HDR=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

zone_id="$(curl -sS "${API}/zones?name=${ZONE_NAME}" "${HDR[@]}" \
  | jq -r '.result[0].id // empty')"
if [[ -z "${zone_id}" || "${zone_id}" == "null" ]]; then
  echo "Could not resolve zone id for ${ZONE_NAME}. Check token permissions." >&2
  exit 1
fi

upsert_cname() {
  local name="$1"      # e.g. master, *, or manage
  local content="$2"   # target hostname
  local proxied="${3:-true}"

  local fqdn
  if [[ "${name}" == "*" ]]; then
    fqdn="*.${ZONE_NAME}"
  else
    fqdn="${name}.${ZONE_NAME}"
  fi

  local existing
  existing="$(curl -sS -G "${API}/zones/${zone_id}/dns_records" "${HDR[@]}" \
    --data-urlencode "type=CNAME" \
    --data-urlencode "name=${fqdn}")"

  local rid
  rid="$(echo "${existing}" | jq -r '.result[0].id // empty')"

  local payload
  payload="$(jq -nc \
    --arg type "CNAME" \
    --arg name "${fqdn}" \
    --arg content "${content}" \
    --argjson proxied "${proxied}" \
    '{type:$type, name:$name, content:$content, proxied:$proxied, ttl:1}')"

  if [[ -n "${rid}" && "${rid}" != "null" ]]; then
    echo "Updating CNAME ${fqdn} -> ${content} (proxied=${proxied})"
    curl -sS -X PATCH "${API}/zones/${zone_id}/dns_records/${rid}" "${HDR[@]}" -d "${payload}" | jq .
  else
    echo "Creating CNAME ${fqdn} -> ${content} (proxied=${proxied})"
    curl -sS -X POST "${API}/zones/${zone_id}/dns_records" "${HDR[@]}" -d "${payload}" | jq .
  fi
}

# Netlify provisions Let's Encrypt via HTTP-01. Cloudflare "proxied" (orange cloud) often breaks
# that handshake (ACME gets 404 at /.well-known/...). Use DNS-only (grey cloud) for Netlify targets.
# Override with: CF_PROXIED_NETLIFY=true
CF_PROXIED_NETLIFY="${CF_PROXIED_NETLIFY:-false}"
# Tenant admin dashboard (Astro)
upsert_cname "admin" "masjidweb-admin-v2.netlify.app" "${CF_PROXIED_NETLIFY}"
# Template YCode builder (same Netlify site as wildcard tenant hosts)
upsert_cname "master" "masjidweb-multi.netlify.app" "${CF_PROXIED_NETLIFY}"
upsert_cname "*" "masjidweb-multi.netlify.app" "${CF_PROXIED_NETLIFY}"

if [[ -n "${MANAGE_CNAME_TARGET:-}" ]]; then
  upsert_cname "manage" "${MANAGE_CNAME_TARGET}" "${CF_PROXIED_NETLIFY}"
else
  echo "Skipping manage.masjidweb.com (set MANAGE_CNAME_TARGET to YCode CNAME from Settings > Domains)."
fi

echo "Done."
