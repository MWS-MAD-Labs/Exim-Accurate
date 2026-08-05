# Blind Hunter Review Prompt

Invoke the `bmad-review-adversarial-general` skill on the complete diff from baseline commit `5d9a098` in `/root/repo/Exim-Accurate`.

Review these changed areas: `prisma/schema.prisma`, `prisma/migrations/20260805090000_add_pos_cashier/migration.sql`, `lib/pos.ts`, `lib/pos-server.ts`, `lib/accurate/pos.ts`, `app/api/pos/**`, `app/api/analytics/pos/route.ts`, `app/store/page.tsx`, `app/dashboard/pos/**`, `app/dashboard/analytics/pos/**`, and `components/DashboardLayout.tsx`.

Focus on authorization, ownership, stock integrity, Accurate synchronization, idempotency, secret exposure, and deviations from `implementation-artifacts/spec-pos-cashier-reservations.md`. Report concrete findings with file and line, consequence, and suggested fix. Distinguish introduced findings from pre-existing issues.
