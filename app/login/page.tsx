"use client";

import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowRight,
  IconBuildingCommunity,
  IconLock,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { LanguageSelect } from "@/components/ui/LanguageSelect";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Akun Anda belum memiliki akses Exima atau proses SSO gagal.",
  sso: "Proses masuk melalui MWS Hub gagal. Silakan coba lagi.",
  revoked: "Sesi Anda telah berakhir. Silakan masuk kembali melalui MWS Hub.",
  UPSTREAM_UNREACHABLE: "MWS Hub atau Central sedang tidak dapat dihubungi. Coba lagi sebentar lagi.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [loading, setLoading] = useState(false);
  const error = searchParams.get("error");

  const handleSignIn = () => {
    setLoading(true);
    router.push("/auth/hub");
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          colorScheme === "dark"
            ? "radial-gradient(circle at 15% 15%, #17324d 0, #141517 42%, #101113 100%)"
            : "radial-gradient(circle at 15% 15%, #dff3ff 0, #f7f9fc 42%, #eef2f7 100%)",
      }}
    >
      <Container size={520} w="100%">
        <Stack gap="lg">
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon size={44} radius="md" variant="gradient" gradient={{ from: "blue", to: "cyan" }}>
                <IconBuildingCommunity size={24} />
              </ThemeIcon>
              <Box>
                <Text fw={800} size="xl">Exima</Text>
                <Text size="xs" c="dimmed">MWS inventory and operations</Text>
              </Box>
            </Group>
            <LanguageSelect />
          </Group>

          <Paper withBorder shadow="xl" radius="xl" p={{ base: "xl", sm: 36 }}>
            <Stack gap="xl">
              <Stack gap="xs">
                <Text size="xs" tt="uppercase" fw={700} c="blue">Central sign-in</Text>
                <Title order={1} fz={{ base: 30, sm: 38 }} lh={1.1}>
                  Masuk melalui MWS Hub
                </Title>
                <Text c="dimmed">
                  Identitas diverifikasi oleh MWS Hub dan Central Data Center. Hak akses fitur tetap mengikuti akun Exima yang sudah diprovisikan.
                </Text>
              </Stack>

              {error && (
                <Alert icon={<IconAlertCircle size={18} />} color="red" title="Tidak dapat masuk">
                  {errorMessages[error] || errorMessages.sso}
                </Alert>
              )}

              <Stack gap="sm">
                <Group wrap="nowrap" align="flex-start">
                  <ThemeIcon variant="light" color="blue" radius="xl"><IconShieldCheck size={18} /></ThemeIcon>
                  <Box>
                    <Text fw={600} size="sm">Satu identitas MWS</Text>
                    <Text size="xs" c="dimmed">Gunakan akun organisasi yang terdaftar dan aktif di Central.</Text>
                  </Box>
                </Group>
                <Group wrap="nowrap" align="flex-start">
                  <ThemeIcon variant="light" color="teal" radius="xl"><IconLock size={18} /></ThemeIcon>
                  <Box>
                    <Text fw={600} size="sm">Token tidak masuk ke browser</Text>
                    <Text size="xs" c="dimmed">Exima menukar kode sekali pakai dengan Hub melalui koneksi server-to-server.</Text>
                  </Box>
                </Group>
              </Stack>

              <Button
                size="lg"
                radius="md"
                loading={loading}
                rightSection={!loading && <IconArrowRight size={19} />}
                onClick={handleSignIn}
              >
                Lanjutkan ke MWS Hub
              </Button>

              <Text size="xs" c="dimmed" ta="center">
                Akun baru tidak dibuat otomatis. Hub mengautentikasi identitas, sedangkan administrator Exima menentukan organisasi dan role aplikasi.
              </Text>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
