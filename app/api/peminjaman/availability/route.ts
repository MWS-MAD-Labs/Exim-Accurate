"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
    AVAILABILITY_CUSTOM_HORIZON_DAYS,
    checkBorrowAvailability,
    endOfDay,
    findUnconfiguredBorrowableItems,
    formatDateOnly,
    getBorrowDurationOptions,
    startOfDay,
} from "@/lib/peminjaman";
import { getResourceCredential } from "@/lib/credential-access";

interface AvailabilityRequest {
    credentialId: string;
    items: Array<{
        itemCode: string;
        itemName?: string;
        quantity: number;
    }>;
    type?: "borrow" | "booking";
    startsAt?: string;
    dueAt?: string;
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: AvailabilityRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { credentialId, items } = body;
    const type = body.type === "booking" ? "booking" : "borrow";

    if (!credentialId || !items?.length) {
        return NextResponse.json(
            { error: "credentialId and items are required" },
            { status: 400 }
        );
    }

    try {
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

        const startsAt = startOfDay(
            body.startsAt || (type === "borrow" ? new Date() : new Date())
        );

        const durationOptions =
            type === "borrow"
                ? await getBorrowDurationOptions({
                    organizationId: credential.organizationId,
                    items,
                    startDate: startsAt,
                })
                : null;

        const requestedDueAt =
            body.dueAt ||
            (type === "borrow" ? durationOptions?.maxReturnDate || undefined : undefined);

        const selectedRange =
            requestedDueAt
                ? await checkBorrowAvailability({
                    organizationId: credential.organizationId,
                    items,
                    startDate: startsAt,
                    endDate: endOfDay(requestedDueAt),
                })
                : null;

        return NextResponse.json({
            type,
            startsAt: formatDateOnly(startsAt),
            horizonDays: AVAILABILITY_CUSTOM_HORIZON_DAYS,
            durationOptions,
            selectedRange,
        });
    } catch (error: any) {
        console.error("[peminjaman/availability] Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to check availability" },
            { status: 500 }
        );
    }
}
