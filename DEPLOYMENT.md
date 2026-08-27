# Deployment and Operations

This is the canonical guide for local Docker deployment, production rollout, database migrations, verification, and recovery.

## Prerequisites

- Docker with Docker Compose, or Node.js 22 and PostgreSQL 16
- An Accurate developer application with OAuth credentials
- A public HTTPS URL for production OAuth callbacks

## Required Environment Variables

Copy `.env.example` to `.env` and configure at least:

```env
DATABASE_URL=postgresql://postgres:password@postgres:5432/exim_accurate?schema=public
NEXTAUTH_URL=https://your-domain.example
NEXTAUTH_SECRET=replace-with-a-strong-random-secret

ACCURATE_APP_KEY=...
ACCURATE_SIGNATURE_SECRET=...
ACCURATE_CLIENT_ID=...
ACCURATE_CLIENT_SECRET=...
ACCURATE_REDIRECT_URI=https://your-domain.example/accurate/callback

CRON_SECRET=replace-with-a-strong-random-secret

# Gmail SMTP (use a Google App Password when 2-Step Verification is enabled)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=notifications@example.com
SMTP_PASSWORD=replace-with-google-app-password
SMTP_FROM=Exima Notifications <notifications@example.com>
```

Never commit `.env` or expose OAuth secrets, SMTP passwords, tokens, session values, or database credentials in logs. For Google SMTP, use an App Password rather than the account's normal password whenever possible.

Both Compose stacks include an `allowance-notification-scheduler` service. After the app becomes healthy, this sidecar calls the protected allowance-notification and POS receipt-retry endpoints hourly over the internal Docker network. Allowance notifications only process day -1 and day 0 of each active POS store's cutoff date, and `PosAllowanceNotification` prevents duplicate delivery. Receipt retries claim only pending, failed, stale-processing, or legacy role-disabled sales using at-least-once delivery with sale-level status and claim timeouts to minimize duplicate delivery across retries. Notifications and receipts use branded HTML with plain text included as a mail-client fallback. No external scheduler is required for the standard Compose deployment.

The endpoint returns HTTP 202 immediately while delivery continues in the app container's background lifecycle. To trigger a manual run from outside Docker:

```sh
curl -fsS -H 'Authorization: Bearer replace-with-your-cron-secret' \
  https://your-domain.example/api/cron/pos-allowance-notifications

curl -fsS -H 'Authorization: Bearer replace-with-your-cron-secret' \
  https://your-domain.example/api/cron/pos-sale-receipts
```

The HTTP response confirms that the run was accepted, not that every email was delivered. For allowance notifications, alert on application log entries containing `[pos-allowance-notifications] Background run completed with failures` or `Fatal background run error`. The completed summary separates `zeroBalance`, `alreadyNotified`, `locked`, `failed`, and `storesFailed`; delivery-level failures are also retained in `PosAllowanceNotification` for retry and investigation. For receipts, alert on `[pos-sale-receipt] Scheduled retry completed with failures` or `Fatal scheduled retry error`; delivery state and the latest error are retained on `PosSale`.

## Docker Deployment

Use `compose.local.yaml` to build the application image locally:

```sh
cp .env.example .env
# Edit .env
docker compose -f compose.local.yaml up -d --build
```

The application is exposed on port `5758`. PostgreSQL data is persisted in the `postgres_data` volume. The allowance notification scheduler starts automatically and reads `CRON_SECRET` from the same `.env` file.

Use `compose.prebuilt.yaml` when deploying the prebuilt GHCR image. The app service sets `pull_policy: always`, so every Compose deployment refreshes the mutable `latest` tag before evaluating container replacement:

```sh
docker compose -f compose.prebuilt.yaml up -d
```

The container entrypoint automatically runs `prisma migrate deploy` before starting Next.js. Do not use `prisma db push` in production.

Komodo procedures should run `Sync Stack` followed by `Deploy Stack`. Configure the `exima` stack to use only `compose.prebuilt.yaml`; legacy paths such as `compose.yaml` or `docker-compose.komodo.yml` are not present. The explicit pull policy is required because a normal Compose deploy can otherwise reuse a locally cached `latest` image.

## Initial Administrator

The production image prunes development dependencies, including the `tsx` binary used by the seed script. Do not run `npm run db:seed` with a normal `docker compose exec app` command.

For the prebuilt `compose.prebuilt.yaml` deployment, run a one-off application container on the Compose network. Mount a trusted checkout and use an anonymous `node_modules` volume so `npm ci` can install the seed tool without modifying the production container or requiring a published PostgreSQL port:

```sh
docker compose -f compose.prebuilt.yaml run --rm --no-deps \
  -e NODE_ENV=development \
  --user root \
  -v "$(pwd):/workspace" \
  -v /workspace/node_modules \
  -w /workspace \
  --entrypoint sh \
  app -c 'npm ci --include=dev && npm run db:seed -- admin@example.com secure-password admin'
```

The one-off container inherits the application's `DATABASE_URL`, so the `postgres` hostname resolves on the Compose network. It explicitly sets `NODE_ENV=development` and uses `npm ci --include=dev` to guarantee that the `tsx` seed runner is installed.

For the local-build `compose.local.yaml` deployment, PostgreSQL is published on `127.0.0.1:5434`. A trusted local checkout can instead use:

