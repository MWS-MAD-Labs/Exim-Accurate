import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BorrowSessionType = "borrow" | "booking";
export type BorrowSessionStatus =
  | "active"
  | "partial"
  | "returned"
  | "booked";
export type BorrowActivityType = "borrow" | "booking" | "return";

export interface RequestedBorrowItem {
  itemCode: string;
  itemName?: string;
  quantity: number;
}

interface ReservationWindow {
  sessionId: string;
  type: string;
  status: string;
  borrowerEmail: string;
  borrowerName: string | null;
  borrowerDept: string | null;
  itemCode: string;
  itemName: string;
  quantity: number;
  startDate: Date;
  endDate: Date;
}

interface AvailabilityContext {
  borrowableItems: Map<
    string,
    {
      itemCode: string;
      itemName: string;
      totalStock: number;
    }
  >;
  requestedItems: RequestedBorrowItem[];
  reservationsByItemCode: Map<string, ReservationWindow[]>;
}

export interface AvailabilityItemResult {
  itemCode: string;
  itemName: string;
  requestedQty: number;
  totalStock: number;
  maxReservedQty: number;
  availableQty: number;
  ok: boolean;
  nextConflictDate: string | null;
  blockingReservations: Array<{
    sessionId: string;
    type: string;
    status: string;
    borrowerEmail: string;
    borrowerName: string | null;
    borrowerDept: string | null;
    quantity: number;
    startDate: string;
    endDate: string;
  }>;
}

export interface AvailabilityResult {
  ok: boolean;
  startDate: string;
  endDate: string;
  items: AvailabilityItemResult[];
}

export interface DurationOptionsResult {
  allowedDurations: number[];
  maxReturnDate: string | null;
  nextConflictDate: string | null;
  preview: AvailabilityResult | null;
}

export const AVAILABILITY_OPTION_DAYS = 7;
export const AVAILABILITY_CUSTOM_HORIZON_DAYS = 90;

export function startOfDay(value: Date | string) {
  return dayjs(value).startOf("day").toDate();
}

export function endOfDay(value: Date | string) {
  return dayjs(value).endOf("day").toDate();
}

export function formatDateOnly(value: Date | string) {
  return dayjs(value).format("YYYY-MM-DD");
}

export function calculateDueDateFromDuration(
  durationDays: number,
  startsAt: Date | string,
) {
  return dayjs(startOfDay(startsAt)).add(durationDays, "day").toDate();
}

export function normalizeRequestedItems(items: RequestedBorrowItem[]) {
  const grouped = new Map<string, RequestedBorrowItem>();

  for (const item of items) {
    const quantity = Math.max(1, Math.trunc(item.quantity || 0));
    const existing = grouped.get(item.itemCode);

    if (existing) {
      existing.quantity += quantity;
      if (!existing.itemName && item.itemName) {
        existing.itemName = item.itemName;
      }
      continue;
    }

    grouped.set(item.itemCode, {
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity,
    });
  }

  return Array.from(grouped.values());
}

export async function listBorrowableItemCodes(organizationId: string) {
  const rows = await prisma.borrowableItem.findMany({
    where: { organizationId },
    select: {
      itemCode: true,
    },
    orderBy: {
      itemCode: "asc",
    },
  });

  return rows.map((row) => row.itemCode);
}

export async function getBorrowableItemsMap(
  organizationId: string,
  itemCodes?: string[],
) {
  const rows = await prisma.borrowableItem.findMany({
    where: {
      organizationId,
      ...(itemCodes?.length ? { itemCode: { in: itemCodes } } : {}),
    },
    select: {
      itemCode: true,
      itemName: true,
      totalStock: true,
    },
  });

  return new Map(rows.map((row) => [row.itemCode, row]));
}

export async function findUnconfiguredBorrowableItems(
  organizationId: string,
  items: RequestedBorrowItem[],
) {
  const requestedItems = normalizeRequestedItems(items);
  const borrowableItems = await getBorrowableItemsMap(
    organizationId,
    requestedItems.map((item) => item.itemCode),
  );

  return requestedItems.filter((item) => !borrowableItems.has(item.itemCode));
}

