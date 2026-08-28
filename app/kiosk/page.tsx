"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Stack,
  Title,
  Text,
  Card,
  Group,
  ThemeIcon,
  SimpleGrid,
  Center,
  Loader,
  Box,
  Badge,
  rem,
  Transition,
  ActionIcon,
} from "@mantine/core";
import {
  IconBuildingStore,
  IconArrowRight,
  IconScan,
  IconShoppingCart,
  IconUserCheck,
  IconArrowLeft,
  IconClipboardList,
  IconMaximize,
  IconMinimize,
} from "@tabler/icons-react";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
  host: string | null;
}

export default function KioskHomePage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCredential, setSelectedCredential] =
    useState<Credential | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const firstStationCardRef = useRef<HTMLDivElement>(null);
  const firstModeCardRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch("/api/credentials");
      if (response.ok) {
        const data = await response.json();
        setCredentials(data);

        // Auto-select if only one credential (show mode selection directly)
        if (data.length === 1) {
          setSelectedCredential(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch credentials", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  useEffect(() => {
    if (loading || credentials.length === 0) return;

    const timer = window.setTimeout(() => {
      if (selectedCredential) {
        firstModeCardRef.current?.focus();
      } else {
        firstStationCardRef.current?.focus();
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [credentials.length, loading, selectedCredential]);

  useEffect(() => {
    if (loading || credentials.length === 0) return;

    const isFormControl = (element: Element | null) =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement;

    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isFormControl(document.activeElement)
      ) {
        return;
      }

      if (selectedCredential) {
        if (event.key === "Enter" && document.activeElement === document.body) {
          event.preventDefault();
          router.push(`/kiosk/${selectedCredential.id}`);
          return;
        }

        if (event.key === "1") {
          event.preventDefault();
          router.push(`/kiosk/${selectedCredential.id}`);
          return;
        }

        if (event.key === "2") {
          event.preventDefault();
          router.push(`/kiosk/${selectedCredential.id}/peminjaman`);
          return;
        }

        if (event.key === "Escape" && credentials.length > 1) {
          event.preventDefault();
          setSelectedCredential(null);
        }
        return;
      }

      if (event.key === "Enter" && document.activeElement === document.body) {
        event.preventDefault();
        setSelectedCredential(credentials[0]);
        return;
      }

      const numericChoice = Number(event.key);
      if (
        Number.isInteger(numericChoice) &&
        numericChoice >= 1 &&
        numericChoice <= credentials.length
      ) {
        event.preventDefault();
        setSelectedCredential(credentials[numericChoice - 1]);
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [credentials, loading, router, selectedCredential]);

  if (loading) {
    return (
      <Center style={{ flex: 1, minHeight: "100vh" }}>
        <Stack align="center" gap="xl">
          <Box
            style={{
              width: 90,
              height: 90,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(56, 189, 248, 0.25), rgba(15, 23, 42, 0.1))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              boxShadow: "0 0 30px rgba(56, 189, 248, 0.35)",
              animation: "pulse 2.4s infinite",
            }}
          >
            <Loader size="lg" color="blue" />
          </Box>
          <Stack align="center" gap="xs">
            <Text c="white" size="xl" fw={600} className="kiosk-heading">
              {t.kiosk.loadingTitle}
            </Text>
            <Text c="rgba(255,255,255,0.6)" size="sm">
              {t.kiosk.loadingSubtitle}
            </Text>
          </Stack>
        </Stack>
      </Center>
    );
  }

  if (credentials.length === 0) {
    return (
      <Center style={{ flex: 1, minHeight: "100vh" }}>
        <Box
          p="xl"
          style={{
            background: "var(--kiosk-panel)",
            backdropFilter: "blur(24px)",
            borderRadius: rem(24),
            border: "1px solid var(--kiosk-stroke)",
            maxWidth: 520,
            width: "92%",
            textAlign: "center",
            boxShadow: "0 25px 70px rgba(5, 8, 16, 0.65)",
          }}
        >
          <Stack align="center" gap="xl" p="xl">
            <ThemeIcon
              size={110}
              radius="xl"
              variant="gradient"
              gradient={{ from: "red.6", to: "pink.7", deg: 135 }}
              style={{ boxShadow: "0 0 25px rgba(248, 113, 113, 0.45)" }}
            >
              <IconBuildingStore size={56} />
            </ThemeIcon>
            <Stack gap="sm">
              <Title order={2} c="white" className="kiosk-heading">
                {language === "id"
                  ? "Belum Ada Akun Tersinkron"
                  : "No Synced Account Yet"}
              </Title>
              <Text c="rgba(255,255,255,0.65)" size="lg">
                {language === "id"
                  ? "Konfigurasikan akun Accurate di dasbor untuk mengaktifkan kiosk ini."
                  : "Configure your Accurate account in the dashboard to enable this kiosk."}
              </Text>
            </Stack>
          </Stack>
        </Box>
      </Center>
    );
  }

  // Mode selection screen
  if (selectedCredential) {
    const modes = [
      {
        id: "checkout",
        icon: <IconShoppingCart size={40} />,
        gradient: { from: "cyan.4", to: "indigo.6", deg: 135 },
        glowColor: "rgba(56, 189, 248, 0.45)",
        title: language === "id" ? "Pengambilan" : "Pickup",
        description:
          language === "id"
            ? "Scan barang untuk pengambilan inventaris. Barang akan dikurangi dari stok Accurate."
            : "Scan items for pickup. Items will be deducted from Accurate stock.",
        onClick: () => router.push(`/kiosk/${selectedCredential.id}`),
      },
      {
        id: "peminjaman",
        icon: <IconClipboardList size={40} />,
        gradient: { from: "violet.5", to: "grape.7", deg: 135 },
        glowColor: "rgba(167, 139, 250, 0.45)",
        title: language === "id" ? "Peminjaman" : "Borrowing",
        description:
          language === "id"
            ? "Pinjam dan kembalikan barang. Sistem otomatis mendeteksi barang yang belum dikembalikan."
            : "Borrow and return items. System auto-detects unreturned items.",
        onClick: () =>
          router.push(`/kiosk/${selectedCredential.id}/peminjaman`),
      },
    ];

    return (
      <Box
        p={{ base: "md", sm: "xl" }}
        style={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Group justify="space-between" mb="md">
          {credentials.length > 1 && (
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={
                language === "id"
                  ? "Kembali ke pilih stasiun"
                  : "Back to station selection"
              }
              onClick={() => setSelectedCredential(null)}
              aria-label={language === "id" ? "Kembali" : "Back"}
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
          )}
          <Box style={{ flex: 1 }} />
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={
                isFullscreen ? t.kiosk.exitFullscreen : t.kiosk.fullscreen
              }
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? (language === "id" ? "Keluar layar penuh" : "Exit fullscreen") : (language === "id" ? "Layar penuh" : "Fullscreen")}
              style={{
                background: "rgba(12, 18, 32, 0.85)",
                border: "1px solid rgba(148, 163, 184, 0.15)",
              }}
            >
              {isFullscreen ? (
                <IconMinimize size={18} />
              ) : (
                <IconMaximize size={18} />
              )}
            </ActionIcon>
            <LanguageSelect size="xs" />
          </Group>
        </Group>

        <Center style={{ flex: 1 }}>
          <Stack align="center" gap="xl" maw={700}>
            {/* Header */}
            <Stack align="center" gap="md" ta="center">
              <Box
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  background:
                    "linear-gradient(135deg, rgba(56, 189, 248, 0.35) 0%, rgba(167, 139, 250, 0.35) 100%)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  boxShadow: "0 0 30px rgba(56, 189, 248, 0.25)",
                }}
              >
                <IconBuildingStore size={36} color="white" />
              </Box>
              <Title
                order={1}
                c="white"
                fw={800}
                style={{ fontSize: rem(36), lineHeight: 1.1 }}
              >
                {language === "id" ? "Pilih Mode" : "Select Mode"}
              </Title>
              <Text c="rgba(255,255,255,0.6)" size="lg">
                {selectedCredential.appKey}
                {selectedCredential.host ? ` • ${selectedCredential.host}` : ""}
              </Text>
              <Text c="rgba(255,255,255,0.48)" size="sm">
                {language === "id"
                  ? "Gunakan Tab lalu Enter, atau tekan 1 untuk Pengambilan dan 2 untuk Peminjaman."
                  : "Use Tab then Enter, or press 1 for Pickup and 2 for Borrowing."}
              </Text>
            </Stack>

            {/* Mode Cards */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" w="100%">
              {modes.map((mode) => (
                <Card
                  key={mode.id}
                  ref={mode.id === "checkout" ? firstModeCardRef : undefined}
                  shadow="xl"
                  padding="xl"
                  radius="xl"
                  style={{
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    background: "var(--kiosk-panel)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid var(--kiosk-stroke)",
                    boxShadow: "0 20px 40px rgba(4, 8, 16, 0.45)",
                    minHeight: 220,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${language === "id" ? "Pilih mode" : "Select mode"}: ${mode.id === "checkout" ? "1" : "2"}. ${mode.title}`}
                  onClick={mode.onClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      mode.onClick();
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform =
                      "translateY(-8px) scale(1.02)";
                    e.currentTarget.style.boxShadow = `0 30px 70px rgba(2, 8, 20, 0.75), 0 0 40px ${mode.glowColor}`;
                    e.currentTarget.style.borderColor = mode.glowColor.replace(
                      "0.45",
                      "0.6",
                    );
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                    e.currentTarget.style.boxShadow = "";
                    e.currentTarget.style.borderColor = "var(--kiosk-stroke)";
                  }}
                >
                  <Stack gap="lg" h="100%" justify="space-between">
                    <Stack gap="md">
                      <ThemeIcon
                        size={72}
                        radius="xl"
                        variant="gradient"
                        gradient={mode.gradient}
                        style={{ boxShadow: `0 0 25px ${mode.glowColor}` }}
                      >
                        {mode.icon}
                      </ThemeIcon>
                      <Stack gap="xs">
                        <Text c="white" fw={700} size="xl">
                          {mode.id === "checkout" ? "1. " : "2. "}
                          {mode.title}
                        </Text>
                        <Text c="rgba(255,255,255,0.55)" size="sm" lh={1.5}>
                          {mode.description}
                        </Text>
                      </Stack>
                    </Stack>
                    <Group
                      gap="xs"
                      style={{ color: "rgba(255, 255, 255, 0.65)" }}
                    >
                      <Text size="sm" fw={500}>
                        {language === "id" ? "Mulai →" : "Start →"}
                      </Text>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Center>

        {/* Footer */}
        <Group justify="center" py="lg">
          <Text c="rgba(255,255,255,0.45)" size="xs">
            {language === "id" ? "Ditenagai oleh" : "Powered by"}{" "}
            <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
              Exima
            </span>{" "}
            •{" "}
            {language === "id" ? "Integrasi Accurate" : "Accurate Integration"}
          </Text>
        </Group>
      </Box>
    );
  }

  const features = [
    {
      icon: <IconScan size={20} />,
      title: language === "id" ? "Scan Identitas" : "Scan Identity",
      description:
        language === "id"
          ? "Autentikasi dengan kartu staf"
          : "Authenticate with staff badge",
    },
    {
      icon: <IconShoppingCart size={20} />,
      title: t.kiosk.scanProduct,
      description: t.kiosk.scanDescription,
    },
    {
      icon: <IconUserCheck size={20} />,
      title: language === "id" ? "Konfirmasi & Checkout" : "Confirm & Checkout",
      description:
        language === "id"
          ? "Tinjau barang lalu selesaikan checkout"
          : "Review items then complete checkout",
    },
  ];

  return (
    <Box
      p={{ base: "md", sm: "xl" }}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
      <Group justify="flex-end" mb="md">
        <LanguageSelect size="xs" />
      </Group>

      {/* Header */}
      <Stack align="center" gap="xl" py="xl">
        {/* Logo */}
        <Group gap="sm">
          <Box
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background:
                "linear-gradient(135deg, rgba(56, 189, 248, 0.35) 0%, rgba(167, 139, 250, 0.35) 100%)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              boxShadow: "0 0 30px rgba(56, 189, 248, 0.35)",
            }}
          >
            <IconBuildingStore size={30} color="white" />
          </Box>
          <Stack gap={0}>
            <Text
              size="xl"
              fw={700}
              style={{
                background: "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
              className="kiosk-heading"
            >
              Exima Kiosk
            </Text>
            <Text size="xs" c="rgba(255,255,255,0.5)" fw={500}>
              {language === "id"
                ? "Terminal Pengambilan & Peminjaman"
                : "Pickup & Borrowing Terminal"}
            </Text>
          </Stack>
        </Group>

        {/* Tagline */}
        <Stack align="center" gap="md" maw={600} ta="center">
          <Title
            order={1}
            c="white"
            fw={800}
            style={{ fontSize: rem(42), lineHeight: 1.1 }}
          >
            {language === "id" ? "Tanpa Hambatan" : "Seamless"}
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {language === "id" ? "Pengalaman Kiosk" : "Kiosk Experience"}
            </span>
          </Title>
          <Text c="rgba(255,255,255,0.6)" size="lg">
            {language === "id"
              ? "Pilih profil stasiun untuk memulai."
              : "Select a station profile to get started."}
          </Text>
          <Text c="rgba(255,255,255,0.48)" size="sm">
            {language === "id"
              ? "Gunakan Tab lalu Enter, atau tekan nomor stasiun."
              : "Use Tab then Enter, or press a station number."}
          </Text>
        </Stack>

        {/* Features */}
        <Group gap="xl" mt="md" justify="center" wrap="wrap">
          {features.map((feature, idx) => (
            <Group key={idx} gap="sm" style={{ opacity: 0.9 }}>
              <ThemeIcon
                size={36}
                radius="md"
                variant="light"
                style={{
                  backgroundColor: "rgba(56, 189, 248, 0.15)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                }}
              >
                {feature.icon}
              </ThemeIcon>
              <Stack gap={0}>
                <Text c="white" fw={600} size="sm">
                  {feature.title}
                </Text>
                <Text c="rgba(255,255,255,0.55)" size="xs">
                  {feature.description}
                </Text>
              </Stack>
            </Group>
          ))}
        </Group>
      </Stack>

      {/* Account Cards */}
      <Box style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <SimpleGrid
          cols={{ base: 1, sm: 2, md: 3 }}
          spacing="lg"
          style={{ width: "100%", maxWidth: 1000, margin: "0 auto" }}
        >
          {credentials.map((cred, index) => (
            <Card
              key={cred.id}
              ref={index === 0 ? firstStationCardRef : undefined}
              shadow="xl"
              padding="xl"
              radius="xl"
              style={{
                cursor: "pointer",
                transition: "all 0.3s ease",
                background: "var(--kiosk-panel)",
                backdropFilter: "blur(24px)",
                border: "1px solid var(--kiosk-stroke)",
                animationDelay: `${index * 100}ms`,
                boxShadow: "0 20px 40px rgba(4, 8, 16, 0.45)",
              }}
              role="button"
              tabIndex={0}
              aria-label={`${language === "id" ? "Pilih stasiun" : "Select station"}: ${index + 1}. ${cred.appKey}`}
              onClick={() => setSelectedCredential(cred)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCredential(cred);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform =
                  "translateY(-8px) scale(1.02)";
                e.currentTarget.style.boxShadow =
                  "0 30px 70px rgba(2, 8, 20, 0.75)";
                e.currentTarget.style.borderColor = "rgba(56, 189, 248, 0.5)";
                e.currentTarget.style.background =
                  "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(12, 18, 32, 0.9) 100%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "";
                e.currentTarget.style.borderColor = "var(--kiosk-stroke)";
                e.currentTarget.style.background = "var(--kiosk-panel)";
              }}
            >
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <ThemeIcon
                    size={52}
                    radius="xl"
                    variant="gradient"
                    gradient={{ from: "cyan.4", to: "indigo.6", deg: 135 }}
                    style={{ boxShadow: "0 0 20px rgba(56, 189, 248, 0.45)" }}
                  >
                    <IconBuildingStore size={26} />
                  </ThemeIcon>
                  <Badge
                    variant="light"
                    color="green"
                    size="sm"
                    style={{
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                    }}
                  >
                    {language === "id" ? "Aktif" : "Active"}
                  </Badge>
                </Group>

                <Stack gap="xs">
                  <Text c="white" fw={700} size="lg">
                    {index + 1}. {cred.appKey}
                  </Text>
                  <Text c="rgba(255,255,255,0.55)" size="sm">
                    {cred.host ||
                      (language === "id"
                        ? "Belum dikonfigurasi"
                        : "Not configured")}
                  </Text>
                </Stack>

                <Group
                  gap="xs"
                  style={{
                    marginTop: "auto",
                    color: "rgba(255, 255, 255, 0.65)",
                  }}
                >
                  <Text size="sm" fw={500}>
                    {language === "id" ? "Pilih Stasiun" : "Select Station"}
                  </Text>
                  <IconArrowRight size={16} />
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Box>

      {/* Footer */}
      <Group justify="center" py="lg">
        <Text c="rgba(255,255,255,0.45)" size="xs">
          {language === "id" ? "Ditenagai oleh" : "Powered by"}{" "}
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            Exima
          </span>{" "}
          • {language === "id" ? "Integrasi Accurate" : "Accurate Integration"}
        </Text>
      </Group>

      {/* Animation styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.8; transform: scale(1.05); }
                    }
                `,
        }}
      />
    </Box>
  );
}