```sh
npm ci
DATABASE_URL='postgresql://postgres:password@127.0.0.1:5434/exim_accurate?schema=public' \
  npm run db:seed -- admin@example.com secure-password admin
```

Use the actual database credentials from the deployment rather than the example password. The script creates or connects the default organization. Users created later through the admin interface join the current administrator's organization.

## Accurate Connection

1. Sign in as an administrator.
2. Open **Accurate Credentials**.
3. Complete Accurate OAuth.

Credentials are organization-owned. PostgreSQL enforces at most one active Accurate credential per organization. Reconnecting refreshes or replaces the active connection while retaining disconnected records for historical references.

## Existing Production Database Reconciliation

Older production installations may already contain borrowing tables created outside Prisma migration history. Back up the database before reconciliation.

Mark the historical borrowing migrations as applied, then deploy pending migrations:

```sh
npm run db:resolve:borrowing-history
npm run db:deploy
```

Equivalent commands:

```sh
npx prisma migrate resolve --applied 20260216105500_add_borrowing_feature
npx prisma migrate resolve --applied 20260420090000_merge_borrowable_items_across_credentials
npx prisma migrate deploy
```

Migration `20260810100000_centralize_organization_credentials` then:

- creates the organization tenant boundary;
- assigns existing users, credentials, POS settings, and borrowable items to the default organization;
- preserves the newest connected credential and disconnects older active credentials;
- enforces one active Accurate credential and one active POS store per organization;
- changes credential `userId` into optional creator/audit metadata;
- changes borrowing item uniqueness to `(organizationId, itemCode)`.

Historical borrowing sessions remain attached to their original credentials. Availability and outstanding-loan calculations aggregate all credentials in the organization. Returns synchronize through the current active credential; if Accurate is unavailable, the local return succeeds with `pending_reconciliation`.

Fresh databases require no manual reconciliation; normal `prisma migrate deploy` applies the full history.

## Pre-Deployment Validation

Run:

```sh
npm ci
npm run test:unit
npm run lint
npm run type-check
npm run build
```

Also verify:

- `NEXTAUTH_URL` and `ACCURATE_REDIRECT_URI` use the production HTTPS domain.
- Database backups and restore procedures are tested.
- Credential, POS, analytics, self-checkout, and borrowing endpoints remain organization-scoped.
- `CRON_SECRET` protects kiosk synchronization and allowance notification scheduling.
- Reverse proxy request-size and timeout limits support expected import/export volumes.

## Post-Deployment Verification

- Sign in and verify role-based navigation.
- Connect Accurate and confirm host/session resolution.
- Reconnect Accurate and confirm no second active credential is created.
- Test inventory export preview and download.
- Validate and run a sample import.
- Configure the POS warehouse and confirm each organization can activate its own store.
- Configure the separate Resource Management warehouse and confirm borrowing/return adjustments use it without changing the POS warehouse.
- Test borrowing, booking, availability, return, and historical-loan return flows.
- Confirm an Accurate sync failure reports `pending_reconciliation` without losing the local return.
- Verify cross-organization IDs cannot access credentials, products, analytics, reservations, or borrowing PII.

## Operations

The commands below target the prebuilt deployment. Replace `compose.prebuilt.yaml` with `compose.local.yaml` when operating the local-build stack.

```sh
# View logs
docker compose -f compose.prebuilt.yaml logs -f app

# Restart application
docker compose -f compose.prebuilt.yaml restart app

# Stop services
docker compose -f compose.prebuilt.yaml down

# Regenerate Prisma client locally
npm run db:generate

# Open Prisma Studio locally
npm run db:studio
```

Monitor application errors, database growth, Accurate rate-limit failures, migration failures, pending borrowing reconciliation events, and Docker host disk usage.

Komodo depends on its MongoDB container. If the Docker filesystem fills, Mongo may stop and webhook deployments will fail with a database server-selection error. Check capacity with `df -h /var/lib/docker` and `docker system df`. Inactive BuildKit cache can be reclaimed with `docker builder prune -f`; do not prune volumes or active images as a routine deployment step.

## Backup and Rollback

Before deployment:

```sh
pg_dump "$DATABASE_URL" > exim-accurate-backup.sql
```

If a release must be rolled back:

1. Stop writes or place the application in maintenance mode.
2. Restore the matching database backup when the deployed migration is not backward-compatible.
3. Deploy the previous application image.
4. Verify credential connectivity and critical workflows before reopening access.

Do not manually edit `_prisma_migrations`. Use `prisma migrate resolve` only for the documented legacy reconciliation case.

## Troubleshooting

### Accurate connection errors

- Verify the organization has an active credential.
- Check `ACCURATE_CLIENT_ID`, `ACCURATE_CLIENT_SECRET`, callback URL, App Key, and signature secret.
- Reconnect Accurate to refresh tokens and session data.
- Check Accurate's 8 requests/second and 8 concurrent-request limits.

### Borrowing return pending reconciliation

- Confirm the local return is present in the dashboard.
- Restore or reconnect the organization's active Accurate credential.
- Reconcile the missing `ADJUSTMENT_IN` in Accurate.
- Review application logs for the synchronization error.

### Migration startup failure

- Check PostgreSQL connectivity and container health.
- Inspect `docker compose -f compose.prebuilt.yaml logs app`.
- For a legacy database, perform the one-time borrowing migration reconciliation above.
- Restore the pre-deployment backup rather than applying ad hoc schema patches.
