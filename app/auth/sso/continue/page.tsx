"use client";

import { Alert, Center, Loader, Stack, Text } from "@mantine/core";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SsoCallback() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code || !state) return;
    void signIn("hub-sso", { code, state, callbackUrl: "/auth/sso/complete" }).catch(() => setFailed(true));
  }, [code, state]);

  return (
    <Center mih="100vh" p="xl">
      <Stack align="center">
        {!code || !state || failed ? (
          <Alert color="red" title="SSO gagal">
            Kode masuk tidak tersedia atau sudah tidak valid. Kembali ke halaman login dan coba lagi.
          </Alert>
        ) : (
          <><Loader /><Text c="dimmed">Memverifikasi identitas MWS...</Text></>
        )}
      </Stack>
    </Center>
  );
}

export default function SsoContinuePage() {
  return <Suspense fallback={null}><SsoCallback /></Suspense>;
}
