# POS Split Payment and Allowance Debt Plan

## Status

**Planned.** This document defines the intended product behavior, architecture, migration, API contracts, concurrency controls, reporting semantics, rollout plan, and acceptance criteria for POS split payments and explicit allowance-debt purchases.

No behavior described here is implemented unless another document or the application code says otherwise.

## Purpose

The current POS records exactly one payment method for each sale: `allowance`, `cash`, or `qris`. If a staff member has Rp10,000 of allowance remaining and buys Rp15,000 of goods, selecting allowance records the entire Rp15,000 as allowance usage and leaves a Rp5,000 negative balance.

The updated workflow must let the cashier and staff member explicitly choose between:

1. **Split payment:** use the available Rp10,000 allowance and pay the Rp5,000 remainder with Cash or QRIS.
2. **Allowance debt:** charge the full Rp15,000 to allowance, leaving a Rp5,000 negative balance to be settled under the existing debt workflow.
3. **External-only payment:** pay the full Rp15,000 with Cash or QRIS and leave allowance unchanged.

Allowance debt remains available when the current allowance is zero or already negative, subject to the previous-period debt block and any future configured debt limit.

## Core examples

### Positive allowance smaller than the purchase

```text
Cart total                  Rp15,000
Current allowance           Rp10,000
```

The available choices are:

| Choice | Allowance | Cash/QRIS | Balance after sale |
|---|---:|---:|---:|
| Split payment | Rp10,000 | Rp5,000 | Rp0 |
| Full allowance debt | Rp15,000 | Rp0 | -Rp5,000 |
| Full Cash/QRIS | Rp0 | Rp15,000 | Rp10,000 |

### Zero allowance

```text
Cart total                  Rp15,000
Current allowance                Rp0
```

The available choices are:

| Choice | Allowance | Cash/QRIS | Balance after sale |
|---|---:|---:|---:|
| Allowance debt | Rp15,000 | Rp0 | -Rp15,000 |
| Full Cash/QRIS | Rp0 | Rp15,000 | Rp0 |

A zero allowance produces no meaningful split because the allowance portion would be zero. The UI must therefore offer **Record as allowance debt** or full Cash/QRIS.

### Existing negative current-period balance

```text
Cart total                  Rp15,000
Current allowance           -Rp5,000
```

The available choices are:

| Choice | Allowance | Cash/QRIS | Balance after sale |
|---|---:|---:|---:|
| Additional allowance debt | Rp15,000 | Rp0 | -Rp20,000 |
| Full Cash/QRIS | Rp0 | Rp15,000 | -Rp5,000 |

Split payment is not offered because no positive allowance is available.

## Product rules

### Supported payment strategies

The initial implementation supports:

1. `external_only`
   - Cash only
   - QRIS only
2. `allowance_then_external`
   - Available allowance + Cash remainder
   - Available allowance + QRIS remainder
3. `allowance_debt`
   - Full sale total charged to allowance, including any amount beyond the remaining balance

The initial implementation does not support:

- Cash + QRIS
- Allowance + Cash + QRIS
- An arbitrary manually entered allowance portion during ordinary cashier checkout
- Multiple allocations for the same payment method
- Partial item refunds or partial sale voids
- Automated QRIS-provider verification
- Reserving allowance when a preorder is created

Administrators may need an exact-allocation correction form because they are correcting what was actually collected. That does not make arbitrary allocation entry part of the ordinary cashier workflow.

### Allowance-debt semantics

`allowance_debt` always assigns the **full authoritative sale total** to allowance.

Examples:

```text
Rp15,000 total, Rp10,000 remaining → allowance used Rp15,000 → balance -Rp5,000
Rp15,000 total, Rp0 remaining      → allowance used Rp15,000 → balance -Rp15,000
Rp15,000 total, -Rp5,000 remaining → allowance used Rp15,000 → balance -Rp20,000
```

The system must not represent only the overspend portion as a separate debt payment. The allowance balance formula already expresses the debt correctly:

```text
Remaining Allowance = Total Allowance - Allowance Spent
```

### Debt confirmation

Choosing allowance debt must be explicit. It must not be the accidental result of selecting a generic allowance button.

Before confirmation, display:

- Current allowance balance
- Purchase total
- Amount charged to allowance
- Resulting negative balance
- A warning that the negative balance follows the allowance debt and next-period settlement workflow

Suggested confirmation copy:

```text
Record this purchase as allowance debt?

Purchase total                     Rp15,000
Current allowance                       Rp0
Balance after purchase             -Rp15,000

This amount will become allowance debt and may block future-period
transactions until it is settled.
```

The cashier must perform a deliberate confirmation action. Keyboard submission must not bypass this confirmation.

### Debt limits

The current allowance model has no explicit debt ceiling. The first implementation may preserve that behavior, but the architecture must leave room for a future store-level policy such as:

