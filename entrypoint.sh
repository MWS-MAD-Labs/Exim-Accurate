#!/bin/sh

set -e

migration_attempt=1
migration_max_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"
migration_retry_delay="${MIGRATION_RETRY_DELAY_SECONDS:-2}"

echo "Applying Prisma migrations..."
until npx prisma migrate deploy; do
  if [ "$migration_attempt" -ge "$migration_max_attempts" ]; then
    echo "Prisma migrations failed after $migration_attempt attempts."
    exit 1
  fi

  echo "Prisma migration attempt $migration_attempt failed; retrying in ${migration_retry_delay}s..."
  migration_attempt=$((migration_attempt + 1))
  sleep "$migration_retry_delay"
done

echo "Starting application..."
exec "$@"
