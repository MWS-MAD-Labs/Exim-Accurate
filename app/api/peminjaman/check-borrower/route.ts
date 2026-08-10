"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResourceCredential } from "@/lib/credential-access";

// GET — Check if a borrower has unreturned items
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const credentialId = searchParams.get("credentialId");

    if (!email || !credentialId) {
        return NextResponse.json({ error: "email and credentialId are required" }, { status: 400 });
    }

    try {
        const credential = await getResourceCredential(
            session.user.id,
            session.user.role,
            credentialId,
        );
        if (!credential) {
            return NextResponse.json({ error: "Credential not found" }, { status: 404 });
        }

        // Borrowing stock is organization-owned, so include active loans from
        // current and historical credentials belonging to this organization.
        const activeSessions = await prisma.borrowingSession.findMany({
            where: {
                credential: { organizationId: credential.organizationId },
                borrowerEmail: email.toLowerCase().trim(),
                status: { in: ["active", "partial"] },
            },
            include: {
                items: true,
            },
            orderBy: { borrowedAt: "desc" },
        });

        // Flatten unreturned items across all sessions
        const activeItems: Array<{
            sessionId: string;
            borrowingItemId: string;
            itemCode: string;
            itemName: string;
            quantity: number;
            returnedQty: number;
            unreturned: number;
            borrowedAt: Date;
        }> = [];

        for (const sess of activeSessions) {
            for (const item of sess.items) {
                const unreturned = item.quantity - item.returnedQty;
                if (unreturned > 0) {
                    activeItems.push({
                        sessionId: sess.id,
                        borrowingItemId: item.id,
                        itemCode: item.itemCode,
                        itemName: item.itemName,
                        quantity: item.quantity,
                        returnedQty: item.returnedQty,
                        unreturned,
                        borrowedAt: sess.borrowedAt,
                    });
                }
            }
        }

        return NextResponse.json({
            hasActiveLoans: activeItems.length > 0,
            activeItems,
            sessionCount: activeSessions.length,
        });
    } catch (error: any) {
        console.error("[peminjaman/check-borrower] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to check borrower" }, { status: 500 });
    }
}
