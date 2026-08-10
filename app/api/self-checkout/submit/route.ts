"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveInventoryAdjustment } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { getResourceCredential } from "@/lib/credential-access";
import dayjs from "dayjs";

interface CheckoutItem {
    itemCode: string;
    itemName?: string;
    quantity: number;
}

interface CheckoutRequest {
    credentialId: string;
    staffEmail: string;
    items: CheckoutItem[];
}

// Parse staff name and department from email
function parseStaffInfo(email: string): { name: string; department: string } {
    // Example email formats:
    // firstname.lastname@company.com -> Name: Firstname Lastname
    // firstname.lastname.dept@company.com -> Name: Firstname Lastname, Dept: dept
    // firstname@dept.company.com -> Name: Firstname, Dept: dept

    const localPart = email.split("@")[0];
    const parts = localPart.split(".");

    // Capitalize first letter of each word
    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    if (parts.length >= 3) {
        // Assume last part might be department
        const department = capitalize(parts[parts.length - 1]);
        const nameParts = parts.slice(0, -1).map(capitalize);
        return { name: nameParts.join(" "), department };
    } else if (parts.length === 2) {
        // firstname.lastname format
        return { name: parts.map(capitalize).join(" "), department: "" };
    } else {
        return { name: capitalize(parts[0]), department: "" };
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
    }

    let body: CheckoutRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Body request tidak valid" }, { status: 400 });
    }

    const { credentialId, staffEmail, items } = body;

    if (!credentialId) {
        return NextResponse.json({ error: "ID kredensial wajib diisi" }, { status: 400 });
    }

    if (!staffEmail || !staffEmail.includes("@")) {
        return NextResponse.json({ error: "Email staf yang valid wajib diisi" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "Minimal satu barang wajib diisi" }, { status: 400 });
    }

    try {
        // Get credentials
        let credential = await getResourceCredential(session.user.id, session.user.role, credentialId);

        if (!credential) {
            return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 404 });
        }

        // Parse staff info from email
        const { name: staffName, department: staffDept } = parseStaffInfo(staffEmail);

        // Create checkout session in database
        const checkoutSession = await prisma.checkoutSession.create({
            data: {
                staffEmail,
                staffName,
                staffDept,
                credentialId,
                status: "pending",
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

        // Ensure we have a valid session
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
                } catch (sessionErr: any) {
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
                        await prisma.checkoutSession.update({
                            where: { id: checkoutSession.id },
                            data: { status: "failed", errorMessage: "Sesi kedaluwarsa" },
                        });
                        throw new Error("Sesi kedaluwarsa. Silakan hubungkan ulang ke Accurate.");
                    }
                }
            } else {
                await prisma.checkoutSession.update({
                    where: { id: checkoutSession.id },
                    data: { status: "failed", errorMessage: "Kredensial belum dikonfigurasi" },
                });
                return NextResponse.json(
                    { error: "Kredensial belum dikonfigurasi lengkap. Silakan hubungkan ulang ke Accurate." },
                    { status: 400 }
                );
            }
        }

        // Build description with staff info
        const descriptionParts = [`Self Checkout by ${staffName || staffEmail}`];
        if (staffDept) {
            descriptionParts.push(`Dept: ${staffDept}`);
        }
        descriptionParts.push(`Email: ${staffEmail}`);
        const description = descriptionParts.join(" | ");

        // Create inventory adjustment in Accurate (ADJUSTMENT_OUT = taking items out)
        const adjustmentData = {
            transDate: dayjs().format("YYYY-MM-DD"),
            description,
            detailItem: items.map((item) => ({
                itemNo: item.itemCode,
                quantity: item.quantity,
                itemAdjustmentType: "ADJUSTMENT_OUT" as const,
            })),
        };

        console.log(
            `[self-checkout/submit] Creating adjustment with ${adjustmentData.detailItem.length} item lines`,
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

        // Update checkout session as completed
        await prisma.checkoutSession.update({
            where: { id: checkoutSession.id },
            data: {
                status: "completed",
                completedAt: new Date(),
                adjustmentId: result.id,
            },
        });

        return NextResponse.json({
            success: true,
            sessionId: checkoutSession.id,
            adjustmentId: result.id,
            adjustmentNumber: result.r,
            staffName,
            staffDept,
            itemCount: items.length,
        });
    } catch (error: any) {
        console.error("[self-checkout/submit] Error:", error);
        return NextResponse.json(
            { error: error.message || "Gagal mengirim checkout" },
            { status: 500 }
        );
    }
}
