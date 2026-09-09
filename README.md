# Exima

Exima extends Accurate Online with inventory adjustment import/export, self-checkout, borrowing, POS, and organization-scoped analytics.

## Core Features

- Inventory adjustment export to CSV, XLSX, and JSON
- CSV/XLSX import with validation and preview
- Accurate OAuth integration with host/session refresh
- Organization-owned credential management
- Self-checkout and kiosk workflows
- Borrowing, booking, return, and availability management
- POS catalog, stock management with barcode scanning and per-product stock history, reservations, sales, sales journal with payment-method breakdown, allowances, checkout receipt emails, cutoff email notifications, registered-staff email suggestions, and Accurate synchronization
- Organization-scoped operational analytics
- Role-based access for admins, resource managers, cashiers, and staff

## Tenant and Credential Model

`Organization` is the application tenant boundary. Users, Accurate credentials, POS settings, analytics data, and borrowing catalogs are authorized through organization ownership.

- Each organization has at most one active Accurate credential by default.
- Reconnecting Accurate refreshes or replaces the active connection.
- Disconnected credentials are retained because historical jobs and borrowing sessions may still reference them.
- Each organization can have one active POS store.
- Borrowable item codes are unique within an organization.
- Borrowing availability includes active loans and bookings across current and historical credentials in the organization.
- Returns are saved locally first and synchronized through the current active credential. Failed synchronization is reported as `pending_reconciliation`.

## Technology

- Next.js 16 and React 19
- TypeScript
- Mantine UI
- PostgreSQL and Prisma
- NextAuth
- Zod
- ExcelJS
- Recharts

## Local Development

### Prerequisites

- Node.js 22+
- npm
- Docker with Docker Compose
- Accurate developer application/OAuth credentials

### Setup

```sh
git clone <repository-url>
cd Exim-Accurate
npm install
cp .env.example .env
```

Configure `.env`, including the database, NextAuth, Accurate OAuth, cron, and Google SMTP values. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the required `SMTP_*` variables and daily allowance-notification cron endpoint.

Start PostgreSQL only:

```sh
docker compose -f compose.local.yaml up -d postgres
```

The development compose file exposes PostgreSQL on `127.0.0.1:5434`, so use the matching local `DATABASE_URL` from `.env.example`.

Apply migrations and create the first administrator:

```sh
npm run db:deploy
npm run db:seed -- admin@example.com password123 admin
```

Start the application:

```sh
npm run dev
```

Open `http://localhost:3000`, sign in, and connect Accurate from **Accurate Credentials**.

For Docker production deployment, migration reconciliation, verification, backup, and rollback procedures, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Common Workflows

### Connect Accurate

1. Sign in as an administrator.
2. Open **Accurate Credentials**.
3. Complete Accurate OAuth.

The connection is shared by authorized users in the organization. Connecting again does not create a second active credential.

### Export Inventory Adjustments

1. Open **Export → Inventory Adjustment**.
2. Select the active organization credential.
3. Choose a date range and format.
4. Preview or download the export.

### Import Inventory Adjustments

Supported CSV/XLSX columns:

| Column | Required | Description |
| --- | --- | --- |
| `itemCode` | Yes | Accurate item code |
| `type` | Yes | `Penambahan` or `Pengurangan` |
| `quantity` | Yes | Positive quantity |
| `unit` | Yes | Accurate unit name |
| `adjustmentDate` | Yes | `YYYY-MM-DD` |
| `referenceNumber` | No | Optional reference |

Validate the file before starting the import.

### POS Sales Log

Administrators can open **Point of Sales → Sales Log** at `/dashboard/pos/sales-log` to review an organization-scoped sales journal.

