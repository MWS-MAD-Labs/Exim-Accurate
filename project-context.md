---
project_name: 'Exim Accurate (Exima)'
user_name: 'Faisal'
date: '2026-08-05'
sections_completed: ['technology_stack', 'typescript_javascript', 'nextjs_react', 'testing', 'code_quality_style', 'development_workflow', 'critical_dont_miss']
existing_patterns_found: 12
workflow_status: 'complete'
status: 'complete'
rule_count: 77
optimized_for_llm: true
config_fallback: 'BMad config.yaml was unavailable; output is placed at the project root. Communication and document content are maintained in English.'
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Next.js `16.0.8` (manifest `^16.0.0`) with the App Router, Route Handlers, and Server Actions.
- React and React DOM `19.2.1` (manifest `^19.0.0`).
- TypeScript `5.9.3` (manifest `^5.7.2`), targeting ES2020 with `strict: true`, `moduleResolution: "bundler"`, and the `@/*` import alias mapped to the project root.
- Mantine `7.17.8` (manifest `^7.15.2`) for UI, theming, dates, hooks, modals, and notifications; Tabler Icons use the `^3.23.0` line.
- PostgreSQL through Prisma ORM; `@prisma/client 6.19.2` and Prisma CLI `6.19.0`.
- NextAuth `4.24.13` with the Credentials provider and JWT sessions.
- Zod `3.25.76` for validation, Day.js `1.11.19` for dates, and ExcelJS `4.4.0` for XLSX.
- Recharts `3.7.0` for analytics, html5-qrcode `2.3.8` for scanning, and Zustand `5.0.9` for lightweight client state.
- ESLint `9.39.1` with `eslint-config-next 16.0.8`.
- CI uses Node.js 22; Docker build/runtime uses Node.js 20 Alpine.
- Use `package-lock.json` and `npm ci` for reproducible installs; do not change package managers without an explicit decision.
- Do not align Prisma Client and CLI versions without updating and validating the lockfile, generated client, migrations, and build.

## Critical Implementation Rules

### TypeScript/JavaScript Rules

- Keep `strict: true`; avoid `any`, and use explicit types/interfaces for API payloads, Prisma results, and server/client boundaries.
- Use the `@/…` alias for cross-folder internal imports; use relative imports only for nearby modules.
- Route Handlers must return `NextResponse.json(...)` with an appropriate HTTP status; handle invalid JSON bodies and required inputs before database/API operations.
- Use `async/await` and `try/catch` at external boundaries (database, Accurate API, file parsing); never expose tokens, secrets, or credential details in errors, logs, or responses.
- Validate external input with Zod or existing domain validators before calling Prisma or Accurate.
- Keep runtime boundaries explicit: modules importing `crypto`, Prisma, or server secrets must not be reachable from Client Components. Add `"use client"` only when hooks or browser APIs are required.
- Normalize domain invariants on the server, such as borrower emails with `trim().toLowerCase()` and dates through existing helpers.

### Next.js/React Rules

- Use the App Router. Pages/layouts belong in `app/`; APIs belong in `app/api/**/route.ts`; each Route Handler should export only the required HTTP methods.
- Server Components are the default. Use `"use client"` only for React hooks, event handlers, `localStorage`, scanner/camera functionality, or browser APIs.
- Modules using Prisma, `crypto`, environment secrets, or Accurate credentials must remain server-only. Do not import them transitively from a Client Component.
- Protected Route Handlers must call `getServerSession(authOptions)` before reading sensitive body data, querying data, or creating side effects. Return `401` when no session/user exists.
- Scope every private-data query with `session.user.id`. Never use a request-supplied `userId` as an authorization source; request IDs may be used only after ownership is verified.
- Parse and validate request bodies, query parameters, route parameters, and uploads before calling Prisma or Accurate. Use `400` for invalid input, `401` for unauthenticated requests, `403` for forbidden access, `404` for missing resources, and `409` for domain conflicts.
- Do not assume a Prisma transaction can roll back a request sent to Accurate. For cross-system workflows, persist explicit local states such as `pending`, `done`, `error`, or partial status, and surface external failures clearly.
- Avoid cross-user caching for sessions, credentials, analytics, jobs, and Accurate data. If caching or revalidation is introduced, scope keys and invalidation by user/credential and never cache secrets.
- Prevent duplicate mutations in the UI with pending/disabled states. Do not use optimistic updates for external side effects unless rollback and idempotency are defined.
- Access browser APIs only after the Client Component mounts; do not read `localStorage`, camera APIs, or `window` during server rendering. Keep initial server/client values hydration-safe.
- Use `LanguageProvider`/`useLanguage()` for translated UI text. Preserve the existing `MantineProvider`, notifications, modals, theme, and shared UI components.
- When changing upload/import flows, preserve the `10mb` Server Action limit; validate size, MIME/extension, empty files, required headers, and incomplete rows before full parsing.
- Use existing domain helpers/Day.js for dates and keep timezone and formatting rules consistent; do not rely on ambiguous browser date parsing.
- Handle loading, empty, error, and success states explicitly in interactive pages. Never assume an API response is valid or non-null.
- After changing a route or page, check effects on auth layouts/middleware, cache behavior, generated Prisma Client, and Server/Client boundaries.

