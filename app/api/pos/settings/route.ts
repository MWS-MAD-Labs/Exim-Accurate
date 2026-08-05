import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listWarehouses } from "@/lib/accurate/pos";
import { getOwnedCredential, isAdmin } from "@/lib/pos-server";
import { z } from "zod";

const schema = z.object({ credentialId: z.string().uuid(), warehouseId: z.number().int().positive(), warehouseName: z.string().trim().min(1) });

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await prisma.posSettings.findMany({ where: { userId: session.user.id }, select: { id: true, credentialId: true, warehouseId: true, warehouseName: true, updatedAt: true } });
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const { credentialId, warehouseId, warehouseName } = parsed.data;
  const credential = await getOwnedCredential(session.user.id, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!credential.host || !credential.session) return NextResponse.json({ error: "Accurate session is not ready" }, { status: 409 });
  try {
    const warehouses = await listWarehouses({ apiToken: credential.apiToken, signatureSecret: credential.signatureSecret, host: credential.host, session: credential.session });
    const warehouse = warehouses.find((candidate) => candidate.id === warehouseId && candidate.name === warehouseName);
    if (!warehouse) return NextResponse.json({ error: "Warehouse is not valid for this credential" }, { status: 409 });
    const settings = await prisma.posSettings.upsert({ where: { credentialId }, update: { warehouseId, warehouseName }, create: { userId: session.user.id, credentialId, warehouseId, warehouseName } });
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Unable to load Accurate warehouses" }, { status: 502 });
  }
}
