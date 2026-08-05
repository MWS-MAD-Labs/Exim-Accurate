# Edge Case Hunter Review Prompt

Invoke the `bmad-review-edge-case-hunter` skill on the complete diff from baseline commit `5d9a098` in `/root/repo/Exim-Accurate`.

Review these changed areas: `prisma/schema.prisma`, `prisma/migrations/20260805090000_add_pos_cashier/migration.sql`, `lib/pos.ts`, `lib/pos-server.ts`, `lib/accurate/pos.ts`, `app/api/pos/**`, `app/api/analytics/pos/route.ts`, `app/store/page.tsx`, `app/dashboard/pos/**`, `app/dashboard/analytics/pos/**`, and `components/DashboardLayout.tsx`.

Walk all branching paths and boundaries: concurrent reservations/sales, stock math, reservation expiry/cancellation/pickup, duplicate requests, Decimal/date parsing, malformed input, role and credential ownership, Accurate failures, and UI/API contract mismatches. Report only concrete unhandled edge cases with file and line, consequence, and suggested fix. Distinguish introduced findings from pre-existing issues.
