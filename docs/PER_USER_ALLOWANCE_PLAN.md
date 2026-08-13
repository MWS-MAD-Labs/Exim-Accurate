# Per-User Staff Allowance Adjustments

## Status

**Implemented.** This document records the delivered behavior, architecture, API surface, operational constraints, and validation for per-user POS allowance adjustments.

The feature provides:

1. Date-specific staff leave/day-off records.
2. Period-scoped positive or negative manual allowance adjustments.
3. Automatic adjustment reset when the allowance period changes.
4. An admin-only dashboard for allowance overview, leave management, adjustment management, and allowance-funded sales history.
5. Automatic enforcement of the adjusted allowance in existing POS checkout and reservation flows.

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
  = max(0, Total Allowance - Allowance Spent During Period)
```

### Invariants

- **Period reset:** adjustments are uniquely keyed by credential, staff email, period start, and period end. A period without an adjustment record uses `0`.
- **Non-negative values:** total and remaining allowance are clamped to zero.
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

### Current-user/single-user allowance

`GET /api/pos/allowance`

Roles: `admin`, `cashier`.

Parameters:

- `credentialId` — required UUID
- `email` — required staff email
- `periodStart` and `periodEnd` — optional paired `YYYY-MM-DD` values

This endpoint remains available to POS operators because checkout and reservation flows need to verify a single scanned staff member's current balance. Existing callers that omit a period receive the active period.

### Staff allowance overview

`GET /api/pos/allowance/users`

Role: `admin` only.

Parameters:

- `credentialId` — required UUID
- `search` — optional email/name search
- `periodStart` and `periodEnd` — optional paired `YYYY-MM-DD` values

The staff seed contains organization users with role `staff`. Identities found in POS sales or reservations are also included, even if they are not current staff accounts.

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
- optional period selection;
- staff email/name search;
- base days, days off, standard allowance, adjustment, total, spent, and remaining columns;
- per-user remaining allowance KPI and formula breakdown;
- multi-date leave selection and leave removal;
- period-specific manual adjustment and note editing;
- a notice that adjustments reset in subsequent periods;
- allowance-funded sales history.

Mutation controls are admin-only. Concurrent leave deletions are prevented while another mutation is active.

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
npx tsx --test lib/pos.test.ts
npx eslint <changed TypeScript files>
npx prisma validate
git diff --check
```

The allowance tests pass `14/14`, focused ESLint passes, and Prisma validation passes.

The repository-wide `npm run type-check` currently remains blocked by an unrelated existing module-resolution error in `app/store/page.tsx` for `qrcode`; no allowance-related TypeScript error was reported after Prisma client generation.

## Operational notes

- Apply the migration before deploying application code that queries the new models.
- Adjustment creator deletion is intentionally restricted for audit retention.
- Management list/detail data is admin-only because it includes peer leave, adjustment, and spending information.
- The single-user allowance endpoint remains accessible to POS operators for checkout validation.
