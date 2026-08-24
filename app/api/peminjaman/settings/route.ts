import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { canAccessResourceManagement } from "@/lib/access-control";
import { listWarehouses } from "@/lib/accurate/pos";
import { getResourceCredential } from "@/lib/credential-access";
import { getOrganizationIdForUser } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

const schema = z.object({
    credentialId: z.string().uuid(),
    warehouseId: z.number().int().positive(),
    warehouseName: z.string().trim().min(1),
});

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessResourceManagement(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = await getOrganizationIdForUser(session.user.id);
    if (!organizationId) {
        return NextResponse.json({ error: "Organization not found" }, { status: 403 });
    }

    const settings = await prisma.resourceSettings.findUnique({
        where: { organizationId },
        select: { warehouseId: true, warehouseName: true, updatedAt: true },
    });

    return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessResourceManagement(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid resource warehouse settings" }, { status: 400 });
    }

    const { credentialId, warehouseId, warehouseName } = parsed.data;
    const credential = await getResourceCredential(
        session.user.id,
        session.user.role,
        credentialId,
    );
    if (!credential) {
        return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    if (!credential.host || !credential.session) {
        return NextResponse.json({ error: "Accurate session is not ready" }, { status: 409 });
    }

    try {
        const warehouses = await listWarehouses({
            apiToken: credential.apiToken,
            signatureSecret: credential.signatureSecret,
            host: credential.host,
            session: credential.session,
        });
        const warehouse = warehouses.find(
            (candidate) => candidate.id === warehouseId && candidate.name === warehouseName,
        );
        if (!warehouse) {
            return NextResponse.json(
                { error: "Warehouse is not valid for this Accurate connection" },
                { status: 409 },
            );
        }

        const settings = await prisma.resourceSettings.upsert({
            where: { organizationId: credential.organizationId },
            update: { warehouseId, warehouseName },
            create: {
                organizationId: credential.organizationId,
                warehouseId,
                warehouseName,
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error("[peminjaman/settings] Failed to save warehouse", error);
        return NextResponse.json({ error: "Unable to validate Accurate warehouse" }, { status: 502 });
    }
}
