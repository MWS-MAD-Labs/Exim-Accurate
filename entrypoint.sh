#!/bin/sh

set -e

# Says which database was tried, never the password. The usual cause is a DATABASE_URL made for a laptop.
database_hint() {
  target="$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#^[a-z]+://([^@/]*@)?([^/?]*).*#\2#')"
  echo "Could not reach the database at ${target:-an unknown address}. In a Komodo stack the database host is postgres and the port is 5432. Remove DATABASE_URL to use the default."
}

migration_attempt=1
migration_max_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"
migration_retry_delay="${MIGRATION_RETRY_DELAY_SECONDS:-2}"

echo "Applying Prisma migrations..."
until npx prisma migrate deploy; do
  if [ "$migration_attempt" -ge "$migration_max_attempts" ]; then
    echo "Prisma migrations failed after $migration_attempt attempts."
    exit 1
  fi

  if [ "$migration_attempt" -eq 1 ]; then database_hint; fi
  echo "Prisma migration attempt $migration_attempt failed; retrying in ${migration_retry_delay}s..."
  migration_attempt=$((migration_attempt + 1))
  sleep "$migration_retry_delay"
done

echo "Starting application..."
exec "$@"
