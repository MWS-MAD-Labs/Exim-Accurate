# Exima

Exima extends Accurate Online with inventory adjustment import/export, self-checkout, borrowing, POS, and organization-scoped analytics.

## Core Features

- Inventory adjustment export to CSV, XLSX, and JSON
- CSV/XLSX import with validation and preview
- Accurate OAuth integration with host/session refresh
- Organization-owned credential management
- Self-checkout and kiosk workflows
- Borrowing, booking, return, and availability management
- POS catalog, reservations, sales, allowances, registered-staff email suggestions, and Accurate synchronization
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

Configure `.env`, including the database, NextAuth, Accurate OAuth, and cron values.

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

### POS Cashier Staff Identification

1. Sign in as an administrator or cashier and open `/pos-cashier`.
2. In the staff email field, type part of a registered staff member's name or email.
3. Select a suggestion with the mouse or use `↑`/`↓` and `Enter`.
4. Continue checkout with the registered name and normalized email. Manual email entry remains available when no registered staff suggestion matches.

Suggestions are limited to users with the `staff` role in the selected POS credential's organization. The typeahead requires a non-empty search term and returns at most eight results.

### Borrowing Returns

Historical loans remain returnable after their original credential is disconnected. The return is recorded locally and Accurate synchronization uses the organization's current active credential.

If synchronization cannot complete, the kiosk shows a reconciliation warning. Reconnect Accurate and reconcile the missing `ADJUSTMENT_IN`.

## Development Commands

```sh
npm run dev          # Start Next.js development server
npm run lint         # Run ESLint
npm run type-check   # Generate Prisma client and run TypeScript checks
npm test             # Run lint and type checks
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
- `PosReservation`, `PosSale`, and `PosProduct`: POS operations
- `ExportJob` and `ImportJob`: import/export audit records

Refer to `prisma/schema.prisma` and migration files for the authoritative schema.

## Security Rules

- Always authorize client-provided IDs through the authenticated user's organization.
- Never expose Accurate secrets, tokens, session values, or database credentials to clients or logs.
- Preserve Accurate's limit of 8 requests per second and 8 concurrent requests.
- Treat Accurate writes as non-transactional with local PostgreSQL writes and retain recoverable synchronization status.
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