```text
allowAllowanceDebt       Boolean
maximumAllowanceDebt     Decimal?
requireDebtConfirmation  Boolean
```

Until those settings are introduced:

- Allowance debt is allowed when the staff transaction is otherwise eligible.
- There is no new monetary debt cap.
- The sale total and stock availability remain the practical transaction limits.
- The UI must always warn before increasing debt.

### Previous-period debt block

A staff member with a blocked previous-period debt cannot use split allowance or create more allowance debt.

The current code blocks all staff POS transactions after the configured payday when previous-period debt remains outstanding. The split-payment project must not silently change that policy.

If the product later permits full Cash/QRIS while previous-period debt is blocked, that must be a separate documented policy change applied consistently to:

- Direct cashier checkout
- Staff preorders
- Preorder pickup
- API validation
- User-facing debt messages

### Current-period debt versus previous-period debt

These states are different:

- **Current-period negative balance:** staff may continue using full Cash/QRIS and, when explicitly selected, may add allowance debt.
- **Previous-period blocked debt:** the existing debt settlement/blocking workflow applies.

At period cutoff, a negative current-period balance becomes the relevant previous-period debt under the existing period-resolution rules.

## Data model

The current `PosSale.paymentMethod` string cannot represent a split payment. Payment allocations must become separate records.

### `PosSalePayment`

Add a normalized payment-allocation model:

```prisma
model PosSalePayment {
  id        String   @id @default(uuid())
  saleId    String
  method    String   // allowance, cash, qris
  amount    Decimal  @db.Decimal(14, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sale PosSale @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@unique([saleId, method])
  @@index([saleId])
  @@index([method, createdAt])
}
```

Add to `PosSale`:

```prisma
payments PosSalePayment[]
```

### Sale payment strategy and snapshots

Add fields to `PosSale`:

```prisma
paymentStrategy         String   @default("external_only")
allowancePeriodStartsAt DateTime?
allowancePeriodEndsAt   DateTime?
allowanceBalanceBefore  Decimal? @db.Decimal(14, 2)
allowanceBalanceAfter   Decimal? @db.Decimal(14, 2)
paymentVersion          Int      @default(1)
```

`paymentStrategy` records the staff/cashier's selected intent:

- `external_only`
- `allowance_then_external`
- `allowance_debt`

This distinction matters because an allowance-only allocation can result from either:

- Allowance fully covering the sale under `allowance_then_external`, or
- An explicit `allowance_debt` choice.

The snapshots preserve:

- The allowance period charged by the sale
- The balance immediately before the sale
- The balance immediately after the sale
- Correct receipt content even if email delivery is delayed
- Historical attribution if allowance settings or custom periods later change

### Transitional compatibility fields

Keep these existing fields during migration:

```prisma
paymentMethod String
allowanceUsed Decimal
```

Write them as compatibility projections:

| Payment allocations | `paymentMethod` | `allowanceUsed` |
|---|---|---:|
| Allowance only | `allowance` | Allowance allocation |
| Cash only | `cash` | 0 |
| QRIS only | `qris` | 0 |
| Allowance + Cash | `split` | Allowance allocation |
| Allowance + QRIS | `split` | Allowance allocation |

New accounting and reporting code must use payment rows. It must not infer allocation amounts from `paymentMethod`.

Do not use combination strings such as `allowance_cash`. They create an expanding classification list and cannot support proper per-method aggregation.

### Payment correction audit

Add an immutable audit record for administrator corrections:

```prisma
model PosSalePaymentRevision {
  id               String   @id @default(uuid())
  saleId           String
  changedById      String
  reason           String
  previousStrategy String
  newStrategy      String
  previousPayments Json
  newPayments      Json
  createdAt        DateTime @default(now())

  sale      PosSale @relation(fields: [saleId], references: [id], onDelete: Restrict)
  changedBy User    @relation(fields: [changedById], references: [id], onDelete: Restrict)

  @@index([saleId, createdAt])
  @@index([changedById])
}
```

### Database and application invariants

Enforce the following:

1. Every payment amount is positive.
2. A sale has at most one allocation per method.
3. Payment allocations sum exactly to the authoritative sale-item total.
4. Allowance allocations are allowed only for staff sales with a normalized staff email.
5. `allowance_then_external` cannot allocate more than the verified positive remaining allowance.
6. `allowance_debt` allocates the full sale total to allowance.
7. `external_only` has exactly one Cash or QRIS allocation.
8. `allowance_then_external` has either:
   - Allowance only when allowance covers the total, or
   - Allowance plus exactly one Cash/QRIS remainder.
9. Cash + QRIS and three-way splits are rejected in the initial implementation.
10. Voiding does not delete or mutate the original payment rows.
11. Decimal arithmetic uses `Prisma.Decimal`, never binary floating-point arithmetic.