- The default date range is today and the default period grouping is daily.
- Quick date presets are available for today, the last 7 days, and the last 30 days.
- Sales can be filtered by buyer or cashier, item, payment method, Accurate credential/store, and date range.
- Summary cards show total sales, transaction count, units sold, and average sale for the filtered period.
- Period totals can be grouped daily, weekly, or monthly. Weekly periods start on Monday and all report boundaries use Jakarta time.
- Transaction rows include the buyer, cashier, sold items, payment method, synchronization status, warehouse, and total.
- Administrators can correct a transaction's payment method from the journal. Changing to or from allowance also recalculates the transaction's allowance usage; allowance is only available for staff transactions. If a transaction is already synced, its existing Accurate inventory adjustment keeps the original payment-method note and must be reconciled manually if that external description also needs correction.
- Administrators can void a fully synced transaction only after entering a reason. Voiding never deletes the sale or its line items: Exima creates a separate Accurate `ADJUSTMENT_IN`, restores local stock and sold allocation once, records the administrator/reason/time/reversal ID, releases any allowance consumed by the sale, and keeps the original financial metadata for audit.
- Voided transactions remain in the journal with their audit details but are excluded from sales totals, payment mix, analytics revenue, and staff allowance usage. Payment editing and normal Accurate retry actions are disabled once voiding begins.
- If the Accurate reversal result is uncertain or local finalization fails, the transaction remains `voiding` and appears as **Needs reconciliation**. Verify the inbound adjustment in Accurate, open **Complete reconciliation** in the journal, and enter its verified Accurate ID. This recovery action never sends another Accurate adjustment and restores local stock at most once.
- The journal displays the latest 500 matching transactions. Summary cards and grouped totals still include every matching non-voided transaction.
- A payment method mix chart splits the filtered sales value across allowance, cash, and QRIS, with per-method transaction counts.

The supporting `GET /api/pos/sales/log` endpoint requires an administrator session, scopes every query through the administrator's organization, validates a maximum date range of 366 days, and rejects malformed filter values.

### POS Stock Management

Administrators can open **Point of Sales → Stock Management** at `/dashboard/pos` to manage the local POS catalog.

- The **Scan product** action accepts USB/Bluetooth scanner input, a typed code, or the device camera. A known code opens a quick stock update dialog; an unknown code offers to create the product with that barcode.
- Every product row links to a stock history modal showing the latest 200 recorded changes with the source (manual change or sale with payment method), before/change/after quantities, and the acting user.
- Stock changes are written in the same transaction as the stock mutation for manual edits, POS sales, and preorder pickups.

The supporting `GET /api/pos/products/manage/history` endpoint requires an administrator session and scopes products through the administrator's organization.

### POS Cashier Staff Identification

1. Sign in as an administrator or cashier and open `/pos-cashier`.
2. In the staff email field, type part of a registered staff member's name or email.
3. Select a suggestion with the mouse or use `↑`/`↓` and `Enter`.
4. Continue checkout with the registered name and normalized email. Manual email entry remains available when no registered staff suggestion matches.

Suggestions are limited to users with the `staff` role in the selected POS credential's organization. The typeahead requires a non-empty search term and returns at most eight results.

### POS Cashier Previous-Period Debt Payments

When a new allowance period starts, identifying a staff member with an outstanding negative balance from the previous period opens a debt-payment prompt in POS Cashier immediately, even before the configured staff salary payday.

- Before and through payday, the cashier can confirm that the full payment was received, let the staff member continue and pay later, or select another user.
- After payday, the outstanding debt blocks staff POS transactions until the cashier confirms payment.
- Confirmed payments are recorded as allowance debt settlements for the previous period and immediately clear the block when fully paid.
- If another cashier or administrator records a payment while the prompt is open, POS Cashier refreshes the current debt status. A concurrent full payment continues checkout as already paid, while a partial payment updates the amount still due.
- If the allowance period changes while the prompt is open, POS Cashier refreshes the applicable previous-period debt before allowing checkout or accepting payment.

### POS Checkout Receipt Emails

After a staff cashier sale or preorder pickup is confirmed in Accurate, Exima sends a branded Millennia Mart receipt when the recorded email belongs to any registered user in the POS organization. Receipt eligibility intentionally matches the cashier lookup and allowance flow, regardless of application role. The receipt includes purchased items, payment method, total payment, and the current remaining allowance balance. Delivery runs after the HTTP response and cannot fail the checkout; sale-level status fields provide at-least-once delivery and minimize duplicate attempts across retries.