function getReservationRange(session: {
  startsAt: Date;
  dueAt: Date | null;
  returnedAt: Date | null;
}) {
  const startDate = startOfDay(session.startsAt);
  const endSource =
    session.returnedAt || session.dueAt || dayjs().add(10, "year").toDate();

  return {
    startDate,
    endDate: endOfDay(endSource),
  };
}

function isDateWithinRange(value: Date, startDate: Date, endDate: Date) {
  const time = value.getTime();
  return time >= startDate.getTime() && time <= endDate.getTime();
}

async function buildAvailabilityContext(args: {
  organizationId: string;
  items: RequestedBorrowItem[];
}) {
  const requestedItems = normalizeRequestedItems(args.items);
  const itemCodes = requestedItems.map((item) => item.itemCode);

  const [borrowableItems, sessions] = await Promise.all([
    getBorrowableItemsMap(args.organizationId, itemCodes),
    prisma.borrowingSession.findMany({
      where: {
        credential: { organizationId: args.organizationId },
        status: { in: ["active", "partial", "booked"] },
        items: {
          some: {
            itemCode: { in: itemCodes },
          },
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        borrowerEmail: true,
        borrowerName: true,
        borrowerDept: true,
        startsAt: true,
        dueAt: true,
        returnedAt: true,
        items: {
          where: {
            itemCode: { in: itemCodes },
          },
          select: {
            itemCode: true,
            itemName: true,
            quantity: true,
            returnedQty: true,
          },
        },
      },
    }),
  ]);

  const reservationsByItemCode = new Map<string, ReservationWindow[]>();

  for (const session of sessions) {
    const { startDate, endDate } = getReservationRange(session);

    for (const item of session.items) {
      const quantity =
        session.type === "booking"
          ? item.quantity
          : Math.max(0, item.quantity - item.returnedQty);

      if (quantity <= 0) {
        continue;
      }

      const entry: ReservationWindow = {
        sessionId: session.id,
        type: session.type,
        status: session.status,
        borrowerEmail: session.borrowerEmail,
        borrowerName: session.borrowerName,
        borrowerDept: session.borrowerDept,
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity,
        startDate,
        endDate,
      };

      const current = reservationsByItemCode.get(item.itemCode) || [];
      current.push(entry);
      reservationsByItemCode.set(item.itemCode, current);
    }
  }

  return {
    borrowableItems,
    requestedItems,
    reservationsByItemCode,
  } satisfies AvailabilityContext;
}

function evaluateAvailabilityRange(
  context: AvailabilityContext,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const items: AvailabilityItemResult[] = [];
  let overallOk = true;

  for (const requestedItem of context.requestedItems) {
    const borrowable = context.borrowableItems.get(requestedItem.itemCode);

    if (!borrowable) {
      items.push({
        itemCode: requestedItem.itemCode,
        itemName: requestedItem.itemName || requestedItem.itemCode,
        requestedQty: requestedItem.quantity,
        totalStock: 0,
        maxReservedQty: 0,
        availableQty: 0,
        ok: false,
        nextConflictDate: formatDateOnly(rangeStart),
        blockingReservations: [],
      });
      overallOk = false;
      continue;
    }

    const reservations =
      context.reservationsByItemCode.get(requestedItem.itemCode) || [];
    let maxReservedQty = 0;
    let nextConflictDate: string | null = null;
    let blockingReservations: AvailabilityItemResult["blockingReservations"] =
      [];

    for (
      let cursor = startOfDay(rangeStart);
      cursor.getTime() <= startOfDay(rangeEnd).getTime();
      cursor = dayjs(cursor).add(1, "day").toDate()
    ) {
      const overlapping = reservations.filter((reservation) =>
        isDateWithinRange(cursor, reservation.startDate, reservation.endDate),
      );
      const reservedQty = overlapping.reduce(
        (sum, reservation) => sum + reservation.quantity,
        0,
      );

      if (reservedQty > maxReservedQty) {
        maxReservedQty = reservedQty;
      }

      if (
        !nextConflictDate &&
        reservedQty + requestedItem.quantity > borrowable.totalStock
      ) {
        nextConflictDate = formatDateOnly(cursor);
        blockingReservations = overlapping.map((reservation) => ({
          sessionId: reservation.sessionId,
          type: reservation.type,
          status: reservation.status,
          borrowerEmail: reservation.borrowerEmail,
          borrowerName: reservation.borrowerName,
          borrowerDept: reservation.borrowerDept,
          quantity: reservation.quantity,
          startDate: formatDateOnly(reservation.startDate),
          endDate: formatDateOnly(reservation.endDate),
        }));
      }
    }

    const availableQty = Math.max(0, borrowable.totalStock - maxReservedQty);
    const ok = !nextConflictDate;
    if (!ok) {
      overallOk = false;
    }

    items.push({
      itemCode: requestedItem.itemCode,
      itemName: requestedItem.itemName || borrowable.itemName,
      requestedQty: requestedItem.quantity,
      totalStock: borrowable.totalStock,
      maxReservedQty,
      availableQty,
      ok,
      nextConflictDate,
      blockingReservations,
    });
  }

  return {
    ok: overallOk,
    startDate: formatDateOnly(rangeStart),
    endDate: formatDateOnly(rangeEnd),
    items,
  } satisfies AvailabilityResult;
}

export async function checkBorrowAvailability(args: {
  organizationId: string;
  items: RequestedBorrowItem[];
  startDate: Date | string;
  endDate: Date | string;
}) {
  const context = await buildAvailabilityContext(args);
  return evaluateAvailabilityRange(
    context,
    startOfDay(args.startDate),
    endOfDay(args.endDate),
  );
}

export async function getBorrowDurationOptions(args: {
  organizationId: string;
  items: RequestedBorrowItem[];
  startDate?: Date | string;
}) {
  const startDate = startOfDay(args.startDate || new Date());
  const context = await buildAvailabilityContext({
    organizationId: args.organizationId,
    items: args.items,
  });

  const allowedDurations: number[] = [];
  let maxReturnDate: string | null = null;
  let nextConflictDate: string | null = null;
  let preview: AvailabilityResult | null = null;

  for (let days = 1; days <= AVAILABILITY_OPTION_DAYS; days += 1) {
    const dueDate = calculateDueDateFromDuration(days, startDate);
    const evaluation = evaluateAvailabilityRange(context, startDate, dueDate);
    if (evaluation.ok) {
      allowedDurations.push(days);
    }
  }

  for (let days = 1; days <= AVAILABILITY_CUSTOM_HORIZON_DAYS; days += 1) {
    const dueDate = calculateDueDateFromDuration(days, startDate);
    const evaluation = evaluateAvailabilityRange(context, startDate, dueDate);

    if (evaluation.ok) {
      maxReturnDate = evaluation.endDate;
      preview = evaluation;
      continue;
    }

    nextConflictDate =
      evaluation.items.find((item) => item.nextConflictDate)?.nextConflictDate ||
      null;
    break;
  }

  return {
    allowedDurations,
    maxReturnDate,
    nextConflictDate,
    preview,
  } satisfies DurationOptionsResult;
}

export async function createBorrowingActivities(
  tx: Prisma.TransactionClient,
  args: {
    sessionId: string;
    userId: string;
    credentialId: string;
    borrowerEmail: string;
    borrowerName?: string | null;
    borrowerDept?: string | null;
    activityType: BorrowActivityType;
    scheduleStart?: Date | null;
    scheduleEnd?: Date | null;
    items: RequestedBorrowItem[];
    details?: string | null;
  },
) {
  const normalizedItems = normalizeRequestedItems(args.items);
  if (normalizedItems.length === 0) {
    return;
  }

  await tx.borrowingActivity.createMany({
    data: normalizedItems.map((item) => ({
      sessionId: args.sessionId,
      userId: args.userId,
      credentialId: args.credentialId,
      itemCode: item.itemCode,
      itemName: item.itemName || item.itemCode,
      borrowerEmail: args.borrowerEmail,
      borrowerName: args.borrowerName || null,
      borrowerDept: args.borrowerDept || null,
      activityType: args.activityType,
      quantity: item.quantity,
      scheduleStart: args.scheduleStart || null,
      scheduleEnd: args.scheduleEnd || null,
      details: args.details || null,
    })),
  });
}

export function getSessionTypeLabel(type: string, language: "id" | "en") {
  if (type === "booking") {
    return language === "id" ? "Booking" : "Booking";
  }

  return language === "id" ? "Peminjaman" : "Borrowing";
}