Cross-table equality between payment totals and item totals cannot be guaranteed by a simple PostgreSQL `CHECK`. It must be validated inside the transaction, optionally backed by a deferred database trigger if strict database enforcement is later required.

## Payment intent API

Ordinary checkout should send payment intent, not a client-authoritative allowance amount.

### Shared schema

Add schemas in `lib/pos.ts` or a dedicated `lib/pos-payments.ts`:

```ts
const externalPaymentMethodSchema = z.enum(["cash", "qris"]);

const paymentIntentSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("external_only"),
    method: externalPaymentMethodSchema,
  }),
  z.object({
    strategy: z.literal("allowance_then_external"),
    remainderMethod: externalPaymentMethodSchema,
    expectedAllowanceAvailable: z.string().optional(),
  }),
  z.object({
    strategy: z.literal("allowance_debt"),
    expectedAllowanceBalance: z.string().optional(),
    debtConfirmed: z.literal(true),
  }),
]);
```

`expectedAllowanceAvailable` and `expectedAllowanceBalance` are conflict-detection values, not authoritative balances.

### Example: split payment

```json
{
  "credentialId": "uuid",
  "idempotencyKey": "transaction-key",
  "buyerType": "staff",
  "staffEmail": "staff@example.com",
  "staffName": "Staff Member",
  "payment": {
    "strategy": "allowance_then_external",
    "remainderMethod": "cash",
    "expectedAllowanceAvailable": "10000.00"
  },
  "items": [
    { "itemCode": "ITEM-1", "quantity": 1 }
  ]
}
```

### Example: zero allowance recorded as debt

```json
{
  "credentialId": "uuid",
  "idempotencyKey": "transaction-key",
  "buyerType": "staff",
  "staffEmail": "staff@example.com",
  "staffName": "Staff Member",
  "payment": {
    "strategy": "allowance_debt",
    "expectedAllowanceBalance": "0.00",
    "debtConfirmed": true
  },
  "items": [
    { "itemCode": "ITEM-1", "quantity": 1 }
  ]
}
```

### Example response

```json
{
  "sale": {
    "id": "uuid",
    "paymentStrategy": "allowance_then_external",
    "payments": [
      { "method": "allowance", "amount": "10000.00" },
      { "method": "cash", "amount": "5000.00" }
    ]
  },
  "totals": {
    "revenue": "15000.00"
  },
  "allowance": {
    "before": "10000.00",
    "used": "10000.00",
    "after": "0.00",
    "periodStartsAt": "2026-08-23T00:00:00.000Z",
    "periodEndsAt": "2026-09-22T00:00:00.000Z"
  },
  "adjustmentNumber": "..."
}
```

An allowance-debt response uses the same structure with `paymentStrategy: "allowance_debt"`, a single allowance allocation equal to the sale total, and a potentially negative `after` balance.

## Allocation rules

Create a shared allocation service that accepts a Prisma client or transaction client.

### External-only

```text
Cash selected → Cash = sale total
QRIS selected → QRIS = sale total
Allowance used = 0
Allowance balance unchanged
```

### Allowance then external

```text
positive available allowance = max(0, current remaining allowance)
allowance amount             = min(sale total, positive available allowance)
external amount              = sale total - allowance amount
```

If allowance covers the sale, store one allowance payment. If allowance is zero or negative, reject this strategy with a structured response that offers `external_only` or `allowance_debt`.

### Allowance debt

```text
allowance amount = sale total
external amount  = 0
balance after    = balance before - sale total
```

This is valid when balance before is positive, zero, or negative, provided previous-period debt does not block the transaction.

## Concurrency safety

Allowance allocation must be calculated atomically. Two cashiers must not independently spend the same positive remaining balance.

### Required transaction sequence

Inside a serializable transaction:

1. Resolve the applicable allowance period.
2. Acquire a transaction-scoped PostgreSQL advisory lock keyed by credential, normalized staff email, and period boundaries.
3. Recalculate entitlement, adjustments, days off, settlements, and allowance-funded sales using the transaction client.
4. Revalidate previous-period debt status.
5. Calculate final payment allocations.
6. Detect whether the displayed allowance or resulting debt changed enough to require cashier reconfirmation.
7. Create the sale and payment rows.
8. Save allowance period and before/after snapshots.
9. Deduct stock and update stock allocations.
10. Commit.

Allowance helpers in `lib/pos-server.ts` must accept `Prisma.TransactionClient`; using the global `prisma` client for the balance check would place it outside the sale transaction.

### Changed-balance conflicts

Do not silently increase the Cash/QRIS remainder or the resulting debt after the cashier has confirmed it.

For split payment:

