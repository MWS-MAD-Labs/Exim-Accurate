// Runs one staff purchase at the counter, from the badge to the entry that would go to Accurate,
// inside a database transaction that is rolled back. No credential and no network: nothing is
// sent to Accurate, nothing is left behind.
//   npm run pos:walkthrough
import { Prisma } from "@prisma/client";
import { issueBadgeToken } from "../lib/badge-token";
import { identifyStaffForCashier } from "../lib/cashier-identify";
import { buildPosSaleAdjustmentPayload } from "../lib/accurate/pos";
import { allocateSalePayment, getOutstandingCurrentAllowanceDebt, getStaffAllowance, reconcileSaleImmediateDebtSettlement } from "../lib/pos-server";
import { prisma } from "../lib/prisma";
import { prismaStaffLookup, resolveBadge } from "../lib/staff-identity";

class Rollback extends Error {}

const rupiah = (value: number | string | Prisma.Decimal) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(Number(value)))}`;
const step = (title: string) => console.log(`\n${title}`);

async function main() {
  process.env.EXIMA_BADGE_SECRET ||= "walkthrough-secret-not-used-anywhere-else";
  const before = await prisma.posSale.count();

  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirstOrThrow();
      const cashier = await tx.user.create({ data: { organizationId: organization.id, email: "walkthrough.cashier@example.test", centralPersonId: "walkthrough-cashier" } });
      const staff = await tx.user.create({
        data: { organizationId: organization.id, email: "ann.walkthrough@example.test", name: "Ann Walkthrough", centralPersonId: "walkthrough-ann", permissions: ["store.use"] },
      });
      const credential = await tx.accurateCredentials.create({
        data: { organizationId: organization.id, appKey: "walkthrough", signatureSecret: "x", apiToken: "x" },
      });
      await tx.posSettings.create({
        data: {
          organizationId: organization.id, userId: cashier.id, credentialId: credential.id,
          warehouseId: 1, warehouseName: "Koperasi", allowancePerWorkingDay: 20000, workingDays: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      const tea = await tx.posProduct.create({ data: { credentialId: credential.id, itemCode: "TEA-01", itemName: "Teh Botol", sellPrice: 5000, buyPrice: 3000, stock: 40 } });
      const rice = await tx.posProduct.create({ data: { credentialId: credential.id, itemCode: "RICE-01", itemName: "Nasi Kotak", sellPrice: 25000, buyPrice: 15000, stock: 10 } });

      step("1. The catalog was pulled from Accurate earlier and lives in Exima's own database");
      console.log(`   ${tea.itemName} ${rupiah(tea.sellPrice)} (stock ${tea.stock}), ${rice.itemName} ${rupiah(rice.sellPrice)} (stock ${rice.stock})`);

      step("2. The cashier's reader types the staff badge and presses Enter");
      const token = issueBadgeToken("walkthrough-ann", staff.badgeVersion);
      console.log(`   reader text: ${token}`);
      const identity = await identifyStaffForCashier(token, organization.id, {
        resolve: (raw) => resolveBadge(raw, prismaStaffLookup(tx)),
        member: (personId, organizationId) => tx.user.findFirst({ where: { centralPersonId: personId, organizationId }, select: { name: true, email: true } }),
      });
      console.log(`   server says: ${identity.ok ? `${identity.name} <${identity.email}> (person ${identity.personId})` : `refused: ${identity.reason}`}`);
      if (!identity.ok) throw new Error("Badge was not recognized");

      const now = new Date();
      const allowanceBefore = await getStaffAllowance(credential.id, identity.email, now, undefined, tx);
      step("3. Exima reads the allowance of that person for the current period");
      console.log(`   total ${rupiah(allowanceBefore.total)}, spent ${rupiah(allowanceBefore.used)}, left ${rupiah(allowanceBefore.remaining)}`);

      step("4. Cart: 2 x Teh Botol + 1 x Nasi Kotak, paid allowance first, the rest in cash");
      const items = [{ product: tea, quantity: 2 }, { product: rice, quantity: 1 }];
      const total = items.reduce((sum, item) => sum + Number(item.product.sellPrice) * item.quantity, 0);
      console.log(`   total ${rupiah(total)}`);

      // The month's allowance is Rp 20.000 for this buyer (an adjustment), less than the cart, so the split shows.
      await tx.posStaffAllowanceAdjustment.create({
        data: { credentialId: credential.id, staffPersonId: "walkthrough-ann", staffEmail: identity.email, periodStartsAt: new Date(allowanceBefore.period.startsAt), periodEndsAt: new Date(allowanceBefore.period.endsAt), amount: new Prisma.Decimal(20000 - Number(allowanceBefore.total)), createdById: cashier.id },
      });
      const allowanceNow = await getStaffAllowance(credential.id, identity.email, now, undefined, tx);
      const allocation = await allocateSalePayment(tx, {
        credentialId: credential.id, buyerType: "staff", staffEmail: identity.email, total,
        payment: { strategy: "allowance_then_external", remainderMethod: "cash" },
      });
      step("5. The payment is split by the same function the cashier uses");
      console.log(`   allowance before ${rupiah(allowanceNow.remaining)}`);
      for (const payment of allocation.payments) console.log(`   ${payment.method}: ${rupiah(payment.amount)}`);

      const sale = await tx.posSale.create({
        data: {
          userId: cashier.id, credentialId: credential.id, idempotencyKey: "walkthrough", requestFingerprint: "walkthrough",
          warehouseId: 1, warehouseName: "Koperasi",
          paymentMethod: allocation.paymentMethod, paymentStrategy: allocation.strategy,
          buyerType: "staff", staffEmail: identity.email, staffPersonId: identity.personId, staffName: identity.name,
          allowanceUsed: allocation.allowanceUsed, allowancePeriodStartsAt: allocation.period?.startsAt, allowancePeriodEndsAt: allocation.period?.endsAt,
          allowanceBalanceBefore: allocation.allowanceBalanceBefore, allowanceBalanceAfter: allocation.allowanceBalanceAfter,
          payments: { create: allocation.payments },
          items: { create: items.map(({ product, quantity }) => ({ itemCode: product.itemCode, itemName: product.itemName, quantity, unitPrice: product.sellPrice, unitCost: product.buyPrice })) },
        },
        include: { items: true },
      });
      if (allocation.period) {
        await reconcileSaleImmediateDebtSettlement(tx, {
          saleId: sale.id, credentialId: credential.id, staffEmail: identity.email, period: allocation.period,
          createdById: cashier.id, settlement: allocation.immediateDebtSettlement, createdAt: sale.createdAt,
        });
      }
      for (const { product, quantity } of items) {
        await tx.posProduct.update({ where: { id: product.id }, data: { stock: { decrement: quantity }, syncStatus: "pending" } });
      }

      step("6. The sale is saved locally and the counter is free for the next person");
      console.log(`   status: ${sale.status} (the Accurate entry comes later, in the background)`);
      const stock = await tx.posProduct.findMany({ where: { credentialId: credential.id }, select: { itemCode: true, stock: true }, orderBy: { itemCode: "asc" } });
      console.log(`   stock now: ${stock.map((row) => `${row.itemCode} ${row.stock}`).join(", ")}`);
      const allowanceAfter = await getStaffAllowance(credential.id, identity.email, now, undefined, tx);
      console.log(`   allowance balance ${rupiah(allowanceAfter.remaining)}: the purchase went past the allowance, and the cash paid for the rest is recorded as a debt payment`);
      const debt = await getOutstandingCurrentAllowanceDebt(credential.id, identity.email, now, undefined, tx);
      console.log(`   debt still owed to the store: ${rupiah(debt.outstanding)}`);

      step("7. What the background worker would send to Accurate (built here, not sent)");
      const payload = buildPosSaleAdjustmentPayload({
        id: sale.id, createdAt: sale.createdAt, warehouseName: sale.warehouseName,
        items: sale.items.map((item) => ({ itemCode: item.itemCode, quantity: item.quantity, unitCost: item.unitCost })),
      } as never);
      console.log(JSON.stringify(payload, null, 2).replace(/^/gm, "   "));

      throw new Rollback();
    }, { timeout: 60_000 });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  const after = await prisma.posSale.count();
  console.log(`\nRolled back. Sales before ${before}, after ${after}: nothing was left behind.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
