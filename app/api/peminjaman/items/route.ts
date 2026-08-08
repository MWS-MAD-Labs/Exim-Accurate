"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResourceCredential } from "@/lib/credential-access";

// GET — List configured borrowable items with stock info
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const credentialId = searchParams.get("credentialId");

    if (!credentialId) {
        return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
    }

    try {
        const items = await prisma.borrowableItem.findMany({
            orderBy: { createdAt: "desc" },
        });

        // Calculate currently borrowed (unreturned) quantities per item
        const activeItems = await prisma.borrowingItem.groupBy({
            by: ["itemCode"],
            where: {
                session: {
                    status: { in: ["active", "partial"] },
                },
            },
            _sum: {
                quantity: true,
                returnedQty: true,
            },
        });

        // Build a map of itemCode -> currentlyOut
        const outMap: Record<string, number> = {};
        for (const ai of activeItems) {
            const borrowed = ai._sum.quantity || 0;
            const returned = ai._sum.returnedQty || 0;
            outMap[ai.itemCode] = borrowed - returned;
        }

        // Enrich items with stock info
        const enriched = items.map((item) => {
            const currentlyOut = outMap[item.itemCode] || 0;
            return {
                ...item,
                currentlyOut,
                available: item.totalStock - currentlyOut,
            };
        });

        console.log("[peminjaman/items] GET returning items:", enriched.length);

        return NextResponse.json(enriched);
    } catch (error: any) {
        console.error("[peminjaman/items] GET Error:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch items" }, { status: 500 });
    }
}

// POST — Add item as borrowable
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { credentialId: string; itemCode: string; itemName: string; totalStock: number };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { credentialId, itemCode, itemName, totalStock } = body;

    if (!credentialId || !itemCode || !itemName || totalStock == null) {
        return NextResponse.json({ error: "credentialId, itemCode, itemName, and totalStock are required" }, { status: 400 });
    }

    try {
        const credential = await getResourceCredential(session.user.role, credentialId);
        if (!credential) {
            return NextResponse.json({ error: "Credential not found" }, { status: 404 });
        }

        // Upsert (update if exists, create if not)
        const item = await prisma.borrowableItem.upsert({
            where: {
                itemCode,
            },
            update: {
                itemName,
                totalStock,
            },
            create: {
                itemCode,
                itemName,
                totalStock,
            },
        });

        return NextResponse.json(item);
    } catch (error: any) {
        console.error("[peminjaman/items] POST Error:", error);
        return NextResponse.json({ error: error.message || "Failed to add item" }, { status: 500 });
    }
}

// DELETE — Remove item from borrowable list
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    try {
        const item = await prisma.borrowableItem.findFirst({
            where: { id },
        });
        if (!item) {
            return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }

        await prisma.borrowableItem.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[peminjaman/items] DELETE Error:", error);
        return NextResponse.json({ error: error.message || "Failed to delete item" }, { status: 500 });
    }
}
