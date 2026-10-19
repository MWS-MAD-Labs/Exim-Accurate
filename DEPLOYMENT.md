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
# The public address of Exima, without a port. Redirect addresses are built from it.
NEXTAUTH_URL=https://your-domain.example

HUB_BASE_URL=https://app.mws.web.id
HUB_SSO_APP_ID=exima
CENTRAL_API_BASE_URL=https://db.mws.web.id/api/internal
CENTRAL_API_TOKEN=token-prefix.secret

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

Never commit `.env` or expose Hub/Central secrets, OAuth secrets, SMTP passwords, tokens, session values, or database credentials in logs. For Google SMTP, use an App Password rather than the account's normal password whenever possible.

Register Exima in Hub with `sso_app_id=exima`, `sso_entry_url=https://your-domain.example/auth/sso`, `sso_logout_url=https://your-domain.example/auth/logout-silent`, and Central entitlement application ID `exima`. Create a dedicated Central API client scoped to `employees:read` and `application_entitlements:read`. Existing Exima users are linked to Central `Person.id` on their first successful Hub login; unknown users are rejected rather than auto-provisioned. Map every Exima organization to the entitlement `organization_id` through `Organization.centralOrganizationId` before enabling login.

For an existing organization, run:

```sh
npm run db:map-central-organization -- <local-organization-id> <central-organization-id>
```

Both Compose stacks include an `allowance-notification-scheduler` service and a `pos-sale-sync-scheduler` service. After the app becomes healthy, the first sidecar calls the protected allowance-notification and POS receipt-retry endpoints hourly, while the sale-sync sidecar retries locally queued Accurate inventory adjustments every minute over the internal Docker network. Allowance notifications only process day -1 and day 0 of each active POS store's cutoff date, and `PosAllowanceNotification` prevents duplicate delivery. Receipt retries claim only pending, failed, stale-processing, or legacy role-disabled sales using at-least-once delivery with sale-level status and claim timeouts to minimize duplicate delivery across retries. Notifications and receipts use branded HTML with plain text included as a mail-client fallback. No external scheduler is required for the standard Compose deployment.

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

The application listens on port `5758` inside its container and is published on `EXIMA_HOST_PORT` (default `5758`). PostgreSQL data is persisted in the `postgres_data` volume. The allowance notification scheduler starts automatically and reads `CRON_SECRET` from the same `.env` file.

Use `compose.prebuilt.yaml` when deploying the prebuilt GHCR image. The app service sets `pull_policy: always`, so every Compose deployment refreshes the mutable `latest` tag before evaluating container replacement:

```sh
docker compose -f compose.prebuilt.yaml up -d
```

## Staging and production

The pipeline (`.github/workflows/ci-cd.yml`) checks every pull request and every push to `staging` and `main`: unit tests, lint, type check, `next build`, and the integration tests against Postgres. A push to `staging` or `main` that passes then sends the permission list to Central, builds the image and calls the Komodo webhook.

| Branch | Image tag | GitHub Environment | Komodo stack |
| --- | --- | --- | --- |
| `main` | `latest` | `production` | production |
| `staging` | `staging` | `staging` | staging |

Each GitHub Environment holds its own `CENTRAL_API_BASE_URL`, `CENTRAL_API_TOKEN`, `KOMODO_WEBHOOK_URL` and `KOMODO_WEBHOOK_SECRET`. Without Environments the same values go in the repository secrets or variables with `STAGING_` or `PRODUCTION_` in front (`STAGING_CENTRAL_API_BASE_URL`, `STAGING_CENTRAL_API_TOKEN`, `STAGING_CENTRAL_ORGANIZATION_ID`), and the job reads those first for its branch. The Komodo webhook of staging is `KOMODO_WEBHOOK_URL_STAGING` and `KOMODO_WEBHOOK_SECRET_STAGING`. The address and the Organization ID can be variables or secrets, the token and the webhook values are secrets. The permission job checks that the address starts with `https://` and ends with `/api/internal` before it calls Central. The staging stack sets `EXIMA_IMAGE_TAG=staging` so `compose.prebuilt.yaml` pulls the staging image; the production stack leaves it unset and gets `latest`.

### First deploy to staging

Do these in order. Exima only reads the Hub session, so the Hub and Central have to be ready first.