```json
{
  "code": "ALLOWANCE_CHANGED",
  "error": "Allowance balance changed. Review the updated payment.",
  "allowance": {
    "previouslyDisplayed": "10000.00",
    "currentlyAvailable": "7000.00"
  },
  "proposedPayments": [
    { "method": "allowance", "amount": "7000.00" },
    { "method": "cash", "amount": "8000.00" }
  ]
}
```

For allowance debt:

```json
{
  "code": "ALLOWANCE_DEBT_CHANGED",
  "error": "The resulting allowance debt changed. Review and confirm again.",
  "allowance": {
    "previouslyDisplayed": "0.00",
    "currentBalance": "-5000.00",
    "proposedBalanceAfter": "-20000.00"
  }
}
```

## Direct cashier UX

Primary file: `app/pos-cashier/page.tsx`.

### Payment choice

For a staff sale, show three clear choices instead of three mutually exclusive generic method buttons:

1. **Use allowance and pay the remainder**
2. **Record the full purchase as allowance debt**
3. **Pay the full amount with Cash or QRIS**

Only show the first choice when the verified current allowance is positive and smaller than the cart total. When allowance covers the total, label it **Pay fully with allowance**.

### Split payment example

```text
Total                               Rp15,000
Current allowance                   Rp10,000

[Use allowance first]
Allowance                            Rp10,000
Remaining                             Rp5,000

Pay remaining with:
[Cash F8] [QRIS F9]

[Record full Rp15,000 as allowance debt]
[Pay full Rp15,000 with Cash or QRIS]
```

### Zero allowance example

```text
Total                               Rp15,000
Current allowance                        Rp0

No allowance is currently available.

[Record Rp15,000 as allowance debt]
[Pay Rp15,000 with Cash F8]
[Pay Rp15,000 with QRIS F9]
```

### Negative current-period balance example

```text
Total                               Rp15,000
Current allowance                   -Rp5,000

[Add Rp15,000 to allowance debt]
Resulting balance                  -Rp20,000

[Pay Rp15,000 with Cash F8]
[Pay Rp15,000 with QRIS F9]
```

### Confirmation review

Split payment:

```text
Allowance                            Rp10,000
Cash                                  Rp5,000
────────────────────────────────────────────
Total paid                           Rp15,000
Allowance after purchase                  Rp0
```

Allowance debt:

```text
Allowance debt                       Rp15,000
────────────────────────────────────────────
Total charged                        Rp15,000
Allowance before                          Rp0
Allowance after                     -Rp15,000
```

### Keyboard behavior

Preserve existing shortcuts where practical:

| Shortcut | New behavior |
|---|---|
| `F4` | Open payment screen |
| `F8` | Select Cash as the external-only method or split remainder method |
| `F9` | Select QRIS as the external-only method or split remainder method |
| `F10` | Select/toggle allowance-first mode when positive allowance is available |
| `Alt+D` | Select allowance-debt mode |
| `Ctrl+Enter` | Submit only after required payment and debt confirmations |
| `Escape` | Return to cart |

`F10` must not create debt implicitly. `Alt+D` must open or focus the debt warning; it must not bypass confirmation.

### QRIS confirmation

Until there is provider integration, require a cashier confirmation such as:

```text
[ ] I confirm the QRIS payment was received
```

The UI must not imply automatic provider verification.

### Cash handling

The first release may store only the Cash allocation amount. An optional enhancement can add:

- Cash received
- Change due

If added, those values are tender metadata and do not alter the allocation amount.

### Completion and sync errors

Always show the finalized server allocations.

If the local transaction succeeds but Accurate synchronization fails, display:

```text
Payment and stock were recorded locally.
Accurate synchronization is pending.

Do not collect payment again.
Sale reference: <sale ID>
```

Allowance usage or debt remains committed while the external stock synchronization is repaired.

## Sale API transaction changes

Update `app/api/pos/sales/route.ts`.

After syntax validation and idempotent-record lookup, the endpoint must:

1. Resolve authoritative products and prices.
2. Calculate the sale total.
3. Validate staff identity for allowance strategies.
4. Enter the serializable transaction.
5. Lock and calculate allowance when needed.
6. Validate previous-period debt.
7. Build canonical payment allocations.
8. Require reconfirmation when displayed payment/debt data is stale.
9. Create `PosSale` and `PosSalePayment` records.
10. Save allowance snapshots.
11. Deduct stock and update stock history.
12. Commit locally.
13. Synchronize the stock adjustment with Accurate.

### Allowance consumption and sale status

A locally committed sale must continue consuming allowance even when Accurate synchronization fails:

- `pending_sync`: consumes allowance
- `sync_error`: consumes allowance
- `synced`: consumes allowance
- `voiding`: continues consuming until void finalization
- `voided`: does not consume allowance

Accurate status describes external inventory synchronization, not whether the local payment/debt exists.

## Idempotency

### Canonical request fingerprint

Include:

