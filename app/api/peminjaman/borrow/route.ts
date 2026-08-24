"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveInventoryAdjustment } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import {
    calculateDueDateFromDuration,
    checkBorrowAvailability,
    findUnconfiguredBorrowableItems,
    createBorrowingActivities,
    formatDateOnly,
    startOfDay,
    endOfDay,
} from "@/lib/peminjaman";
import dayjs from "dayjs";
import { getResourceCredential } from "@/lib/credential-access";

interface BorrowItem {
    itemCode: string;
    itemName: string;
    quantity: number;
}

interface BorrowRequest {
    credentialId: string;
    borrowerEmail: string;
    items: BorrowItem[];
    type?: "borrow" | "booking";
    startsAt?: string;
    dueAt?: string;
    durationDays?: number;
    notes?: string;
}

function parseStaffInfo(email: string): { name: string; department: string } {
    const localPart = email.split("@")[0];
    const parts = localPart.split(".");
    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    if (parts.length >= 3) {
        const department = capitalize(parts[parts.length - 1]);
        const nameParts = parts.slice(0, -1).map(capitalize);
        return { name: nameParts.join(" "), department };
    } else if (parts.length === 2) {
        return { name: parts.map(capitalize).join(" "), department: "" };
    } else {
        return { name: capitalize(parts[0]), department: "" };
    }
}

// Helper to ensure valid Accurate session
async function ensureCredentialSession(userId: string, credentialId: string, role: string) {
    let credential = await getResourceCredential(userId, role, credentialId);

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

    let body: BorrowRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { credentialId, borrowerEmail, items, notes } = body;
    const type = body.type === "booking" ? "booking" : "borrow";

    if (!credentialId || !borrowerEmail || !items?.length) {
        return NextResponse.json({ error: "credentialId, borrowerEmail, and items are required" }, { status: 400 });
    }

    try {
        const { name: borrowerName, department: borrowerDept } = parseStaffInfo(borrowerEmail);
        const startsAt = startOfDay(body.startsAt || new Date());
        const dueAt = body.dueAt
            ? endOfDay(body.dueAt)
            : body.durationDays
                ? endOfDay(calculateDueDateFromDuration(body.durationDays, startsAt))
                : null;

        if (!dueAt) {
            return NextResponse.json(
                { error: "dueAt or durationDays is required" },
                { status: 400 }
            );
        }

        if (dueAt.getTime() < startsAt.getTime()) {
            return NextResponse.json(
                { error: "Return date must be after start date" },
                { status: 400 }
            );
        }

        if (type === "borrow" && formatDateOnly(startsAt) !== formatDateOnly(new Date())) {
            return NextResponse.json(
                { error: "Borrowing must start today" },
                { status: 400 }
            );
        }

        const credential = await getResourceCredential(session.user.id, session.user.role, credentialId);
        if (!credential) {
            return NextResponse.json({ error: "Credential not found" }, { status: 404 });
        }

        const unconfiguredItems = await findUnconfiguredBorrowableItems(
            credential.organizationId,
            items,
        );
        if (unconfiguredItems.length > 0) {
            return NextResponse.json(
                {
                    error: "Some items are not configured in Barang Peminjaman",
                    items: unconfiguredItems.map((item) => ({
                        itemCode: item.itemCode,
                        itemName: item.itemName || item.itemCode,
                    })),
                },
                { status: 400 }
            );
        }

        const availability = await checkBorrowAvailability({
            organizationId: credential.organizationId,
            items,
            startDate: startsAt,
            endDate: dueAt,
        });

        if (!availability.ok) {
            return NextResponse.json(
                {
                    error:
                        type === "booking"
                            ? "Booking date conflicts with an existing booking or loan"
                            : "Selected duration conflicts with an existing booking or loan",
                    availability,
                },
                { status: 409 }
            );
        }

        const borrowingSession = await prisma.$transaction(async (tx) => {
            const created = await tx.borrowingSession.create({
                data: {
                    userId: session.user.id,
                    credentialId,
                    borrowerEmail: borrowerEmail.toLowerCase().trim(),
                    borrowerName,
                    borrowerDept,
                    type,
                    status: type === "booking" ? "booked" : "active",
                    startsAt,
                    dueAt,
                    notes,
                    items: {
                        create: items.map((item) => ({
                            itemCode: item.itemCode,
                            itemName: item.itemName,
                            quantity: item.quantity,
                        })),
                    },
                },
                include: { items: true },
            });

            await createBorrowingActivities(tx, {
                sessionId: created.id,
                userId: session.user.id,
                credentialId,
                borrowerEmail: borrowerEmail.toLowerCase().trim(),
                borrowerName,
                borrowerDept,
                activityType: type === "booking" ? "booking" : "borrow",
                scheduleStart: startsAt,
                scheduleEnd: dueAt,
                items,
                details: notes || null,
            });

            return created;
        });

        // Create ADJUSTMENT_OUT in Accurate
        let adjustmentId: number | null = null;
        if (type === "borrow") {
            try {
                const credential = await ensureCredentialSession(session.user.id, credentialId, session.user.role);
                const resourceSettings = await prisma.resourceSettings.findUnique({
                    where: { organizationId: credential.organizationId },
                });
                if (!resourceSettings) {
                    throw new Error("Resource Management warehouse is not configured.");
                }

                const description = `Peminjaman by ${borrowerName || borrowerEmail}${borrowerDept ? ` | Dept: ${borrowerDept}` : ""} | Email: ${borrowerEmail}`;

                const adjustmentData = {
                    transDate: dayjs().format("YYYY-MM-DD"),
                    description,
                    detailItem: items.map((item) => ({
                        itemNo: item.itemCode,
                        quantity: item.quantity,
                        itemAdjustmentType: "ADJUSTMENT_OUT" as const,
                        warehouseName: resourceSettings.warehouseName,
                    })),
                };

                console.log(
                    `[peminjaman/borrow] Creating ADJUSTMENT_OUT with ${adjustmentData.detailItem.length} item lines`,
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

                adjustmentId = result.id;

                await prisma.borrowingSession.update({
                    where: { id: borrowingSession.id },
                    data: { adjustmentOutId: adjustmentId },
                });
            } catch (accErr: any) {
                console.error("[peminjaman/borrow] Accurate adjustment failed (session still created):", accErr.message);
            }
        }

        return NextResponse.json({
            success: true,
            sessionId: borrowingSession.id,
            adjustmentId,
            borrowerName,
            borrowerDept,
            itemCount: items.length,
            type,
            startsAt: borrowingSession.startsAt,
            dueAt: borrowingSession.dueAt,
        });
    } catch (error: any) {
        console.error("[peminjaman/borrow] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to create borrowing session" }, { status: 500 });
    }
}
