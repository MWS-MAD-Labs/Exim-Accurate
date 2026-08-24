import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { canAccessResourceManagement } from "@/lib/access-control";
import { listWarehouses } from "@/lib/accurate/pos";
import { getResourceCredential } from "@/lib/credential-access";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessResourceManagement(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const credentialId = new URL(req.url).searchParams.get("credentialId");
    if (!credentialId) {
        return NextResponse.json({ error: "Credential is required" }, { status: 400 });
    }

    const credential = await getResourceCredential(
        session.user.id,
        session.user.role,
        credentialId,
    );
    if (!credential || !credential.host || !credential.session) {
        return NextResponse.json({ error: "Credential unavailable" }, { status: 404 });
    }

    try {
        const warehouses = await listWarehouses({
            apiToken: credential.apiToken,
            signatureSecret: credential.signatureSecret,
            host: credential.host,
            session: credential.session,
        });
        return NextResponse.json(warehouses);
    } catch (error) {
        console.error("[peminjaman/settings/warehouses] Failed to load warehouses", error);
        return NextResponse.json({ error: "Unable to load warehouses" }, { status: 502 });
    }
}
