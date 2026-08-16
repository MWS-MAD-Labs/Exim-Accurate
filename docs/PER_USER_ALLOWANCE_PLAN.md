# Per-User Staff Allowance Adjustments

## Status

**Implemented.** This document records the delivered behavior, architecture, API surface, operational constraints, and validation for per-user POS allowance adjustments.

The feature provides:

1. Date-specific staff leave/day-off records.
2. Period-scoped positive or negative manual allowance adjustments.
3. Automatic adjustment reset when the allowance period changes.
4. An admin-only dashboard for allowance overview, leave management, adjustment management, and allowance-funded sales history.
5. Automatic enforcement of the adjusted allowance in existing POS checkout and reservation flows.
6. A year-based historical period selector generated from POS cutoff settings and custom period overrides.

## Allowance formula

For a staff member and inclusive allowance period `[startsAt, endsAt]`:

```text
Base Working Days
  = working dates in the period
  - configured public holidays

Effective Days Off
  = unique staff day-off dates in the period
  that fall on configured working days
  and are not configured public holidays

Effective Working Days
  = max(0, Base Working Days - Effective Days Off)

Standard Allowance
  = Effective Working Days × Allowance Per Working Day

Total Allowance
  = max(0, Standard Allowance + Period Manual Adjustment)

Remaining Allowance
  = Total Allowance - Allowance Spent During Period
```

### Invariants

- **Period reset:** adjustments are uniquely keyed by credential, staff email, period start, and period end. A period without an adjustment record uses `0`.
- **Signed remaining balance:** total allowance is clamped to zero, but remaining allowance may be negative so the excess can be repaid at the end of the period.
- **No double deductions:** duplicate leave dates, non-working dates, and public holidays do not reduce allowance more than once.
- **Normalized identity:** staff emails are normalized to lowercase by the API.
- **Period-neutral leave storage:** historical and future leave dates may be recorded. Calculations count only leave that overlaps the requested allowance period and is an eligible working day.

Pure calculation and date-only helpers live in `lib/pos.ts`:

- `countEffectiveDaysOffInPeriod()`
- `calculateStaffAllowanceBreakdown()`
- `dateOnlySchema`
- `parseDateOnly()`

Period resolution and database-backed calculation live in `lib/pos-server.ts`:

- `resolveStaffAllowancePeriod()`
- `getStaffAllowance()`

## Database schema

The implemented Prisma models are in `prisma/schema.prisma`.

### `PosStaffDayOff`

Stores a normalized staff email, date, and optional reason. The unique key on `(credentialId, staffEmail, date)` prevents duplicate leave records.

### `PosStaffAllowanceAdjustment`

Stores one adjustment per staff member and exact allowance period. The amount can be positive or negative. `createdById` is retained for audit attribution. The unique period key also provides the composite lookup index; no duplicate non-unique index is created, avoiding PostgreSQL identifier truncation collisions.

The creator relation intentionally uses `onDelete: Restrict`. A user who created an allowance adjustment cannot be deleted until the audit records are handled explicitly. This preserves accountability instead of silently deleting or detaching the creator identity.

Credential deletion cascades to both allowance models.

### Migration

The migration is:

```text
prisma/migrations/20260813090000_add_pos_staff_allowance_adjustments/migration.sql
```

Deploy it with:

```sh
npm run db:deploy
```

Do not run `prisma migrate dev` in production.

## API

### POS cashier registered-staff lookup

`GET /api/pos/staff`

Roles: `admin`, `cashier`.

Parameters:

- `credentialId` — required UUID for an active POS credential
- `search` — required non-empty staff name or email fragment

The endpoint returns at most eight registered users with role `staff` from the credential's organization. Matching is case-insensitive across name and email. An empty search returns `{ "staff": [] }`, preventing unfiltered staff enumeration. The cashier typeahead debounces requests, supports keyboard and mouse selection, and preserves the registered name when starting checkout. Manual email identification remains supported for staff who have not been registered in the application.

### Current-user/single-user allowance

`GET /api/pos/allowance`

Roles: `admin`, `cashier`.

Parameters:

- `credentialId` — required UUID
- `email` — required staff email
- `periodStart` and `periodEnd` — optional paired `YYYY-MM-DD` values

This endpoint remains available to POS operators because checkout and reservation flows need to verify a single scanned staff member's current balance. Existing callers that omit a period receive the active period.

### Allowance period options

`GET /api/pos/allowance/periods`

Role: `admin` only.

Parameters:

- `credentialId` — required UUID
- `year` — optional year from `2000` through `2100`

The endpoint returns recurring periods generated from the credential's configured `allowanceCutoffDay` together with configured custom period overrides. Periods are grouped by their end year and future periods are excluded. Recurring periods remain available even when they overlap a custom period so historical edge periods are not hidden.

