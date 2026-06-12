#!/usr/bin/env bash
# Apply a masjidweb-backend/supabase/migrations/*.sql file via Supabase Management API.
# Requires an access token for the org that owns the target project (not the service role key).
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN='sbp_...'
#   export SUPABASE_PROJECT_REF='jofgypmriaqphnsyxiks'
#   bash scripts/apply-supabase-migration-api.sh supabase/migrations/20260608120000_tenant_isolation_check_log.sql
#
# Prefer Supabase MCP apply_migration when Cursor MCP is connected to the same project_ref.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="${1:-}"

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN (Supabase account token, sbp_...)}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF (e.g. jofgypmriaqphnsyxiks)}"

if [[ -z "$SQL_FILE" ]]; then
  echo "Usage: bash scripts/apply-supabase-migration-api.sh <path-to-migration.sql>" >&2
  exit 1
fi

if [[ "$SQL_FILE" != /* ]]; then
  SQL_FILE="$ROOT/$SQL_FILE"
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing SQL file: $SQL_FILE" >&2
  exit 1
fi

NAME="$(basename "$SQL_FILE" .sql)"
NAME="${NAME#*_}" # drop leading timestamp if present

QUERY="$(cat "$SQL_FILE")"
PAYLOAD="$(jq -n --arg query "$QUERY" --arg name "$NAME" '{query: $query, name: $name}')"

API="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query"
HTTP_CODE="$(curl -sS -o /tmp/supabase-migration-api.out -w '%{http_code}' \
  -X POST "$API" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: masjidweb-apply-supabase-migration-api/1.0" \
  --data-binary "$PAYLOAD")"

if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
  echo "Migration API failed (HTTP $HTTP_CODE):" >&2
  cat /tmp/supabase-migration-api.out >&2
  exit 1
fi

echo "Applied $SQL_FILE to project $SUPABASE_PROJECT_REF (HTTP $HTTP_CODE)"