1. **Central staging.** Run `bunx prisma migrate deploy`, deploy the version that has Shared Hub Session, and set Exima to Shared Hub Session in the application settings. Make sure Exima has its roles and groups, otherwise everyone gets a 403. Put your email in `PROTECTED_SUPER_ADMIN_EMAILS`.
2. **Hub staging.** Deploy the version with the shared session (it adds the `refresh_tokens` and `sso_exchange_seen` tables) and set `HUB_COOKIE_DOMAIN` to the parent domain. Exima staging must be a subdomain of that domain, or the `hub_at` cookie never reaches it.
3. **GitHub.** Create the `staging` branch from the branch that has this work (`main` still has next-auth). Create the `staging` and `production` Environments with `CENTRAL_API_BASE_URL`, `CENTRAL_API_TOKEN`, `KOMODO_WEBHOOK_URL` and `KOMODO_WEBHOOK_SECRET`. Move the production values that are repository secrets into `production`, or the next `main` deploy fails when it sends the permission list.
4. **Komodo staging.** Use `compose.prebuilt.yaml` with `EXIMA_IMAGE_TAG=staging`. The app needs `DATABASE_URL`, `NEXTAUTH_URL` (the staging address, still used to build redirect addresses), `HUB_BASE_URL`, `HUB_SSO_APP_ID=exima`, `CENTRAL_API_BASE_URL`, `CENTRAL_API_TOKEN`, `CENTRAL_ORGANIZATION_ID`, `CRON_SECRET` and the Accurate values. `NEXTAUTH_SECRET`, `EXIMA_CENTRAL_ACCESS_MODE` and `HUB_INTERNAL_SECRET` are no longer read.
5. **Push `staging`** and watch the run: checks, integration, send permissions, build and push, redeploy.
6. **Try it by hand.** Open Exima from the Hub card. Press Back to Hub. Sign out of the Hub and check that Exima asks to sign in again. Sign in with an account that has no access and check the "no access" page. Make one POS sale and one kiosk loan.

Things to know before production:

- The migrations on this branch include `20260928090000_add_central_identity_and_scope_kiosk`, which deletes the rows of `KioskSyncData` (the cron fills them again) and drops its `userId` column. Back up the database first.
- Every old session ends on the first deploy, because next-auth is gone. Everyone signs in through the Hub.
- Routes that change data trust the Hub cookie on the parent domain and do not check `Origin`, so a page on a sibling subdomain could send a request with the cookie. Close this before production.

Run the integration tests locally against a throwaway database, never the development one:

```sh
docker run -d --name exima-testdb -e POSTGRES_PASSWORD=t -e POSTGRES_DB=exima_test -p 5498:5432 postgres:16-alpine
DATABASE_URL="postgresql://postgres:t@localhost:5498/exima_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:t@localhost:5498/exima_test?schema=public" npm run test:integration
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
  app -c 'npm ci --include=dev && npm run db:seed -- admin@example.com central-person-id central-organization-id "Admin Name"'
```

The one-off container inherits the application's `DATABASE_URL`, so the `postgres` hostname resolves on the Compose network. It explicitly sets `NODE_ENV=development` and uses `npm ci --include=dev` to guarantee that the `tsx` seed runner is installed.

For the local-build `compose.local.yaml` deployment, PostgreSQL is published on `127.0.0.1:5434`. A trusted local checkout can instead use:

```sh
npm ci
DATABASE_URL='postgresql://postgres:password@127.0.0.1:5434/exim_accurate?schema=public' \
  npm run db:seed -- admin@example.com central-person-id central-organization-id "Admin Name"
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

Migration `20260902000000_add_pos_sale_void` adds retained POS void audit fields and changes the POS sale creator foreign key from cascade deletion to restricted deletion. After deployment:

- users referenced as a POS cashier or voiding administrator cannot be deleted; change their role or access instead;
- voided sales and their line items remain permanently available for audit;
- the Sales Log can create an Accurate inbound reversal and restore local stock without deleting the original sale.

## Staff Store and Pickup Payment Rollout

Migration `20260923120000_add_reservation_approved_debt` adds a nullable, nonnegative staff-approved resulting debt limit to preorders. Apply it before serving the updated reservation routes; the standard Docker entrypoint applies it automatically with `prisma migrate deploy`.

- Staff choose payment at `/store` checkout. POS pickup displays that saved choice and only allows confirmation or cancellation; the API does not accept payment-method overrides.
- Split pickup requires a positive current allowance. If allowance changes after the cashier reviews the payment breakdown, confirmation is rejected until the updated amount is reviewed.
- Debt pickup cannot exceed the resulting debt amount approved at checkout. Existing debt preorders have no recorded approval limit and must be cancelled and recreated; the migration intentionally does not infer consent.
- Legacy Cash/QRIS reservation payloads remain supported. Legacy `preferredPaymentMethod: "allowance"` requests return HTTP 400 with guidance to submit an explicit debt payment and `expectedResultingDebt`.
- The store's History tab includes the authenticated staff member's completed local POS purchases and pickups, including purchases awaiting Accurate synchronization. Voided/voiding sales are excluded; cancelled and expired preorders remain in the Pickup tab.

After rollout, verify balance visibility, paginated purchase history, pickup using each saved payment strategy, cancellation, and rejection of changed split amounts or debt above the approved limit.

## Pre-Deployment Validation

Run:

```sh
npm ci
npm run test:unit
npm run lint
npm run type-check
npm run build
```

After a deploy:

- The webhook only starts the deploy in Komodo. If the stack fails there (a wrong file path, a bad env), the webhook still answered, so the pipeline would be green. The last step of the redeploy job asks `/api/health` of the app which version it runs and waits until it is the commit that was just built. If the old version keeps running, the job turns red and says to read the last update of the stack in Komodo.
- It needs the public address of that endpoint as `STAGING_HEALTH_URL` (and `PRODUCTION_HEALTH_URL` for main), for example `https://exima-stg.mws.web.id/api/health`, as a repository secret or variable. Without it the step only warns, so a first deploy before the domain exists is not blocked.
- Komodo can also tell you about a failed deploy by itself: add an Alerter under Settings, Alerters.

