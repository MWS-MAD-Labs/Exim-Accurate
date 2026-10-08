# POS purchase flow

What happens when a staff member buys something at the counter, and where the Accurate credential comes into it. You can watch it run without a credential, see the last section.

## The short version

The counter works from Exima's own database. Accurate is only touched before the sale (the admin pulls the item list) and after it (a background worker records the sale). If Accurate is down at lunchtime, the cashier does not notice.

## Once, by an admin

1. Connect Accurate (OAuth). That is the credential. It belongs to the organization.
2. Set up the POS store: warehouse, allowance per working day, cutoff day, payday.
3. Pull the items from Accurate into the local catalog (`PosProduct`: code, name, price, stock).

## At the counter (`/pos-cashier`)

The cashier works from the keyboard: F2 to search an item, F4 to pay, F8, F9 and F10 for the payment options.

```text
1 identify   badge scan or name       -> /api/pos/staff/identify
2 shop       scan items               -> local catalog (/api/pos/products)
3 pay        cash, QRIS, allowance    -> POST /api/pos/sales
4 done       next customer
```

1. **Identify.** The cashier picks guest or staff. For staff the reader types the badge text and presses Enter; the server turns it into one person of the store's organization (signed badge, or the email on an older card while `EXIMA_LEGACY_EMAIL_BADGES` is on). Typing a name still works through the suggestion list. Then Exima reads the person's allowance: daily rate times working days of the period, minus days off, plus or minus adjustments, minus what was already spent. If the previous period ended negative and is unpaid, the cashier has to take that payment first (cash or QRIS) or the sale is refused.
2. **Shop.** Items come from the local catalog. Stock shown is stock minus what preorders are holding.
3. **Pay.** Cash, QRIS, allowance first with the rest in cash or QRIS (split), or all on allowance even if it goes negative (needs a confirmation). The request carries an idempotency key, so a double click makes one sale. In one serializable transaction Exima splits the payment, writes the sale with its items and payments, records the automatic debt payment for a split remainder, takes the stock down and logs the stock change. The sale starts as `pending_sync`.

## After the sale, in the background

| What | Who | Notes |
| --- | --- | --- |
| Record the sale in Accurate | `/api/cron/retry-pos-sales`, called every 60 seconds by the `pos-sale-sync-scheduler` service | An Inventory Adjustment (`ADJUSTMENT_OUT`) with the description `POS Sale <id>`. If one with that description exists it is reused, so a retry never doubles it. Three sales per run, a 5 minute lease, then `synced`. |
| Failed attempt | same worker | `sync_error`, tried again after 10, 20, 40 and then every 60 minutes. |
| Receipt email | right after a sale is recorded, and `/api/cron/pos-sale-receipts` hourly for the ones that failed | Goes to the staff member's current email. |
| Cutoff reminder | `/api/cron/pos-allowance-notifications`, hourly | Remaining allowance or debt, once per person per period. |
| Void | an admin | Stock back, an `ADJUSTMENT_IN` in Accurate, the allowance use comes back. |

Statuses of a sale: `pending_sync`, `synced`, `sync_error`, `voiding`, `voided`.

## Other ways in

- **Preorder.** Staff order from `/store` on their phone, the items are held for a few hours, and they get a QR ticket. At the counter the cashier scans the ticket and the sale is made with the payment already chosen.
- **Kiosk (`/kiosk`).** Not the shop. It is self checkout of inventory and borrowing, and it asks Accurate directly, so it needs a live credential.

## Where the credential is used

Only three places: pulling items, sending sales to Accurate in the background, and the kiosk. Not at the cashier's desk.

## If something is down

| Down | What happens |
| --- | --- |
| Accurate | Sales go on and queue as `pending_sync`. They are recorded later, nothing is lost. |
| Central | People Exima already knows can still buy. A card of someone Exima has never seen cannot be recognized. New sign-ins through Hub fail. |
| Hub | Same, for sign-ins only. |

## Watching it run without a credential

```sh
npm run pos:walkthrough
```

It makes a fake store, two items and a staff member in a database transaction, scans that person's badge, reads the allowance, splits a payment, saves the sale, and prints the entry that would go to Accurate. At the end the transaction is rolled back, so nothing is left behind and nothing is sent anywhere. Run it twice and you get the same story.

To see a real badge: `npm run badge:issue -- someone@millennia21.id` prints it, and `npm run badge:check -- "<text>"` shows what the server decides for it.