- Credential/store ID
- Canonical item-code and quantity pairs
- Buyer type
- Normalized staff email
- Payment strategy
- External or remainder method

Do not include:

- Current allowance balance
- Server-calculated split amounts
- Resulting debt amount
- Server-generated timestamps
- Current catalog prices

The same request must return the original committed payment allocation even if allowance, debt, prices, or periods later change.

A request reusing the same idempotency key with a different strategy or remainder method returns `409`.

After basic syntax validation, resolve existing idempotent records before checking mutable business conditions. A valid replay must not fail because debt or allowance changed after the original sale.

## Preorders

Files include:

- `app/store/page.tsx`
- `app/api/pos/reservations/route.ts`
- `app/pos-cashier/page.tsx`
- `app/api/pos/reservations/[id]/pickup/route.ts`

### Reservation intent

A preorder stores payment preference, not final payment allocations:

```text
paymentStrategy: external_only | allowance_then_external | allowance_debt
externalPaymentMethod: cash | qris | null
```

Allowance is not reserved when the preorder is created. It is recalculated at pickup because it may change due to other purchases, adjustments, days off, period cutoffs, or administrator corrections.

### Staff Store choices

When allowance is partially available, show:

- Estimated allowance + Cash/QRIS remainder
- Full allowance debt and estimated resulting balance
- Full Cash/QRIS

When allowance is zero or negative, show:

- Allowance debt
- Full Cash/QRIS

Example:

```text
Estimated payment at pickup
Allowance                            Rp10,000
Cash                                  Rp5,000

Alternative: record full Rp15,000 as allowance debt
Estimated resulting balance          -Rp5,000
```

Clearly state:

```text
The final allowance balance and payment amount will be verified at pickup.
```

### Pickup

At pickup:

1. Fetch reservation and live allowance/debt information.
2. Show the requested strategy.
3. Calculate the current estimate.
4. Allow Cash/QRIS switching where relevant.
5. Require QRIS or debt confirmation.
6. Recalculate and lock allowance inside the pickup transaction.
7. Require review again if the split remainder or resulting debt changed.
8. Save the final sale payment rows and allowance snapshots.

If a reservation crosses an allowance cutoff, the pickup/sale period is authoritative.

## Allowance queries and debt calculations

Update:

- `lib/pos-server.ts`
- `app/api/pos/allowance/route.ts`
- `app/api/pos/allowance/users/route.ts`
- `app/api/pos/allowance/users/[email]/route.ts`
- `lib/pos-allowance-notifications.ts`

Queries must stop relying on:

```ts
paymentMethod: "allowance"
```

Allowance spent becomes the sum of allowance payment allocations in the snapshotted allowance period for non-voided sales.

A split sale contributes only its allowance allocation. An allowance-debt sale contributes its full sale total.

Example allowance history:

```text
Purchase total                       Rp15,000
Payment strategy                     Split payment
Allowance used                       Rp10,000
Other payment                        Cash Rp5,000
Balance after purchase                    Rp0
```

```text
Purchase total                       Rp15,000
Payment strategy                     Allowance debt
Allowance used                       Rp15,000
Balance after purchase              -Rp5,000
```

Cutoff notifications continue to use the resulting balance:

- Positive balance: unused allowance remains
- Zero balance: no notification
- Negative balance: debt notification and next-period rules

## Sales journal and administrator corrections

Files include:

- `app/api/pos/sales/log/route.ts`
- `app/dashboard/pos/sales-log/page.tsx`
- `app/api/pos/sales/[id]/route.ts`

### Journal display

Show strategy and allocations:

```text
Split payment
Allowance Rp10,000 + Cash Rp5,000
```

```text
Allowance debt
Allowance Rp15,000 · Resulting balance -Rp5,000
```

### Filters

A payment-method filter matches any sale containing that method. A split sale appears under both Allowance and Cash/QRIS filters but remains one sale.

Add an optional strategy filter:

- External only
- Allowance then external
- Allowance debt

This allows administrators to distinguish ordinary allowance use from deliberate debt purchases.

### Admin correction API

Prefer:

```text
PATCH /api/pos/sales/:id/payments
```

Example:

```json
{
  "expectedVersion": 2,
  "reason": "Cashier recorded full cash instead of split payment",
  "paymentStrategy": "allowance_then_external",
  "payments": [
    { "method": "allowance", "amount": "10000.00" },
    { "method": "cash", "amount": "5000.00" }
  ]
}
```

The correction transaction must:

1. Lock the sale.
2. Reject stale `expectedVersion`.
3. Reject `voiding` and `voided` sales.
4. Validate allocation sum and supported combinations.
5. Validate allowance eligibility.
6. Lock the original snapshotted staff allowance period.
7. Compute availability excluding the sale's current allowance debit.
8. Validate the corrected split or resulting debt.
9. Require a reason.
10. Save a payment revision.
11. Replace payment rows.
12. Update compatibility fields and allowance snapshots.
13. Increment `paymentVersion`.

