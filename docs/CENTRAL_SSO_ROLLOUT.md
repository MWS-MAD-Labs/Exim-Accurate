# Central SSO and Entitlement Rollout

Deploy the services in this order. Do not enable the Hub entitlement gate before Central grants and Exima organization mappings exist.

## 1. Central Data Center

1. Deploy migration `20260929000000_add_application_entitlements`.
2. Synchronize API scopes.
3. Re-run `bootstrap-hub-api-client.ts` so Hub receives `application_entitlements:read`.
4. Create one active `exima` entitlement per person. A person may have only one Exima organization.
5. Use only the canonical Exima role/permission bundles enforced by Central.

## 2. Shared Package

1. Release and tag `mws-central-auth` version `0.6.0`.
2. Upgrade Exima from `v0.5.3` after the tag is available.
3. Remove Exima's temporary manual entitlement claim parser after the typed package claim is installed.

## 3. Exima

1. Deploy migrations through `20260929120000_add_entitlement_projection_remove_password`.
2. Put `CENTRAL_ORGANIZATION_ID` from the `.env` block Central gives in Exima's `.env`. The organization is mapped the first time somebody signs in or `users:sync` runs: the only local organization is mapped to it (also when it was mapped to an older id such as `exima`, which is logged), and an empty database gets one called Exima. Only that id is mapped on its own, and only when there is nothing to choose between. With several organizations, map each by hand:

   ```sh
   npm run db:map-central-organization -- <local-organization-id> <central-organization-id>
   ```

3. Bring everyone with access into the local user list:

   ```sh
   npm run users:sync
   ```

   It reads the people Central lists for the `exima` application (`GET /api/internal/application-entitlements`), creates the missing accounts and updates name, email, role and permissions. Anyone Central no longer lists keeps their history but loses their permissions. Central also gives a short key (`GET /api/internal/application-entitlements/version`) that changes only when a name, email, role, permission or member of the app changes. Exima stores the key of the last sync in `CentralSyncState`. The server does this by itself (`instrumentation.ts`, every `EXIMA_AUTO_SYNC_SECONDS`, 60 by default, so it also runs in `npm run dev` and needs no scheduler container); each tick asks Central for the key and reads the whole list only when the key differs, so Central gets one small call a minute and nobody has to press anything. One instance works at a time (a database lock). User Management shows when the last change and the last check happened and, only if the sync is failing, the error and a **Retry Now** button. `GET /api/cron/sync-users` stays for an outside trigger or a manual check; call it with `Authorization: Bearer $CRON_SECRET`. Deploy the migrations `20261008200000_add_central_sync_state` and `20261009090000_central_status_and_sync_run` first. Accounts are also made or refreshed at sign-in. People, roles and permissions cannot be edited in Exima.
4. Verify that every expected user has one active Central Exima entitlement.
5. Confirm Hub and Central environment variables and the Central API scopes.
6. The permission list has to reach Central before a version goes live, and the pipeline enforces it. In `docker-build.yml` the job `sync-permissions` runs `scripts/sync-permissions.ts sync --retries 5 --wait 20` with the secrets `CENTRAL_DATA_API_BASE_URL` and `CENTRAL_DATA_API_TOKEN`; `redeploy` needs it. If Central cannot be reached after the retries, does not have the endpoints yet ("deploy Central first"), refuses the list (it would drop a permission roles still carry), or the secrets are missing, the pipeline fails, no redeploy is triggered and the running version stays as it is. Removals are never confirmed from CI. Deploy order is always Central first (with its migrations and the endpoints for the permission list and the people list), then Exima. While running, the server compares the list again at start and then every minute until it has been sent (`lib/permission-sync.ts`, switch `EXIMA_PERMISSION_SYNC`), as a repair when Central changed later. By hand:

   ```sh
   npm run permissions:check
   npm run permissions:sync
   ```

   `CENTRAL_DATA_API_TOKEN` must belong to the API client with profile `exima` and the `application_permissions:write` scope.