Administrators can inspect failed or stale deliveries with `GET /api/pos/sales/receipts?credentialId=...` and trigger a bounded background retry with `POST /api/pos/sales/receipts` using `{ "credentialId": "...", "limit": 50 }`. The retry also recovers deliveries disabled by the former staff-role-only eligibility rule while leaving genuinely unregistered recipients disabled.

### POS Allowance Email Notifications

Configure the Google SMTP `SMTP_*` variables and `CRON_SECRET` documented in [`DEPLOYMENT.md`](DEPLOYMENT.md). The Compose stacks automatically start an internal scheduler that calls `GET /api/cron/pos-allowance-notifications` hourly; no external scheduler is required. The endpoint returns `202`, processes notifications in the background, and sends the current branded HTML email design (with plain text only as a mail-client fallback).

On cutoff day -1 and cutoff day 0, allowance holders receive scenario-specific messages:

- Negative balance: the outstanding debt amount and a warning that allowance transactions are blocked next period until payment.
- Positive balance: the remaining amount and a warning that unused allowance expires after cutoff.
- Zero balance: no notification.

Delivery attempts are recorded in `PosAllowanceNotification` to prevent duplicates and retry failures safely. Monitor application logs for `[pos-allowance-notifications]` completion or failure messages.

### Borrowing Returns

Historical loans remain returnable after their original credential is disconnected. The return is recorded locally and Accurate synchronization uses the organization's current active credential.

If synchronization cannot complete, the kiosk shows a reconciliation warning. Reconnect Accurate and reconcile the missing `ADJUSTMENT_IN`.

## Development Commands

```sh
npm run dev          # Start Next.js development server
npm run lint         # Run ESLint
npm run type-check   # Generate Prisma client and run TypeScript checks
npm run test:unit    # Run Node.js unit tests through tsx
npm test             # Run unit tests, lint, and type checks
npm run build        # Create production build
npm run start        # Start production server

npm run db:generate  # Generate Prisma client
npm run db:migrate   # Create/apply development migration
npm run db:deploy    # Apply existing migrations
npm run db:studio    # Open Prisma Studio
npm run db:seed -- admin@example.com password123 admin
```

## Database Model Highlights

- `Organization`: tenant boundary
- `User`: authentication, role, and organization membership
- `AccurateCredentials`: organization-owned OAuth/API connection; one active row per organization
- `PosSettings`: organization-scoped store and allowance configuration
- `BorrowableItem`: organization-scoped borrowing catalog
- `BorrowingSession` and `BorrowingActivity`: historical borrowing records linked to their original credential
- `CheckoutSession`: self-checkout history
- `PosReservation`, `PosSale`, `PosProduct`, and `PosStockChange`: retained POS operations, void/reconciliation audit metadata, and the stock change audit log
- `ExportJob` and `ImportJob`: import/export audit records

Refer to `prisma/schema.prisma` and migration files for the authoritative schema.

## Security Rules

- Always authorize client-provided IDs through the authenticated user's organization.
- Never expose Accurate secrets, tokens, session values, or database credentials to clients or logs.
- Preserve Accurate's limit of 8 requests per second and 8 concurrent requests.
- Treat Accurate writes as non-transactional with local PostgreSQL writes and retain recoverable synchronization status. Never blindly retry an uncertain POS void reversal; verify it in Accurate and use the reconciliation action with the confirmed reversal ID.
- Treat uploaded spreadsheet files as untrusted input.

Additional engineering constraints are documented in [`project-context.md`](project-context.md).

## Troubleshooting

### Database connection

- Confirm PostgreSQL is healthy: `docker compose -f compose.local.yaml ps`.
- Verify `DATABASE_URL` and the local port.
- Regenerate Prisma Client with `npm run db:generate` after schema changes.

### Accurate connection

- Verify the organization has an active credential.
- Check OAuth client ID, client secret, redirect URI, App Key, and signature secret.
- Reconnect Accurate to refresh tokens and session data.

### Borrowing return reconciliation

- Confirm the local return appears in the dashboard.
- Restore the organization's active Accurate connection.
- Reconcile the missing `ADJUSTMENT_IN` and review application logs.

## License

MIT