Changing a synced sale does not create another Accurate stock adjustment.

## Reporting and analytics

Files include:

- `app/api/pos/sales/log/route.ts`
- `app/dashboard/pos/sales-log/page.tsx`
- `app/api/analytics/pos/route.ts`
- `app/dashboard/analytics/pos/page.tsx`

A split payment divides tender revenue, not sale revenue.

For one Rp15,000 sale paid with Rp10,000 allowance and Rp5,000 Cash:

```text
Total sale revenue                   Rp15,000
Transaction count                           1
Allowance payment amount             Rp10,000
Cash payment amount                   Rp5,000
Sales using allowance                        1
Sales using cash                             1
```

For one Rp15,000 allowance-debt sale:

```text
Total sale revenue                   Rp15,000
Allowance payment amount             Rp15,000
Allowance-debt sale count                    1
```

### Sale-level metrics

Count each sale once for:

- Revenue
- Transaction count
- Units
- Average sale
- Cost
- Profit
- Product analytics

### Payment-level metrics

Aggregate payment rows:

```json
{
  "paymentMethod": "allowance",
  "amount": "10000.00",
  "participatingSales": 1
}
```

Method participation counts are not additive because a split sale participates in more than one method.

### Strategy metrics

Report allowance debt separately from payment method:

```json
{
  "paymentStrategy": "allowance_debt",
  "sales": 4,
  "amount": "60000.00"
}
```

This makes deliberate debt purchases operationally visible without inventing a fourth tender type.

When a payment-method filter is active, distinguish:

- Full value of matching sales
- Amount allocated to the selected method

## Receipts

Update `lib/pos-sale-receipt.ts` and its tests.

### Split receipt

```text
Payment details

Allowance                            Rp10,000
Cash                                  Rp5,000
────────────────────────────────────────────
Total payment                        Rp15,000

Allowance before                     Rp10,000
Allowance used                       Rp10,000
Allowance after                           Rp0
```

### Allowance-debt receipt

```text
Payment details

Allowance debt                       Rp15,000
────────────────────────────────────────────
Total payment                        Rp15,000

Allowance before                          Rp0
Allowance used                       Rp15,000
Allowance after                     -Rp15,000
```

The receipt must explicitly label the strategy as allowance debt when applicable; a generic `Allowance` label is not sufficient.

Use saved before/after snapshots rather than recalculating the balance when the background email runs.

Split payment and allowance debt still produce one receipt and one delivery state per sale.

If an administrator edits a payment after a receipt has been sent, do not silently resend it. Mark it for an explicit corrected-receipt workflow or document that the original receipt remains a checkout-time record.

## Accurate synchronization

`lib/accurate/pos.ts` sends inventory adjustments, not Sales Invoices. Local POS data remains the authoritative financial record.

Recommended Accurate description:

```text
POS Sale <sale-id>
```

A stable description avoids stale tender/debt text after administrator corrections. If payment context remains in the description, format it deterministically and treat it as a checkout-time snapshot:

```text
POS Sale <sale-id> | Allowance 10000.00 + Cash 5000.00
POS Sale <sale-id> | Allowance debt 15000.00
```

Keep `POS Sale <sale-id>` unchanged as the duplicate-detection prefix. Payment edits must never create another stock adjustment.

Retries load the saved sale and payment rows. They must not recalculate allowance, splits, or debt.

## Stock history

Stock-change records should reference the sale rather than use their note as the financial source of truth.

Recommended note:

```text
POS sale <sale-id>
```

The UI can derive current payment context from the related sale:

```text
Sale · Allowance Rp10,000 + Cash Rp5,000
Sale · Allowance debt Rp15,000
```

Existing historical notes remain unchanged.

## Void behavior

A void remains sale-level:

1. Create one Accurate inbound stock adjustment.
2. Restore local stock once.
3. Mark the sale `voided`.
4. Preserve original payment rows and strategy for audit.
5. Exclude all payment allocations from active reports.
6. Release exactly the original allowance allocation.
7. Identify any Cash/QRIS refund that must be handled externally.

Split example:

```json
{
  "allowanceRestored": "10000.00",
  "externalRefundsRequired": [
    { "method": "cash", "amount": "5000.00" }
  ]
}
```

Allowance-debt example:

```json
{
  "allowanceRestored": "15000.00",
  "externalRefundsRequired": []
}
```

The current system does not prove that physical Cash or QRIS was refunded. The UI must not imply that the stock void automatically completed an external refund.

Partial voids and partial refunds remain out of scope.

## Migration strategy

Use an expand/backfill/cutover/contract rollout.

### Phase A: expand

1. Add `PosSalePayment`.
2. Add payment strategy, allowance period, balance snapshots, and payment version.
3. Add payment revision audit.
4. Keep existing fields and behavior operational.

