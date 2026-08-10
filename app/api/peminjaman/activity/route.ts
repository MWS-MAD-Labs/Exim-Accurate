"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, listBorrowableItemCodes } from "@/lib/peminjaman";
import { getResourceCredential } from "@/lib/credential-access";

function isMissingSchemaError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return error.code === "P2021" || error.code === "P2022";
    }

    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return (
        message.includes("does not exist") ||
        message.includes("column") ||
        message.includes("relation") ||
        message.includes("p2021") ||
        message.includes("p2022")
    );
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const credentialId = searchParams.get("credentialId");
    const itemCode = searchParams.get("itemCode");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "30")));

    if (!credentialId) {
        return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
    }

    try {
        const credential = await getResourceCredential(session.user.id, session.user.role, credentialId);
        if (!credential) {
            return NextResponse.json({ error: "Credential not found" }, { status: 404 });
        }

        const borrowableItemCodes = await listBorrowableItemCodes(credential.organizationId);
        if (borrowableItemCodes.length === 0) {
            return NextResponse.json({
                activities: [],
                calendarEvents: [],
            });
        }

        if (itemCode && !borrowableItemCodes.includes(itemCode)) {
            return NextResponse.json({
                activities: [],
                calendarEvents: [],
            });
        }

        const activityWhere = {
            credentialId,
            credential: { organizationId: credential.organizationId },
            itemCode: itemCode
                ? itemCode
                : {
                    in: borrowableItemCodes,
                },
        };
        const borrowingActivityDelegate = (prisma as any).borrowingActivity;
        const borrowingSessionDelegate = (prisma as any).borrowingSession;

        const activities = borrowingActivityDelegate
            ? await borrowingActivityDelegate.findMany({
                where: activityWhere,
                orderBy: { occurredAt: "desc" },
                take: limit,
            }).catch((error: unknown) => {
                if (isMissingSchemaError(error)) {
                    console.warn("[peminjaman/activity] Falling back to empty activities:", error);
                    return [];
                }
                throw error;
            })
            : [];

        const sessions = itemCode && borrowingSessionDelegate
            ? await borrowingSessionDelegate.findMany({
                where: {
                    credentialId,
                    credential: { organizationId: credential.organizationId },
                    items: {
                        some: {
                            itemCode: itemCode
                                ? itemCode
                                : {
                                    in: borrowableItemCodes,
                                },
                        },
                    },
                },
                include: {
                    items: {
                        where: {
                            itemCode: itemCode
                                ? itemCode
                                : {
                                    in: borrowableItemCodes,
                                },
                        },
                    },
                },
                orderBy: { startsAt: "asc" },
            }).catch(async (error: unknown) => {
                if (!isMissingSchemaError(error)) {
                    throw error;
                }

                console.warn("[peminjaman/activity] Falling back to legacy session fields:", error);

                return borrowingSessionDelegate.findMany({
                    where: {
                        credentialId,
                        credential: { organizationId: credential.organizationId },
                        items: {
                            some: {
                                itemCode: itemCode
                                    ? itemCode
                                    : {
                                        in: borrowableItemCodes,
                                    },
                            },
                        },
                    },
                    include: {
                        items: {
                            where: {
                                itemCode: itemCode
                                    ? itemCode
                                    : {
                                        in: borrowableItemCodes,
                                    },
                            },
                        },
                    },
                    orderBy: { borrowedAt: "asc" },
                });
            })
            : [];

        const calendarEvents = (sessions as any[]).flatMap((borrowingSession: any) =>
            borrowingSession.items.map((item: any) => {
                const sessionRecord = borrowingSession as typeof borrowingSession & {
                    type?: string;
                    startsAt?: Date;
                    dueAt?: Date | null;
                    borrowedAt?: Date;
                };
                const startDate = sessionRecord.startsAt || sessionRecord.borrowedAt;
                const endDate =
                    borrowingSession.returnedAt ||
                    sessionRecord.dueAt ||
                    sessionRecord.startsAt ||
                    sessionRecord.borrowedAt;

                return {
                    id: `${borrowingSession.id}:${item.itemCode}`,
                    sessionId: borrowingSession.id,
                    type: sessionRecord.type || "borrow",
                    status: borrowingSession.status,
                    borrowerEmail: borrowingSession.borrowerEmail,
                    borrowerName: borrowingSession.borrowerName,
                    borrowerDept: borrowingSession.borrowerDept,
                    itemCode: item.itemCode,
                    itemName: item.itemName,
                    quantity: item.quantity,
                    returnedQty: item.returnedQty,
                    startDate: formatDateOnly(startDate || new Date()),
                    endDate: formatDateOnly(endDate || startDate || new Date()),
                };
            })
        );

        return NextResponse.json({
            activities,
            calendarEvents,
        });
    } catch (error: any) {
        console.error("[peminjaman/activity] Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch activity" },
            { status: 500 }
        );
    }
}
