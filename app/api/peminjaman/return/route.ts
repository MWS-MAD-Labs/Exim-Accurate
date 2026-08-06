"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveInventoryAdjustment } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { createBorrowingActivities } from "@/lib/peminjaman";
import dayjs from "dayjs";

interface ReturnItem {
    borrowingItemId: string;
    returnQty: number;
}

interface ReturnRequest {
    items: ReturnItem[];
}

// Helper to ensure valid Accurate session
async function ensureCredentialSession(credentialId: string, userId: string) {
    let credential = await prisma.accurateCredentials.findFirst({
        where: { id: credentialId, userId },
    });

    if (!credential) throw new Error("Credential not found");

    if (!credential.session || !credential.host) {
        if (credential.dbId) {
            try {
                const { host, session: newSession } = await refreshSession(
                    credential.apiToken,
                    credential.dbId
                );
                credential = await prisma.accurateCredentials.update({
                    where: { id: credential.id },
                    data: { host, session: newSession },
                });
            } catch {
                if (credential.refreshToken) {
                    const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(
                        credential.refreshToken,
                        process.env.ACCURATE_CLIENT_ID!,
                        process.env.ACCURATE_CLIENT_SECRET!
                    );
                    credential = await prisma.accurateCredentials.update({
                        where: { id: credential.id },
                        data: {
                            apiToken: accessToken,
                            refreshToken: newRefreshToken || credential.refreshToken,
                        },
                    });
                    const { host, session: newSession } = await refreshSession(
                        accessToken,
                        credential.dbId!
                    );
                    credential = await prisma.accurateCredentials.update({
                        where: { id: credential.id },
                        data: { host, session: newSession },
                    });
                } else {
                    throw new Error("Session expired. Please reconnect to Accurate.");
                }
            }
        } else {
            throw new Error("Credential not fully configured.");
        }
    }

    return credential;
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: ReturnRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { items } = body;

    if (!items?.length) {
        return NextResponse.json({ error: "items are required" }, { status: 400 });
    }

    try {
        // Fetch all borrowing items and their sessions
        const borrowingItems = await prisma.borrowingItem.findMany({
            where: {
                id: { in: items.map((i) => i.borrowingItemId) },
            },
            include: {
                session: true,
            },
        });

        if (borrowingItems.length === 0) {
            return NextResponse.json({ error: "No valid borrowing items found" }, { status: 404 });
        }

        // Verify ownership
        for (const bi of borrowingItems) {
            if (bi.session.userId !== session.user.id) {
                return NextResponse.json({ error: "Unauthorized access to borrowing item" }, { status: 403 });
            }
        }

        // Update each borrowing item's returnedQty
        const itemsToAdjust: Array<{ itemCode: string; quantity: number }> = [];
        const sessionIds = new Set<string>();
        const returnActivities: Array<{
            sessionId: string;
            userId: string;
            credentialId: string;
            borrowerEmail: string;
            borrowerName: string | null;
            borrowerDept: string | null;
            itemCode: string;
            itemName: string;
            quantity: number;
            scheduleStart: Date;
            scheduleEnd: Date | null;
        }> = [];

        for (const returnItem of items) {
            const bi = borrowingItems.find((b) => b.id === returnItem.borrowingItemId);
            if (!bi) continue;

            const maxReturnable = bi.quantity - bi.returnedQty;
            const actualReturn = Math.min(returnItem.returnQty, maxReturnable);

            if (actualReturn <= 0) continue;

            await prisma.borrowingItem.update({
                where: { id: bi.id },
                data: {
                    returnedQty: bi.returnedQty + actualReturn,
                    returnedAt: bi.returnedQty + actualReturn >= bi.quantity ? new Date() : null,
                },
            });

            itemsToAdjust.push({ itemCode: bi.itemCode, quantity: actualReturn });
            sessionIds.add(bi.sessionId);
            returnActivities.push({
                sessionId: bi.sessionId,
                userId: bi.session.userId,
                credentialId: bi.session.credentialId,
                borrowerEmail: bi.session.borrowerEmail,
                borrowerName: bi.session.borrowerName,
                borrowerDept: bi.session.borrowerDept,
                itemCode: bi.itemCode,
                itemName: bi.itemName,
                quantity: actualReturn,
                scheduleStart: bi.session.startsAt,
                scheduleEnd: bi.session.dueAt,
            });
        }

        // Update session statuses
        for (const sessionId of sessionIds) {
            const sessionItems = await prisma.borrowingItem.findMany({
                where: { sessionId },
            });

            const allReturned = sessionItems.every((i) => i.returnedQty >= i.quantity);
            const anyReturned = sessionItems.some((i) => i.returnedQty > 0);

            await prisma.borrowingSession.update({
                where: { id: sessionId },
                data: {
                    status: allReturned ? "returned" : anyReturned ? "partial" : "active",
                    returnedAt: allReturned ? new Date() : null,
                },
            });
        }

        if (returnActivities.length > 0) {
            await prisma.$transaction(async (tx) => {
                const groupedBySession = new Map<string, typeof returnActivities>();

                for (const activity of returnActivities) {
                    const current = groupedBySession.get(activity.sessionId) || [];
                    current.push(activity);
                    groupedBySession.set(activity.sessionId, current);
                }

                for (const [sessionId, activities] of groupedBySession.entries()) {
                    const first = activities[0];
                    await createBorrowingActivities(tx, {
                        sessionId,
                        userId: first.userId,
                        credentialId: first.credentialId,
                        borrowerEmail: first.borrowerEmail,
                        borrowerName: first.borrowerName,
                        borrowerDept: first.borrowerDept,
                        activityType: "return",
                        scheduleStart: first.scheduleStart,
                        scheduleEnd: first.scheduleEnd,
                        items: activities.map((activity) => ({
                            itemCode: activity.itemCode,
                            itemName: activity.itemName,
                            quantity: activity.quantity,
                        })),
                    });
                }
            });
        }

        // Create ADJUSTMENT_IN in Accurate
        if (itemsToAdjust.length > 0) {
            const firstSession = borrowingItems[0].session;
            try {
                const credential = await ensureCredentialSession(firstSession.credentialId, session.user.id);

                const description = `Pengembalian Peminjaman | ${dayjs().format("DD/MM/YYYY")}`;

                const adjustmentData = {
                    transDate: dayjs().format("YYYY-MM-DD"),
                    description,
                    detailItem: itemsToAdjust.map((item) => ({
                        itemNo: item.itemCode,
                        quantity: item.quantity,
                        itemAdjustmentType: "ADJUSTMENT_IN" as const,
                    })),
                };

                console.log(
                    `[peminjaman/return] Creating ADJUSTMENT_IN with ${adjustmentData.detailItem.length} item lines`,
                );

                const result = await saveInventoryAdjustment(
                    {
                        apiToken: credential.apiToken,
                        signatureSecret: credential.signatureSecret,
                        host: credential.host!,
                        session: credential.session!,
                    },
                    adjustmentData
                );

                // Update the first session with adjustment in ID
                for (const sessionId of sessionIds) {
                    await prisma.borrowingSession.update({
                        where: { id: sessionId },
                        data: { adjustmentInId: result.id },
                    });
                }
            } catch (accErr: any) {
                console.error("[peminjaman/return] Accurate adjustment failed:", accErr.message);
            }
        }

        return NextResponse.json({
            success: true,
            returnedItems: itemsToAdjust.length,
        });
    } catch (error: any) {
        console.error("[peminjaman/return] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process return" }, { status: 500 });
    }
}