### Phase B: backfill

For every existing sale:

- `allowance`: create one allowance payment using `allowanceUsed` and set strategy to `allowance_debt` only when the saved post-sale state can prove overspending; otherwise use a legacy strategy marker or `allowance_then_external`/allowance-only compatibility classification.
- `cash`: create one Cash payment equal to the sale-item total.
- `qris`: create one QRIS payment equal to the sale-item total.

Historical intent cannot always be reconstructed. A legacy full-allowance sale that ended negative may have been intentional debt or may simply reflect the old all-or-nothing UI. Preserve financial facts and avoid claiming an intent that cannot be proven.

Validate:

```text
payment sum = sum(item quantity × unit price)
allowance payment sum = legacy allowanceUsed
```

Report inconsistent records for review rather than silently rewriting them.

### Phase C: compatibility deployment

- Read payment rows when present.
- Fall back to legacy fields when absent.
- Dual-write normalized and compatibility fields.
- Keep new split/debt selection behind a feature flag.

### Phase D: consumer cutover

Update:

- Allowance calculations
- Debt calculations
- Sales journal
- Analytics
- Receipts
- Stock history
- Accurate descriptions
- Admin corrections
- Void responses

### Phase E: feature enablement

Enable new cashier and preorder strategies only after backfill and reconciliation pass.

Suggested flag:

```text
POS_SPLIT_PAYMENTS_ENABLED=true
```

The flag controls both split payment and the new explicit allowance-debt choice so old and new clients cannot create ambiguous transactions concurrently.

During the compatibility window, legacy `paymentMethod: "allowance"` requests are normalized to `allowance_debt` because the old contract represented full-sale allowance use and could create a negative balance. These legacy requests cannot provide the new explicit confirmation, so journal and strategy metrics may classify them as allowance debt without a new-client confirmation event. Remove legacy request normalization after every sale, preorder, and pickup client sends payment intent, before completing Phase E.

### Rollback warning

After the system accepts a split sale, the current single-method application cannot represent it correctly. Rollback must target a read-compatible version that understands payment rows, or checkout must be disabled during rollback.

## Testing plan

### Unit tests

Add or update tests for:

1. Rp15,000 total with Rp10,000 available and Cash remainder.
2. Rp15,000 total with Rp10,000 available and QRIS remainder.
3. Allowance fully covers the total.
4. Zero allowance with external-only payment.
5. Zero allowance with explicit allowance debt.
6. Negative current-period allowance with additional explicit debt.
7. Positive allowance with full allowance debt selected.
8. Guest allowance or debt request rejection.
9. Blocked previous-period debt rejection.
10. Payment allocations underpay or overpay.
11. Zero or negative payment allocation rejection.
12. Cash + QRIS rejection.
13. Three-way split rejection.
14. Decimal precision.
15. Canonical fingerprint ordering.
16. Debt confirmation is mandatory.
17. Resulting debt is calculated from the latest balance.

### PostgreSQL integration tests

#### Concurrent split purchases

Starting allowance: Rp10,000. Two simultaneous Rp8,000 allowance-first sales must consume no more than Rp10,000 total allowance.

#### Split and debt race

One cashier submits an allowance-first sale while another submits allowance debt for the same staff period. Both final balances and snapshots must serialize correctly.

#### Debt confirmation conflict

If the balance changes from Rp0 to -Rp5,000 while the debt confirmation is open, the server returns the updated resulting debt and requires confirmation again.

#### Idempotent replay

- Same key and intent returns the original allocations and snapshots.
- Later balance changes do not alter the replay.
- Same key with a different strategy returns `409`.

#### Accurate failure

- Sale remains locally committed.
- Payment rows remain recorded.
- Split allowance or debt remains consumed.
- Retry does not recalculate payment.

#### Admin correction

- Allocation sum and strategy are validated.
- Stale version is rejected.
- Audit revision is created.
- Historical period is preserved.
- Correcting to or from debt updates allowance by the correct delta.

#### Void

- Split sale restores only its allowance portion.
- Debt sale restores its full allowance debit.
- Repeated void reconciliation cannot restore allowance twice.
- Payment rows remain auditable.

#### Reporting

- Split sale counts once in total transactions.
- Split tender amounts aggregate correctly.
- Allowance-debt sales are separately identifiable by strategy.
- Revenue and profit are not duplicated.

#### Receipt timing

A later purchase does not change the saved balance shown on an earlier receipt.

#### Migration

- Every historical sale receives the correct payment sum.
- Historical revenue and allowance totals reconcile.
- Ambiguous historical allowance debt is not falsely classified as confirmed intent.

### Frontend tests

Test that:

- Positive partial allowance exposes split, debt, and external-only choices.
- Zero allowance exposes debt and external-only choices.
- Negative current-period allowance exposes additional debt and external-only choices.
- `F10` never creates debt implicitly.
- Debt requires explicit warning confirmation.
- QRIS requires receipt confirmation.
- Changed allowance or debt requires review again.
- Cart changes invalidate prior payment confirmation.
- Completion displays server-finalized allocations and resulting balance.
- Local success with Accurate failure clearly prevents duplicate collection.
- Pickup displays requested versus final strategy and amounts.
- Journal displays and filters split and debt transactions correctly.

## Documentation and translations

Update:

- `README.md`
- `DEPLOYMENT.md`
- `lib/translations/en.ts`
- `lib/translations/id.ts`

New translation concepts include:

- Split payment
- Use allowance first
- Remaining to pay
- Pay remainder with Cash
- Pay remainder with QRIS
- Record as allowance debt
- Add to allowance debt
- Resulting debt balance
- Debt confirmation
- Allowance balance changed
- Debt amount changed
- Review updated payment
- QRIS payment received
- Payment and stock recorded; Accurate sync pending
- Payment correction reason
- External refund required

Use consistent terminology between `Allowance`, `Tunjangan`, `Debt`, and `Utang allowance` across cashier, staff store, journal, receipts, and emails.

## Implementation phases

### Phase 1: domain and schema

- Add payment allocations, strategy, snapshots, version, and revision audit.
- Implement intent validation and allocation helpers.
- Add unit tests.

### Phase 2: migration and compatibility

- Backfill existing sales.
- Add integrity checks.
- Add read fallback and dual writes.
- Keep feature disabled.

### Phase 3: transaction safety

- Refactor allowance calculations for transaction-client use.
- Add per-staff-period locking.
- Make locally committed `sync_error` sales continue consuming allowance.
- Add concurrency tests.

### Phase 4: direct cashier checkout

- Add split, allowance-debt, and external-only UX.
- Preserve safe keyboard shortcuts.
- Add debt confirmation and balance-change conflict handling.
- Update completion and Accurate-error states.

### Phase 5: preorder and pickup

- Store payment preference.
- Recalculate at pickup.
- Add split/debt review and reconfirmation.
- Update pickup idempotency.

### Phase 6: downstream consumers

- Allowance and debt APIs
- Notifications
- Sales journal and filters
- Analytics and payment mix
- Receipts
- Stock history
- Accurate descriptions
- Voids

### Phase 7: administrator corrections

- Allocation editor
- Strategy correction
- Required reason
- Optimistic version check
- Audit history
- Corrected-receipt policy

### Phase 8: production rollout

- Deploy with feature flag off.
- Run migration and backfill reconciliation.
- Verify existing single-method behavior.
- Enable for a test store if practical.
- Test partial allowance split, zero-balance debt, negative-balance additional debt, Cash, QRIS, void, receipt, and sync failure.
- Enable globally.
- Monitor allowance totals, debt totals, payment allocation sums, and synchronization errors.

## Acceptance criteria

The feature is complete when:

1. A Rp15,000 sale with Rp10,000 allowance can record Rp10,000 allowance plus Rp5,000 Cash or QRIS.
2. The same sale can instead be explicitly recorded as Rp15,000 allowance, producing a -Rp5,000 balance.
3. A Rp15,000 sale with zero allowance can be explicitly recorded as Rp15,000 allowance debt, producing a -Rp15,000 balance.
4. A staff member with a negative current-period balance can explicitly add a new purchase to allowance debt when not blocked by previous-period rules.
5. Debt is never created implicitly through the normal allowance-first shortcut.
6. Split and debt confirmations use the latest transaction-locked allowance balance.
7. Concurrent sales cannot overconsume the same positive allowance unnoticed.
8. Each sale remains one transaction with revenue counted once.
9. Payment reporting allocates only the correct amount to each tender.
10. Allowance-debt sales are separately identifiable by payment strategy.
11. Allowance history counts only the allowance allocation for split sales and the full total for debt sales.
12. Receipts show payment allocations, strategy, and saved post-sale allowance balance.
13. Preorder pickup recalculates the final split or debt at pickup time.
14. Idempotent retries return the original payment allocation and debt snapshot.
15. Accurate receives no duplicate stock adjustment and remains inventory-only.
16. A locally committed synchronization error does not release allowance or debt.
17. Voiding a split sale restores only its allowance portion.
18. Voiding an allowance-debt sale restores the full allowance debit.
19. Existing historical sales retain their financial totals after migration.
20. Administrator corrections are validated, versioned, and audited.

## Architectural principle

The sale owns item revenue. Payment rows describe how that revenue was tendered. `paymentStrategy` records whether allowance use was capped to the available balance or deliberately allowed to create debt.

A negative allowance balance is a supported financial state, but creating or increasing it must always be an explicit and auditable choice.