### Testing Rules

- The standard validation command is `npm test`, which runs ESLint and TypeScript type-checking.
- Run `npx prisma generate` before type-checking or tests that import `@prisma/client`; the `pretype-check` script handles this through `npm test`.
- Existing unit tests use Node's built-in `node:test` runner and `node:assert/strict`; follow this convention for parser and pure-library tests unless a test framework is intentionally introduced.
- Place focused tests next to the implementation using the `*.test.ts` naming convention.
- Prefer unit tests for deterministic logic such as parsing, normalization, validation, date calculations, availability checks, and export transformations.
- Cover malformed external input: missing headers, quoted fields, whitespace, empty rows, incomplete rows, invalid dates, invalid quantities, unsupported types, and unexpected API response shapes.
- Keep external Accurate API calls, database calls, authentication providers, and browser APIs out of pure unit tests; isolate them behind injectable functions or test seams when coverage is needed.
- For Route Handlers, test authentication failures, ownership boundaries, invalid payloads, domain conflicts, external API failures, and successful responses. Do not test only the happy path.
- For Prisma workflows, verify transaction boundaries and state transitions, especially when a local database operation is followed by an external Accurate API operation that cannot be rolled back.
- Avoid tests that depend on a live PostgreSQL database, Accurate credentials, network access, local timezone, or mutable global state unless they are explicit integration tests with controlled fixtures.
- Run focused tests first, then `npm test`; for deployment-impacting changes also run `npm run build`.
- Do not claim tests pass when dependencies are missing, Prisma Client is stale, environment variables are absent, or the command was not actually executed.

### Code Quality & Style Rules

- Follow the existing ESLint setup: `eslint.config.mjs` extends `eslint-config-next`; run `npm run lint` after changes.
- Keep TypeScript strict and resolve type errors rather than suppressing them. Avoid broad `any`, unnecessary non-null assertions, and `eslint-disable` unless the exception is narrow and justified.
- Use double quotes, semicolons, and the formatting style already present in the surrounding file. Do not reformat unrelated code.
- Use PascalCase for React component files and components, camelCase for functions/variables, and lowercase route segments.
- Keep domain code organized by responsibility: `app/` for routes/pages/layouts/API handlers; `components/` for reusable React UI; `lib/accurate/` for Accurate integration; `lib/import/` and `lib/export/` for file processing; `lib/` for shared utilities; `prisma/` for schema/migrations; `types/` for shared declarations.
- Prefer small, focused modules. Reuse existing helpers for Prisma, authentication, date handling, Accurate API access, UI components, and translations instead of duplicating logic.
- Keep API messages and user-facing labels consistent with the language strategy; do not expose raw provider or database errors to users.
- Add comments only for non-obvious constraints, integration behavior, or decisions. Do not restate the code.
- Keep secrets and environment-specific values in environment variables; never hard-code tokens, signature secrets, database credentials, NextAuth secrets, or cron secrets.
- When modifying Prisma schema, create a migration and update generated client usage; do not edit migration history or apply runtime schema patches.
- Preserve Mantine design-system conventions, shared theme tokens, notifications, and reusable UI barrel exports.
- Keep changes surgical. Do not rename files, introduce new abstractions, or alter unrelated behavior unless required.
- Update focused tests and relevant documentation when behavior, API contracts, schema, setup, or deployment changes.

### Development Workflow Rules

- Before implementation, inspect the relevant route, service, schema, component, and existing tests; follow established patterns before introducing new ones.
- Install dependencies with `npm ci` when validating a clean checkout. Run `npx prisma generate` after dependency installation or schema changes.
- The local validation sequence is: focused tests for changed logic, `npm run lint`, `npm run type-check`, and `npm run build` for production/build-impacting changes.
- `npm test` combines linting and type-checking. CI runs `npm ci`, `npx prisma generate`, and `npm test`.
- Do not commit generated build output, secrets, local environment files, or database dumps.
- Prisma migration history is the deployment source of truth. For schema changes, create and review a migration; do not use runtime SQL patches or manually edit `_prisma_migrations`.
- Production containers run `npx prisma migrate deploy` from `entrypoint.sh` before starting Next.js. New environments use normal migration deployment; legacy production databases may require the `prisma migrate resolve` reconciliation documented in `DEPLOYMENT.md`. Organization credential migrations must preserve historical credential-linked records while enforcing one active credential per organization.
- Preserve Docker-compatible behavior: Node.js 20 Alpine, port `5758`, non-root `appuser`, and the existing entrypoint.
- CI/CD runs on pushes to `main`, builds/pushes the Docker image to GHCR, then triggers the Komodo redeploy webhook. Workflow changes require reviewing required secrets and failure behavior.
- Kiosk synchronization uses `Authorization: Bearer <CRON_SECRET>` and retries failed requests. Preserve this authentication and retry contract when changing the cron endpoint.
- Do not commit changes or create branches as part of an implementation task unless explicitly requested.
- Keep commits and pull requests focused; include migration, environment-variable, API-contract, or deployment notes when applicable.
- Never expose secrets in logs, CI output, API responses, screenshots, or error messages.

