# Badge flow

How a staff member is recognized at the kiosk and the cashier.

## One person, one signed badge

The badge is a text signed by Exima: `exb1.<Central person id>.<version>.<signature>`. The signature is made with `EXIMA_BADGE_SECRET`, which only the server knows, so typing somebody's email or id into the reader gets nothing. Exima makes the badge itself:

- **My Badge**: the button in the header of the staff store (`/store`) shows the QR of whoever is signed in. Show it on a phone at the kiosk or the cashier. Nothing to print.
- **Printed sheets**: Admin > Badges is a table of everyone who still has access (search, 25, 50 or 100 per page). The badge text is not in the list: **Show badge** opens one person's QR, and **Print** makes a sheet of 24 badges per A4 (QR, name, small email, cut lines) for one person, the ticked rows, or everyone that matches the search (**Select all N that match**). The sheet exists on the page only while printing.
- **Lost or shared badge**: **Reissue** on Admin > Badges raises the person's badge version. Every badge made before it is refused ("Badge sudah dicabut") and the new one shows in My Badge. The version lives in Exima's database, not in Central, so it takes effect at once at the kiosk, the cashier and My Badge.
- **Someone who left**: when Central takes away a person's access, their badge and their card with the email are refused ("Akses staf ini sudah tidak aktif") and they are no longer offered at the cashier, after the next sync (a minute or two).

Because the badge holds the person id and not the email, a new email in Central changes nothing about the badge or the allowance.

## Cards printed before this (the email)

Cards that only hold the email keep working while `EXIMA_LEGACY_EMAIL_BADGES=on` (the default), and only for the email the person has now. Once everyone uses a signed badge, set it to `off`. A plain `pid:` text and a former email are refused.

## The flow

```text
phone (My Badge) or printed card
  -> reader types the text into the "Scan badge" field of the kiosk
  -> POST /api/self-checkout/identify      the server decides who it is
  -> kiosk shows the name from Central and keeps the email the server returned
  -> items are scanned (asks Accurate, needs a real credential)
  -> POST /api/self-checkout/submit        the badge is checked again on the server
  -> CheckoutSession (stock adjustment) with staffPersonId
```

The cashier picks the person from the staff suggestions (`/api/pos/staff`). A signed badge typed or scanned into that box finds its owner. A sale is written by `POST /api/pos/sales`, which looks the person up on the server. Allowance, debt, days off and reminders are kept by `staffPersonId`, never by the email on a card.

A card with an email of someone who joined after the last sync is not refused straight away: Exima asks Central about that one person (once a minute per value) and creates the account when Central says the person has access.

## Try it without an Accurate credential

Identifying a badge does not call Accurate, so it can be checked from the terminal:

```sh
npm run badge:issue -- someone@millennia21.id    # prints their signed badge
npm run badge:check -- "<what the reader types>"  # prints what the server decides
```

Try the badge from `badge:issue`, the same badge with one character changed (refused: unknown), a plain email (accepted only while the legacy switch is on), `pid:<id>` (refused), and after **Reissue** the old badge (refused: revoked). To see a badge as a QR, open the staff store as that person and press **My Badge**, or print from Admin > Badges.

## Setup

1. Put a secret of 16 characters or more in `EXIMA_BADGE_SECRET` (for example `openssl rand -hex 24`). Changing it cancels every badge.
2. Run `npm run db:deploy` (migration `20261009150000_badge_version`).
3. Hand out badges (My Badge or printed sheets), then switch `EXIMA_LEGACY_EMAIL_BADGES=off`.
