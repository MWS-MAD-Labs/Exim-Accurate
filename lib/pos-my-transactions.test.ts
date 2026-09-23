import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";
import { z } from "zod";
import { canUseStaffStore } from "./access-control";

// Execute the actual route with isolated auth/database modules, without opening a database connection.
const source = ts.transpileModule(readFileSync(new URL("../app/api/pos/my-transactions/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(options: { user?: Record<string, unknown> | null; organizationId?: string | null; sales?: unknown[] } = {}) {
  const queries: Prisma.PosSaleFindManyArgs[] = [];
  const organizationUsers: string[] = [];
  const user = options.user === undefined ? { id: "staff-user", email: "  STAFF@Example.com ", role: "staff" } : options.user;
  const modules: Record<string, unknown> = {
    "@prisma/client": { Prisma },
    "next-auth": { getServerSession: async () => user ? { user } : null },
    "next/server": { NextResponse },
    zod: { z },
    "@/lib/access-control": { canUseStaffStore },
    "@/lib/auth": { authOptions: {} },
    "@/lib/organization": { getOrganizationIdForUser: async (id: string) => {
      organizationUsers.push(id);
      return options.organizationId === undefined ? "organization-1" : options.organizationId;
    } },
    "@/lib/prisma": { prisma: { posSale: { findMany: async (query: Prisma.PosSaleFindManyArgs) => {
      queries.push(query);
      return options.sales ?? [];
    } } } },
  };
  const exports: { GET?: (req: NextRequest) => Promise<Response> } = {};
  runInNewContext(source, { exports, require: (name: string) => {
    assert.ok(name in modules, `Unexpected module: ${name}`);
    return modules[name];
  }, Buffer, URL });
  return {
    queries,
    organizationUsers,
    get: (query = "") => exports.GET!(new NextRequest(`http://localhost/api/pos/my-transactions${query}`)),
  };
}

function sale(index = 1) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    createdAt: new Date("2026-09-23T10:00:00.000Z"),
    warehouseName: "Store",
    reservation: null as { reference: string } | null,
    status: "pending_sync",
    paymentMethod: "split",
    payments: [{ method: "allowance", amount: new Prisma.Decimal("0.10") }, { method: "cash", amount: new Prisma.Decimal("0.20") }],
    allowanceUsed: new Prisma.Decimal("0.10"),
    allowanceBalanceAfter: new Prisma.Decimal("-0.10") as Prisma.Decimal | null,
    items: [{ id: "item-1", itemName: "Tea", itemCode: "TEA", quantity: 3, unitPrice: new Prisma.Decimal("0.10"), unitCost: "SECRET" }],
    syncError: "SECRET",
    credential: { apiToken: "SECRET" },
  };
}

// Cross-realm query objects are normalized before structural comparisons.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("authentication, staff-store roles, and organization membership fail closed", async () => {
  for (const user of [null, { id: "u", role: "staff" }, { id: "u", email: "  ", role: "staff" }, { email: "staff@example.com", role: "staff" }]) {
    const state = harness({ user });
    assert.equal((await state.get()).status, 401);
    assert.equal(state.queries.length, 0);
  }
  for (const role of ["cashier", "resource", "unknown"]) {
    const state = harness({ user: { id: "u", email: "staff@example.com", role } });
    assert.equal((await state.get()).status, 403);
    assert.equal(state.queries.length, 0);
  }
  const state = harness({ organizationId: null });
  assert.equal((await state.get()).status, 403);
  assert.equal(state.queries.length, 0);
});

