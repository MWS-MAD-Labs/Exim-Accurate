"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveInventoryAdjustment } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { createBorrowingActivities } from "@/lib/peminjaman";
import dayjs from "dayjs";
import { canAccessResourceManagement } from "@/lib/access-control";
import { getOrganizationIdForUser } from "@/lib/organization";

interface ReturnItem {
    borrowingItemId: string;
    returnQty: number;
}

interface ReturnRequest {
    items: ReturnItem[];
}

// Returns use the organization's current Accurate connection, even when the
// original loan belongs to a disconnected historical credential.
async function ensureActiveCredentialSession(organizationId: string) {
    let credential = await prisma.accurateCredentials.findFirst({
        where: { organizationId, disconnectedAt: null },
        orderBy: { updatedAt: "desc" },
    });

    if (!credential) return null;

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
    if (!canAccessResourceManagement(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    if (items.some((item) => !item.borrowingItemId || !Number.isInteger(item.returnQty) || item.returnQty <= 0)) {
        return NextResponse.json({ error: "Each return item must have a valid id and positive integer quantity" }, { status: 400 });
    }

    try {
        const organizationId = await getOrganizationIdForUser(session.user.id);
        if (!organizationId) {
            return NextResponse.json({ error: "Organization not found" }, { status: 403 });
        }

        // Authorize each historical loan through its session credential's
        // organization. The original credential does not need to remain active.
        const borrowingItems = await prisma.borrowingItem.findMany({
            where: {
                id: { in: items.map((i) => i.borrowingItemId) },
                session: {
                    credential: { organizationId },
                },
            },
            include: {
                session: true,
            },
        });

        const requestedIds = new Set(items.map((item) => item.borrowingItemId));
        if (borrowingItems.length !== requestedIds.size) {
            return NextResponse.json({ error: "One or more borrowing items were not found" }, { status: 404 });
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

        let synchronization: {
            status: "not_required" | "synced" | "pending_reconciliation";
            message?: string;
            adjustmentId?: number;
        } = { status: "not_required" };

        // Create ADJUSTMENT_IN using the organization's current active credential.
        // Local returns remain committed if Accurate is unavailable.
        if (itemsToAdjust.length > 0) {
            try {
                const credential = await ensureActiveCredentialSession(organizationId);
                if (!credential) {
                    synchronization = {
                        status: "pending_reconciliation",
                        message: "Return saved locally, but the organization has no active Accurate credential.",
                    };
                } else {

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

                    for (const sessionId of sessionIds) {
                        await prisma.borrowingSession.update({
                            where: { id: sessionId },
                            data: { adjustmentInId: result.id },
                        });
                    }
                    synchronization = {
                        status: "synced",
                        adjustmentId: result.id,
                    };
                }
            } catch (accErr: unknown) {
                const message = accErr instanceof Error ? accErr.message : "Unknown Accurate synchronization error";
                console.error("[peminjaman/return] Accurate adjustment failed:", message);
                synchronization = {
                    status: "pending_reconciliation",
                    message: `Return saved locally, but Accurate synchronization failed: ${message}`,
                };
            }
        }

        return NextResponse.json({
            success: true,
            returnedItems: itemsToAdjust.length,
            synchronization,
        });
    } catch (error: any) {
        console.error("[peminjaman/return] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process return" }, { status: 500 });
    }
}
