#!/usr/bin/env bash
# Attendify DB migration runner
# Usage: ./db/migrate.sh
# Runs inside the deploy workflow via: docker exec attendify-db-main bash -c "$(cat db/migrate.sh)"
# Or directly: bash db/migrate.sh
#
# Tracks applied migrations in schema_migrations table.
# All migration files are expected to be idempotent.

set -euo pipefail

DB_CONTAINER="attendify-db-main"
DB_USER="attendify_user"
DB_NAME="attendify"
MIGRATIONS_DIR="/docker-entrypoint-initdb.d"

run_sql() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$1"
}

run_file() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -f "$1"
}

echo "[migrate] Ensuring schema_migrations table exists..."
run_sql "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

echo "[migrate] Scanning for pending migrations..."
APPLIED=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT version FROM schema_migrations ORDER BY version;")

for file in $(docker exec "$DB_CONTAINER" ls "$MIGRATIONS_DIR" | grep '\.sql$' | sort); do
  version=$(basename "$file" .sql)
  if echo "$APPLIED" | grep -qx "$version"; then
    echo "[migrate] SKIP  $version (already applied)"
  else
    echo "[migrate] APPLY $version ..."
    run_file "$MIGRATIONS_DIR/$file"
    run_sql "INSERT INTO schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
    echo "[migrate] DONE  $version"
  fi
done

echo "[migrate] All migrations up to date."
