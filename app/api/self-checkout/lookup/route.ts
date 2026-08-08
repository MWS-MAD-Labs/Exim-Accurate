"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findItemByCode } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { getResourceCredential } from "@/lib/credential-access";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const credentialId = searchParams.get("credentialId");

    if (!code) {
        return NextResponse.json({ error: "Kode barang wajib diisi" }, { status: 400 });
    }

    if (!credentialId) {
        return NextResponse.json({ error: "ID kredensial wajib diisi" }, { status: 400 });
    }

    try {
        // Get credentials
        let credential = await getResourceCredential(session.user.role, credentialId);

        if (!credential) {
            return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 404 });
        }

        // Ensure we have a valid session
        if (!credential.session || !credential.host) {
            // Try to refresh session
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
                    // If session refresh fails, try token refresh first
                    if (credential.refreshToken) {
                        const appKey = credential.appKey;
                        const signatureSecret = credential.signatureSecret;
                        const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(
                            credential.refreshToken,
                            appKey,
                            signatureSecret
                        );

                        // Update token and try session again
                        credential = await prisma.accurateCredentials.update({
                            where: { id: credential.id },
                            data: {
                                apiToken: accessToken,
                                refreshToken: newRefreshToken || credential.refreshToken,
                            },
                        });

                        // Now try to get session again
                        const { host, session: newSession } = await refreshSession(
                            accessToken,
                            credential.dbId!
                        );
                        credential = await prisma.accurateCredentials.update({
                            where: { id: credential.id },
                            data: { host, session: newSession },
                        });
                    } else {
                        throw new Error("Sesi kedaluwarsa. Silakan hubungkan ulang ke Accurate.");
                    }
                }
            } else {
                return NextResponse.json(
                    { error: "Kredensial belum dikonfigurasi lengkap. Silakan hubungkan ulang ke Accurate." },
                    { status: 400 }
                );
            }
        }

        // Search for item by code (with 401 retry)
        let item;
        try {
            item = await findItemByCode(
                {
                    apiToken: credential.apiToken,
                    signatureSecret: credential.signatureSecret,
                    host: credential.host!,
                    session: credential.session!,
                },
                code
            );
        } catch (lookupErr: any) {
            // If 401, try refreshing token and retry once
            if (lookupErr.message?.includes("401") && credential.refreshToken) {
                console.log("[self-checkout/lookup] Token expired, refreshing...");
                const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(
                    credential.refreshToken,
                    credential.appKey,
                    credential.signatureSecret
                );

                credential = await prisma.accurateCredentials.update({
                    where: { id: credential.id },
                    data: {
                        apiToken: accessToken,
                        refreshToken: newRefreshToken || credential.refreshToken,
                    },
                });

                // Also refresh session
                if (credential.dbId) {
                    const { host, session: newSession } = await refreshSession(
                        accessToken,
                        credential.dbId
                    );
                    credential = await prisma.accurateCredentials.update({
                        where: { id: credential.id },
                        data: { host, session: newSession },
                    });
                }

                // Retry lookup
                item = await findItemByCode(
                    {
                        apiToken: credential.apiToken,
                        signatureSecret: credential.signatureSecret,
                        host: credential.host!,
                        session: credential.session!,
                    },
                    code
                );
            } else {
                throw lookupErr;
            }
        }

        if (!item) {
            return NextResponse.json({ error: "Barang tidak ditemukan", code }, { status: 404 });
        }

        return NextResponse.json({
            itemCode: item.no,
            itemName: item.name,
            itemId: item.id,
        });
    } catch (error: any) {
        console.error("[self-checkout/lookup] Error:", error);
        return NextResponse.json(
            { error: error.message || "Gagal mencari barang" },
            { status: 500 }
        );
    }
}
