---
title: "POS cashier, warehouse stock, reservations, and sales analytics"
type: feature
created: "2026-08-05"
status: done
review_loop_iteration: 0
baseline_commit: "5d9a098"
context:
  - "/root/repo/Exim-Accurate/project-context.md"
  - "/root/repo/Exim-Accurate/prisma/schema.prisma"
  - "/root/repo/Exim-Accurate/lib/accurate/inventory.ts"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Exima has inventory-adjustment and self-checkout flows but no retail cashier workflow for an internal store. Stock must come from one admin-selected Accurate warehouse, staff must be able to preorder available items for pickup, and management needs reliable sales, restock-cost, and profit reporting.

**Approach:** Add a POS domain with warehouse-scoped product/stock reads, cashier checkout, local reservation holds, pickup confirmation, and retryable Accurate synchronization. Store sale-line selling price and cost snapshots so historical profit remains stable, then expose date-filtered sales and profitability analytics.

## Boundaries & Constraints

**Always:** Authenticate every private route and verify credential ownership; only admins configure a credential's warehouse; one warehouse setting per Accurate credential; active reservations reduce sellable stock without deducting Accurate until pickup checkout; completed sales capture payment method, unit price, unit cost, warehouse, cashier, and sync state; external Accurate calls are non-transactional and must leave recoverable pending/error states; use Zod, strict TypeScript, bilingual UI, existing Mantine/Recharts patterns, and no secret leakage.

**Accounting Integration:** POS explicitly creates an Accurate Inventory Adjustment (`ADJUSTMENT_OUT`) to record stock movement, following the existing self-checkout model. It is not a Sales Invoice: payment, revenue, and margin remain local POS records. Persist the confirmed Accurate adjustment ID; if the result is unknown, expose an actionable reconciliation error and do not blindly retry.