Staging next to production on one host:

- Set `EXIMA_HOST_PORT` to a free port, for example `5759`. Production keeps `5758`. The tunnel or gateway of each hostname points at its own port. The app and its schedulers keep using 5758 inside the stack.
- `NEXTAUTH_URL` and `ACCURATE_REDIRECT_URI` carry the public hostname and no port. Register the same redirect address in the Accurate developer portal. The hostname has to sit under the parent domain of the Hub (`HUB_COOKIE_DOMAIN`), or the Hub cookie never reaches Exima.
- `SMTP_PORT=465` is the port of the Gmail server and stays the same. Give staging its own mailbox and app password, or leave `SMTP_USER` and `SMTP_PASSWORD` empty so staging sends nothing to real people.

Also verify:

- `NEXTAUTH_URL` and `ACCURATE_REDIRECT_URI` use the production HTTPS domain.
- Hub has the Exima SSO entry/logout URLs registered and its JWKS endpoint is reachable from the app container.
- The Hub sets `HUB_COOKIE_DOMAIN` to the parent domain Exima is served under, and the Central API token is active with `employees:read` plus `application_entitlements:read`.
- Every active Exima organization has the correct `centralOrganizationId`, and every provisioned user has a Central entitlement whose role/permissions use Exima's canonical vocabulary.
- Database backups and restore procedures are tested.
- Credential, POS, analytics, self-checkout, and borrowing endpoints remain organization-scoped.
- `CRON_SECRET` protects kiosk synchronization and allowance notification scheduling.
- Reverse proxy request-size and timeout limits support expected import/export volumes.

## Post-Deployment Verification

- Launch Exima from Hub with each provisioned Exima role and verify role-based navigation. Confirm an active Central employee without a local Exima user is rejected.
- Change a Central employee email, sign in again, and confirm the existing Exima user is updated through the stable Central `Person.id` link.
- Sign out from Exima and Hub, then verify the prior Exima session is rejected through back-channel `sessionVersion` revocation.
- Connect Accurate and confirm host/session resolution.
- Reconnect Accurate and confirm no second active credential is created.
- Test inventory export preview and download.
- Validate and run a sample import.
- Configure the POS warehouse and confirm each organization can activate its own store.
- Void a test synced POS sale with a reason; confirm the original sale remains visible, an Accurate `ADJUSTMENT_IN` exists, local stock is restored, and the sale is excluded from totals and allowance usage.
- Confirm a `voiding` test record exposes **Complete reconciliation** and accepts only the verified Accurate reversal ID without creating a second Accurate adjustment.
- Configure the separate Resource Management warehouse and confirm borrowing/return adjustments use it without changing the POS warehouse.
- Test borrowing, booking, availability, return, and historical-loan return flows.
- Confirm an Accurate sync failure reports `pending_reconciliation` without losing the local return.
- Verify cross-organization IDs cannot access credentials, products, analytics, reservations, or borrowing PII.

## POS Void Reconciliation

A transaction can remain `voiding` when the Accurate response is uncertain or when Accurate succeeds but local stock finalization fails. Do not repeat the automatic void request because the external adjustment may already exist.

1. Open the original sale in **Point of Sales → Sales Log** and note its reason and any recorded reversal ID/error.
2. In Accurate, verify the inbound inventory adjustment for the sale ID and warehouse. Create it manually only when you have confirmed that no reversal already exists.
3. In the Sales Log, select **Complete reconciliation** for the `voiding` row.
4. Enter the verified positive Accurate adjustment ID. If Exima already recorded an ID, the entered value must match it.
5. Confirm the sale becomes `voided`, stock is restored once, the stock history contains a `void` entry, and allowance/totals exclude the sale.

If reconciliation reports a missing catalog product, restore the product with the same credential and item code before retrying local finalization. If it reports an allocation conflict, reconcile the local sold allocation before continuing. The reconciliation endpoint is intentionally local-only and never calls Accurate.

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