When `year` is omitted, the endpoint resolves the active period with `resolveStaffAllowancePeriod()` and uses that period's end year. This ensures a period such as `23 December 2026 – 22 January 2027` initially opens under year `2027`, including when a custom active period crosses a calendar-year boundary.

Each option includes `startsAt`, `endsAt`, `isCustom`, and `isOngoing`.

### Staff allowance overview

`GET /api/pos/allowance/users`

Role: `admin` only.

Parameters:

- `credentialId` — required UUID
- `search` — optional email/name search
- `periodStart` and `periodEnd` — optional paired `YYYY-MM-DD` values

The staff list contains organization users with role `staff` or `admin`. Stored user names are preferred for display, with identities found in POS sales or reservations retained as a fallback for historical records.

The endpoint avoids per-user N+1 queries. It resolves settings and period once, then batches:

- day-off records with `PosStaffDayOff.findMany()`;
- adjustments with `PosStaffAllowanceAdjustment.findMany()`;
- allowance spending with `PosSale.groupBy()`.

Breakdowns are calculated in memory with `calculateStaffAllowanceBreakdown()`.

### Staff allowance detail

`GET /api/pos/allowance/users/[email]`

Role: `admin` only.

Returns the calculated breakdown plus:

- leave records for the selected period;
- allowance-funded sales and items for the selected period;
- adjustment history and creator identity.

### Add or update days off

`POST /api/pos/allowance/users/[email]/days-off`

Role: `admin` only.

```json
{
  "credentialId": "uuid",
  "dates": ["2026-09-02", "2026-09-03"],
  "reason": "Annual Leave"
}
```

Existing records are updated with the submitted reason. Dates are intentionally not restricted to the active period so planned future leave and historical corrections remain representable.

### Remove a day off

`DELETE /api/pos/allowance/users/[email]/days-off`

Role: `admin` only.

```json
{
  "credentialId": "uuid",
  "date": "2026-09-02"
}
```

### Create or update a period adjustment

`POST /api/pos/allowance/users/[email]/adjustment`

Role: `admin` only.

```json
{
  "credentialId": "uuid",
  "periodStartsAt": "2026-08-23",
  "periodEndsAt": "2026-09-22",
  "amount": 100000,
  "note": "Joined 2026-09-01"
}
```

When an existing adjustment is edited, its original `createdById` is preserved.

## Dashboard

The admin dashboard is available at:

```text
/dashboard/pos/allowance
```

It is linked from the admin Point of Sales navigation and includes:

- credential selection;
- year selection;
- canonical past and ongoing period selection based on the POS cutoff setting and custom overrides;
- automatic selection of the ongoing period, grouped under its end year;
- staff email/name search;
- base days, days off, standard allowance, adjustment, total, spent, and remaining columns;
- per-user remaining allowance KPI and formula breakdown;
- multi-date leave selection and leave removal;
- period-specific manual adjustment and note editing;
- a notice that adjustments reset in subsequent periods;
- allowance-funded sales history.

Mutation controls are admin-only. Concurrent leave deletions are prevented while another mutation is active.

The dashboard does not accept arbitrary allowance date ranges. It requests canonical options from `/api/pos/allowance/periods` and submits the selected period to list/detail endpoints. Period and staff requests are abortable and guarded against stale responses when the credential, year, period, or search changes.

Localization is provided in:

- `lib/translations/en.ts`
- `lib/translations/id.ts`

## Existing POS integration

Existing POS flows call `getStaffAllowance()`, so the adjusted remaining balance is automatically enforced by:

- POS sales paid with allowance;
- staff reservations using allowance;
- reservation pickup using allowance;
- staff catalog allowance display.

The response retains the legacy `total`, `used`, and `remaining` properties in addition to the detailed breakdown, preserving compatibility with existing clients.

## Validation

Implemented unit coverage in `lib/pos.test.ts` includes:

- working-day and public-holiday calculation;
- custom and recurring allowance periods;
- leave deduplication;
- ignoring weekend, holiday, and out-of-period leave;
- positive period adjustments;
- negative adjustment clamping;
- remaining allowance clamping.

Validation performed during implementation:

```sh
npm test
git diff --check
```

Repository-wide ESLint and TypeScript validation pass. ESLint reports seven existing Next.js internal-navigation warnings outside the allowance changes, with no errors.

## Operational notes

- Apply the migration before deploying application code that queries the new models.
- Adjustment creator deletion is intentionally restricted for audit retention.
- Management list/detail data is admin-only because it includes peer leave, adjustment, and spending information.
- The single-user allowance endpoint remains accessible to POS operators for checkout validation.