7. Choose how Exima keeps checking people against Central with `EXIMA_CENTRAL_ACCESS_MODE`: `off` (default), `warn` (logs `Exima access would be removed`, nobody is turned away) or `enforce` (a person whose access is removed is signed out within `EXIMA_CENTRAL_ACCESS_CACHE_SECONDS`, 30 by default, and a changed role or permission list reaches the session without a new sign-in). Roll out as `warn`, read the log, then switch to `enforce`. `EXIMA_CENTRAL_ACCESS_BYPASS_EMAILS` lists accounts that always get in. If Central cannot be reached nobody is signed out.

The `<central-organization-id>` in step 2 is the `organization_id` Central gives the `exima` application (`exima` on a fresh setup), not a name of your own.

Roles are made in Central (Application Access > Roles) and can carry any of the permissions in `APP_PERMISSION_DETAILS` (`lib/access-control.ts`). The app checks permissions, never role names, so a new role works as soon as it has the right ones. The role key from Central (`CASHIER_LEAD`) is stored lowercase in the local `role` column (`cashier_lead`).

The local `role` remains a compatibility projection, but Hub/Central entitlement data overwrites it at login. Passwords are nullable for rolling-deployment safety and are no longer accepted by the application.

## 4. MWS Hub

1. Deploy migration `20260929090000_add_entitlement_gated_sso`.
2. Configure Exima SSO URLs and verify state-bound code exchange.
3. Set `SSO_CODE_STORE=postgres` for shared atomic code consumption.
4. Only after grants and mappings are verified, set Exima's Central entitlement application ID to `exima` in the Hub catalog.

## 5. Verification

- An entitled employee reaches the correct Exima organization and role home.
- An employee without entitlement is denied by Hub.
- A mismatched organization ID is rejected by Exima.
- A role or permission bundle outside Central's canonical Exima policy is rejected.
- A reused or state-mismatched SSO code fails and is consumed.
- Hub logout revokes the Exima session.
- Entitlement changes take effect by the next login and no later than the 15-minute Exima session expiry.

## Rollback

- Leave Hub's Exima entitlement application ID unset to disable the gate without removing SSO configuration.
- Exima password hashes remain in the nullable compatibility column during the rollout, but there is no active password provider.
- Do not delete Central entitlement history or Exima actor rows; revoke entitlement access instead.

## 6. Staff identity in POS

Staff are kept by the Central person id (`staffPersonId`, the same value as `User.centralPersonId`). The email on a sale, reservation or allowance record is a label that was true at the time. Balances, debts, days off, adjustments and reminders are worked out per person, so a new email in Central changes nothing about them. Sync (or the next sign-in) stores the old email in `UserEmailHistory`; if the new email already belongs to another account, the account keeps its old one and sync reports it as needing review.

Badges are signed by Exima (`EXIMA_BADGE_SECRET`) and identify the person by the Central id; see [`BADGE_FLOW.md`](BADGE_FLOW.md). Cards that only hold the email keep working while `EXIMA_LEGACY_EMAIL_BADGES=on`.

Deploy steps: take a database backup, run `npm run db:deploy` (migration `20261008230000_staff_person_id` adds `staffPersonId` and fills it from the user list), then `npm run staff:audit`. The audit lists POS rows whose email matches no user with a Central identity; those rows keep working by email but should be looked at. Nothing is dropped: the email-based unique keys stay until the audit is clean.

## 7. What the status of an account means

User Management marks accounts by what Exima can prove as of the last sync. **No Access In Central**: Central knows the person but gives them no access to Exima now. **Unknown In Central**: Central does not know the person, or the account is an older local one without a Central identity. Central only hands over the list of active access, so whether someone was once registered and then removed is not known, and deleting a row in the Central database looks the same as removing the access in the app.

## 8. When Central is down or not deployed yet

| What | Behaviour |
| --- | --- |
| New sign-in through Hub | Fails, with "MWS Hub atau Central sedang tidak dapat dihubungi" (it needs Central). |
| People already signed in | Stay signed in; access checks that cannot reach Central change nothing. |
| Cashier, kiosk, allowance, sales, badges of people Exima already knows | Work: they use Exima's own database. A card of someone Exima has never seen cannot be recognized. |
| People sync | Checks again every minute. After three failed checks User Management shows why ("Central could not be reached", or "Central does not have this yet, deploy Central first") and clears it when Central is back. |
| Permission list | Pending until it can be sent; tried again every minute, error lines start with `[permissions]`. CI blocks the deploy for it. |