### Critical Don't-Miss Rules

- Never trust a credential ID, user ID, item ID, or job ID from the client until ownership is verified against the authenticated user's organization and, where applicable, the selected Accurate credential.
- Never return `signatureSecret`, `apiToken`, `refreshToken`, `session`, database credentials, or environment secrets to the browser or API response. Select only safe credential fields for list/detail responses.
- Use `getServerSession(authOptions)` consistently for protected routes and preserve the JWT `id`/`role` callbacks when changing authentication.
- Do not log complete request headers, credential objects, access tokens, HMAC signatures, uploaded file contents, or raw sensitive provider responses. Redact identifiers and response bodies in diagnostics.
- Accurate API requests require a resolved host and session, HMAC-SHA256 timestamp/signature headers, and the shared rate limiter. Do not bypass `accurateFetch` or duplicate authentication logic without a documented reason.
- Preserve Accurate API limits of 8 requests per second and 8 concurrent requests. Avoid unbounded `Promise.all` over inventory, item, or validation calls.
- Treat Accurate operations as non-transactional with local PostgreSQL operations. Persist enough status/error data to recover or explain a partial result, and avoid retrying non-idempotent mutations blindly.
- Do not create duplicate borrowing, checkout, import, or export jobs on client retries. Reuse an idempotency key or perform a server-side duplicate check where the workflow supports it.
- Borrowing availability and return quantities are domain constraints: reject overlapping bookings/loans, non-positive quantities, returns beyond borrowed quantities, and dates that violate the feature rules.
- Keep `BorrowableItem` organization-owned. Item codes are unique within an organization, and availability/currently-out calculations must aggregate active borrowing sessions across all current and historical credentials in that organization.
- Every `PosProduct.stock` mutation must insert a `PosStockChange` audit row in the same transaction (manual stock edits, POS sales, preorder pickups, and POS void finalization), capturing previous/new stock, quantity change, source, and the acting user.
- POS sales are permanent audit records: never delete a sale or its line items to cancel it. A void requires an administrator reason, an opposite Accurate `ADJUSTMENT_IN`, explicit `voiding`/`voided` state, and exactly-once local stock restoration. If the Accurate result is uncertain, never retry the external reversal blindly; require an administrator to verify the Accurate reversal ID and use local-only reconciliation.
- Treat uploaded CSV/XLSX files as untrusted input. Enforce the configured size limit, validate headers and rows, reject unsupported formats, and never execute or interpret spreadsheet formulas as application commands.
- Escape or safely encode exported values and user-controlled descriptions to avoid CSV/XLSX formula injection and unsafe HTML rendering.
- Preserve bilingual UI behavior (`id` and `en`) when adding visible text, including errors, empty states, navigation labels, and notifications.
- Handle timezone boundaries explicitly for date-range exports, bookings, borrowing durations, daily kiosk sync, and analytics aggregation; do not compare date strings from different zones without normalization.
- Preserve cron protection and retry semantics for kiosk sync. A request without the expected `CRON_SECRET` must not trigger synchronization.
- Prefer explicit, recoverable error states over silently swallowing failures. Borrowing returns are committed locally and synchronized through the organization's current active credential; Accurate failures must return a visible pending-reconciliation status.
- Do not weaken validation, remove authorization checks, disable lint/type checks, or delete tests merely to make a change pass.

---

## Usage Guidelines

### For AI Agents

- Read this file before implementing code.
- Follow all applicable rules; when uncertain, choose the more restrictive safe behavior.
- Inspect the relevant existing files and tests before introducing new patterns.
- Update this document when a durable project convention or integration constraint changes.

### For Humans

- Keep this file focused on project-specific rules that agents may otherwise miss.
- Update the technology versions and rules when architecture, dependencies, deployment, or domain behavior changes.
- Review periodically for stale, duplicated, or overly obvious guidance.

_Last updated: 2026-09-02_