**Never:** Do not permit overselling through concurrent checkout/reservation requests; do not use client-supplied cost or warehouse as authority; do not allow offline checkout merely because a product was previously loaded; do not mutate existing kiosk/borrowing semantics; do not add payment-gateway integration, ecommerce delivery, forecasting, or department analytics in this scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| HAPPY_PATH_SALE | Authenticated cashier, configured warehouse, available items, payment method | Sale is persisted with immutable line snapshots; Accurate sync is attempted; receipt/result shows status | Sale remains `pending_sync` if Accurate fails and is retryable |
| RESERVATION | Authenticated staff, available quantity, future pickup time | Reservation holds quantity and returns reference plus expiry/status | Reject with `409` when available stock is insufficient |
| PICKUP | Active reservation, cashier confirms actual quantities/payment | Reservation becomes picked up; sale is created and hold released/consumed; Accurate sync state is visible | Reject expired/cancelled/already picked-up reservation |
| CANCELLATION_EXPIRY | Active reservation cancelled by owner/admin or past expiry | Hold is released and status becomes cancelled/expired | Idempotent repeat action returns current state |
| INVALID_CONFIG | Credential has no selected warehouse or warehouse no longer exists | POS/reservation operations are unavailable with setup guidance | Return `409`; never default to another warehouse |
| ACCURATE_FAILURE | Accurate timeout/401/validation error during stock or sale sync | No successful checkout is reported; local record keeps `pending`/`error`, safe retry metadata, and user-visible message | Redact provider details; retry only idempotent/read or explicitly safe operations |
| CONCURRENCY | Two requests reserve/sell the last units | Only one succeeds according to a database transaction/locking invariant | Losing request receives `409` with refreshed availability |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add POS settings, product/stock snapshots, reservations, sale headers/lines, and sync states with ownership/indexes.
- `prisma/migrations/<timestamp>_add_pos_cashier/` -- deployment migration for the new schema.
- `lib/accurate/inventory.ts` -- extend typed item, warehouse, stock/cost lookup and adjustment/sales adapter boundaries; preserve `accurateFetch` and rate limits.
- `lib/accurate/pos.ts` -- server-only orchestration for warehouse-scoped availability, cost snapshots, and Accurate sale synchronization.
- `lib/pos.ts` -- pure validation, availability, reservation expiration, totals, and profit calculations; unit-testable without Prisma/network.
- `app/api/pos/settings/route.ts` -- admin-only list/select warehouse for an owned credential.
- `app/api/pos/products/route.ts` -- authenticated warehouse-scoped product search and availability.
- `app/api/pos/reservations/route.ts` -- staff create/list and owner/admin cancel reservations.
- `app/api/pos/reservations/[id]/pickup/route.ts` -- cashier/admin pickup confirmation and sale creation.
- `app/api/pos/sales/route.ts` -- cashier sale creation, payment metadata, idempotency, and sync state.
- `app/api/pos/sales/[id]/retry/route.ts` -- authorized retry of safe pending/error synchronization.
- `app/api/analytics/pos/route.ts` -- authenticated date-range sales, restock cost, gross profit, margin, top items, and trends.
- `app/dashboard/pos/settings/page.tsx` -- admin warehouse configuration UI.
- `app/dashboard/pos/page.tsx` -- cashier cart/checkout UI and pending-sync visibility.
- `app/store/page.tsx` -- staff product browsing and reservation UI.
- `app/dashboard/analytics/pos/page.tsx` -- POS analytics dashboard with date filters and charts.
- `components/pos/*` -- reusable product search, cart, reservation, pickup, and receipt components.
- `components/DashboardLayout.tsx` -- add POS, staff store, and POS analytics navigation where appropriate.
- `lib/translations/en.ts`, `lib/translations/id.ts` -- all new visible labels, errors, statuses, and notifications.
- `lib/pos.test.ts` -- deterministic totals, availability, expiry, concurrency-input, and profit tests.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/20260805090000_add_pos_cashier/` -- add the POS models, status enums/strings, unique idempotency keys, warehouse configuration, immutable money snapshots, and allocation indexes -- preserve user/credential ownership and migration source of truth.
- [x] `lib/accurate/pos.ts` -- implement typed warehouse/product stock/cost reads and an explicit Sales Invoice capability boundary -- keep API calls server-only and rate-limited.
- [x] `lib/pos.ts`, `lib/pos.test.ts` -- implement and test Zod/domain logic for totals, available stock, reservation expiry, payment validation, and profit -- cover malformed, zero/negative, duplicate, and boundary inputs.
- [x] `app/api/pos/settings/route.ts`, `app/dashboard/pos/settings/page.tsx` -- let admins select exactly one warehouse per owned credential and show current configuration -- reject unauthorized or stale warehouse selections.
- [x] `app/api/pos/products/route.ts`, `app/dashboard/pos/page.tsx` -- build warehouse-backed product search, canonical cashier cart, and checkout -- prevent duplicate submits and show loading/empty/error/pending-sync states.
- [x] `app/api/pos/reservations/route.ts`, `app/api/pos/reservations/[id]/pickup/route.ts`, `app/store/page.tsx` -- support staff preorder, atomic availability holds, cancellation/expiry, and cashier pickup confirmation -- enforce lifecycle transitions.
- [x] `app/api/pos/sales/route.ts`, `app/api/pos/sales/[id]/retry/route.ts` -- persist canonical sale snapshots, local allocation consumption, idempotency fingerprints, and explicit Accurate sync errors -- prevent fabricated or duplicate sales.
- [x] `app/api/analytics/pos/route.ts`, `app/dashboard/analytics/pos/page.tsx` -- expose and visualize confirmed revenue, restock cost, gross profit, margin, units sold, top products, and trends -- normalize date ranges and scope all queries.
- [x] `components/DashboardLayout.tsx`, `lib/translations/en.ts`, `lib/translations/id.ts` -- add bilingual navigation and user-facing copy -- preserve existing layout/provider conventions.

**Acceptance Criteria:**
- Given an admin owns an Accurate credential, when they select a valid warehouse, then only that warehouse is used for POS availability, reservation, and sale synchronization.
- Given two users request the final available units concurrently, when both requests commit, then at most one reservation/sale consumes those units and the other receives a conflict response.
- Given a staff member reserves available items, when the reservation is active, then sellable stock reflects the hold and the staff member receives a reference, status, pickup details, and expiry.
- Given a cashier confirms pickup or starts a direct sale, when payment and quantities are valid, then an immutable sale with line price/cost snapshots is created exactly once and its Accurate sync state is visible.
- Given Accurate is unavailable, when checkout is attempted, then the UI does not claim success; the local record is recoverable as pending/error and can be retried without duplication.
- Given completed sales with known cost snapshots, when an authorized user opens POS analytics for a date range, then revenue, restock cost, gross profit, margin, item rankings, payment mix, and trend totals reconcile to sale lines.
- Given a reservation is cancelled, expired, picked up, or already transitioned, when a lifecycle action is repeated, then stock is not released or consumed twice and the current state is returned.
- Given an unauthenticated or non-owner request supplies a credential, warehouse, reservation, or sale ID, when the route runs, then it returns `401`/`403`/`404` without disclosing the record.

## Design Notes

Use separate local reservation holds and completed sales: reservation creation does not create an Accurate document, while pickup/direct sale creates the local sale and allocation state. The cost snapshot is the value used for analytics; if Accurate cannot provide it, do not invent a client value. POS explicitly follows the self-checkout inventory-movement model: it creates an `ADJUSTMENT_OUT` and records the confirmed Accurate adjustment ID. This is not a Sales Invoice, so payment, revenue, and margin remain local POS records. If Accurate does not confirm the adjustment ID, the sale remains `sync_error` and requires reconciliation rather than a blind retry.

## Spec Change Log

- Review finding: client-controlled sale/reservation lines, warehouse-agnostic stock, and unguarded concurrent allocation could corrupt inventory and profit. Amended route schemas, Accurate resolution, and added `PosStockAllocation` with serializable retry/atomic updates. Known-bad state avoided: fabricated prices/costs, overselling, and duplicate holds. KEEP: immutable line snapshots and warehouse-specific settings.
- Product decision: POS explicitly uses the same `ADJUSTMENT_OUT` model as self-checkout for Accurate stock movement. The adjustment is labeled with the local sale ID and is never presented as a Sales Invoice; request fingerprints prevent duplicate local sales and an unconfirmed external write requires manual reconciliation rather than a blind retry.
- Review finding: reservation ownership, expiry, pickup authorization, analytics status filtering, and bilingual UI were incomplete. Derived staff identity from session, released expired holds, allowed admin credential context for pickup, filtered analytics to synced sales, and added translation/provider credential selection. Known-bad state avoided: unauthorized cancellation, stale holds, misleading analytics, and hard-coded UI language. KEEP: existing auth and Mantine patterns.

## Suggested Review Order

**Stock and transaction integrity**

- Canonicalizes product identity, warehouse, and quantities before allocation.
  [`sales/route.ts:15`](../app/api/pos/sales/route.ts#L15)
- Serializes reservation holds and releases expired inventory safely.
  [`pos-server.ts:45`](../lib/pos-server.ts#L45)
- Uses the configured warehouse and rejects unverified Accurate product records.
  [`pos.ts:20`](../lib/accurate/pos.ts#L20)

**Reservation lifecycle and authorization**

- Derives staff identity from the authenticated session and atomically reserves stock.
  [`reservations/route.ts:18`](../app/api/pos/reservations/route.ts#L18)
- Consumes reservation holds exactly once during pickup.
  [`pickup/route.ts:18`](../app/api/pos/reservations/[id]/pickup/route.ts#L18)

**Accounting boundary and analytics**

- Creates an explicit Accurate `ADJUSTMENT_OUT` for each POS sale and stores its confirmed ID; it is not a Sales Invoice.
  [`accurate/pos.ts:41`](../lib/accurate/pos.ts#L41)
- Reports only confirmed synced sales in management totals.
  [`analytics/pos/route.ts:14`](../app/api/analytics/pos/route.ts#L14)

**Schema, UI, and tests**

- Defines immutable sale snapshots and durable stock allocation rows.
  [`schema.prisma:275`](../prisma/schema.prisma#L275)
- Provides bilingual cashier/store/analytics interfaces using owned credentials.
  [`pos/page.tsx:6`](../app/dashboard/pos/page.tsx#L6)
- Covers deterministic profit, availability, and expiry behavior.
  [`pos.test.ts:1`](../lib/pos.test.ts#L1)

## Verification

**Commands:**
- `npm run lint` -- expected: no ESLint errors.
- `npm run type-check` -- expected: Prisma generation and strict TypeScript checks pass.
- `npm test` -- expected: focused domain tests plus lint/type-check pass.
- `npm run build` -- expected: production build completes after migration/client changes.

**Manual checks (if no CLI):**
- Configure a credential warehouse as admin; confirm another user cannot change it.
- Reserve the last unit in two browser sessions; confirm one conflict.
- Pick up, cancel, expire, and retry a reservation; confirm stock and statuses remain consistent.
- Force an Accurate failure; confirm no false success and safe retry behavior.
- Compare analytics totals against stored sale-line snapshots for a known date range.
