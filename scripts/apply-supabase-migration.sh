#!/usr/bin/env bash
# Applies supabase/migrations SQL using psql and DATABASE_URL (pooler or direct).
# Get the connection string from Supabase → Project Settings → Database → Connection string (URI).
#
# Usage:
#   export DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres'
#   bash scripts/apply-supabase-migration.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/supabase/migrations/20250323120000_tenant_admin_tables.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing: $SQL_FILE"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your Supabase Postgres connection URI (service role is not required for DDL if user is postgres role)."
  echo "Example: export DATABASE_URL='postgresql://...'"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Install PostgreSQL client (psql), e.g. brew install libpq && brew link --force libpq"
  exit 1
fi

echo "Applying $SQL_FILE ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "Done."