test("staff and admins query only their normalized buyer email through the organization credential relation", async () => {
  for (const role of ["staff", "admin"]) {
    const state = harness({ user: { id: "buyer", email: " STAFF@Example.com ", role } });
    const response = await state.get("?limit=20");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { transactions: [], nextCursor: null });
    assert.deepEqual(state.organizationUsers, ["buyer"]);
    assert.deepEqual(plain(state.queries[0].where), {
      staffEmail: "staff@example.com", buyerType: "staff", credential: { organizationId: "organization-1" },
      status: { in: ["pending_sync", "synced", "sync_error"] },
    });
    assert.deepEqual(plain(state.queries[0].orderBy), [{ createdAt: "desc" }, { id: "desc" }]);
    assert.equal(state.queries[0].take, 21);
    const selection = JSON.stringify(state.queries[0].select);
    assert.doesNotMatch(selection, /unitCost|apiToken|syncError|staffEmail|requestFingerprint/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
});

test("exact public DTO covers walk-ins, pickups, queued/failed sync and decimal money", async () => {
  const pickup = { ...sale(2), status: "sync_error", reservation: { reference: "RES-123" }, allowanceBalanceAfter: null };
  const state = harness({ sales: [sale(), pickup, { ...sale(3), status: "synced" }] });
  const body = await (await state.get()).json();
  const expected = {
    id: sale().id, createdAt: "2026-09-23T10:00:00.000Z", warehouseName: "Store", reservationReference: null,
    status: "pending_sync", paymentMethod: "split",
    payments: [{ method: "allowance", amount: "0.10" }, { method: "cash", amount: "0.20" }],
    total: "0.30", allowanceUsed: "0.10", allowanceBalanceAfter: "-0.10",
    items: [{ id: "item-1", itemName: "Tea", itemCode: "TEA", quantity: 3, unitPrice: "0.10" }],
  };
  assert.deepEqual(body, { transactions: [expected, { ...expected, id: pickup.id, status: "sync_error", reservationReference: "RES-123", allowanceBalanceAfter: null }, { ...expected, id: sale(3).id, status: "synced" }], nextCursor: null });
  assert.doesNotMatch(JSON.stringify(body), /SECRET/);
});

test("lookahead pagination emits the last returned tuple and retains security scope on subsequent pages", async () => {
  const sales = Array.from({ length: 21 }, (_, index) => sale(30 - index));
  const state = harness({ sales });
  const body = await (await state.get()).json();
  assert.equal(body.transactions.length, 20);
  assert.deepEqual(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString()), { createdAt: sales[19].createdAt.toISOString(), id: sales[19].id });
  const next = harness({ sales: [sales[20]] });
  const response = await next.get(`?cursor=${body.nextCursor}`);
  assert.deepEqual(plain(next.queries[0].where), {
    staffEmail: "staff@example.com", buyerType: "staff", credential: { organizationId: "organization-1" },
    status: { in: ["pending_sync", "synced", "sync_error"] },
    OR: [{ createdAt: { lt: sales[19].createdAt.toISOString() } }, { createdAt: sales[19].createdAt.toISOString(), id: { lt: sales[19].id } }],
  });
  assert.equal((await response.json()).nextCursor, null);
  const exact = harness({ sales: sales.slice(0, 20) });
  assert.equal((await (await exact.get()).json()).nextCursor, null);
});

test("invalid cursors, arbitrary identity parameters, and unsupported limits are rejected before querying", async () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const query of [
    "?email=other@example.com", "?staffEmail=other@example.com", "?credentialId=other", "?mine=false",
    "?limit=0", "?limit=100", "?limit=20&limit=20", "?cursor=", "?cursor=%%%", "?cursor=e30", "?cursor=a&cursor=b",
    `?cursor=${"a".repeat(513)}`,
    `?cursor=${encode({ createdAt: "invalid", id: sale().id })}`,
    `?cursor=${encode({ createdAt: sale().createdAt.toISOString(), id: "invalid" })}`,
    `?cursor=${encode({ createdAt: sale().createdAt.toISOString(), id: sale().id, email: "other@example.com" })}`,
  ]) {
    const state = harness();
    assert.equal((await state.get(query)).status, 400, query);
    assert.equal(state.queries.length, 0);
  }
});
