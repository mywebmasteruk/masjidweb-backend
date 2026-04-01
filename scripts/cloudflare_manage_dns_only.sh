#!/usr/bin/env bash
# DEPRECATED: master.* and manage.* subdomains have been retired.
# All tenant traffic (including the demo template masjidemo1) uses the wildcard *.masjidweb.com CNAME.
# This script is kept for reference only; run cloudflare_masjidweb_dns.sh instead.
#
# Original purpose: set a specific CNAME to DNS-only (grey cloud) in Cloudflare.
#
# Requires: curl, jq
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'
#   RECORD_NAME=some-record.masjidweb.com ./scripts/cloudflare_manage_dns_only.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="${CLOUDFLARE_API_TOKEN_FILE:-${SCRIPT_DIR}/.cloudflare_api_token}"
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -f "${TOKEN_FILE}" ]]; then
  CLOUDFLARE_API_TOKEN="$(tr -d ' \t\n\r' <"${TOKEN_FILE}")"
fi

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN or create ${TOKEN_FILE} (Cloudflare API token with DNS edit for the zone)}"

ZONE_NAME="${ZONE_NAME:-masjidweb.com}"
RECORD_NAME="${RECORD_NAME:?Set RECORD_NAME (e.g. admin.masjidweb.com)}"

API="https://api.cloudflare.com/client/v4"
HDR=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

zone_id="$(curl -sS "${API}/zones?name=${ZONE_NAME}" "${HDR[@]}" | jq -r '.result[0].id // empty')"
if [[ -z "${zone_id}" || "${zone_id}" == "null" ]]; then
  echo "Could not resolve zone id for ${ZONE_NAME}. Check token permissions." >&2
  exit 1
fi

existing="$(curl -sS -G "${API}/zones/${zone_id}/dns_records" "${HDR[@]}" \
  --data-urlencode "type=CNAME" \
  --data-urlencode "name=${RECORD_NAME}")"

rid="$(echo "${existing}" | jq -r '.result[0].id // empty')"
content="$(echo "${existing}" | jq -r '.result[0].content // empty')"
proxied="$(echo "${existing}" | jq -r '.result[0].proxied // false')"

if [[ -z "${rid}" || "${rid}" == "null" ]]; then
  echo "No CNAME found for ${RECORD_NAME}. Create it first (e.g. run cloudflare_masjidweb_dns.sh with MANAGE_CNAME_TARGET)." >&2
  exit 1
fi

if [[ "${proxied}" == "false" ]]; then
  echo "OK: ${RECORD_NAME} -> ${content} already DNS-only (proxied=false)."
  exit 0
fi

echo "Updating ${RECORD_NAME} -> ${content}: proxied ${proxied} -> false (DNS only)"
payload="$(jq -nc \
  --arg type "CNAME" \
  --arg name "${RECORD_NAME}" \
  --arg content "${content}" \
  '{type:$type, name:$name, content:$content, proxied:false, ttl:1}')"

resp="$(curl -sS -X PATCH "${API}/zones/${zone_id}/dns_records/${rid}" "${HDR[@]}" -d "${payload}")"
echo "${resp}" | jq .

success="$(echo "${resp}" | jq -r '.success')"
if [[ "${success}" != "true" ]]; then
  echo "Cloudflare API reported failure." >&2
  exit 1
fi

echo "Done. Wait a minute for DNS, then test: curl -IL https://${RECORD_NAME}/"
