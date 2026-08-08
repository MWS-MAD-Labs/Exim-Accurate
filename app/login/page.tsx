"use client";

import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Container,
  Stack,
  Alert,
  Box,
  Text,
  Group,
  ThemeIcon,
  Divider,
  Anchor,
  useMantineColorScheme,
  rem,
} from "@mantine/core";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { getRoleHome } from "@/lib/access-control";
import { useRouter } from "next/navigation";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { useLanguage } from "@/lib/language";
import {
  IconAlertCircle,
  IconShield,
  IconPlugConnected,
  IconFileExport,
  IconFileImport,
  IconCheck,
  IconArrowRight,
} from "@tabler/icons-react";

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const features = [
    {
      icon: <IconFileExport size={20} />,
      title: t.login.features.export.title,
      description: t.login.features.export.description,
    },
    {
      icon: <IconFileImport size={20} />,
      title: t.login.features.import.title,
      description: t.login.features.import.description,
    },
    {
      icon: <IconPlugConnected size={20} />,
      title: t.login.features.oauth.title,
      description: t.login.features.oauth.description,
    },
    {
      icon: <IconShield size={20} />,
      title: t.login.features.security.title,
      description: t.login.features.security.description,
    },
  ];

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t.login.errorInvalid);
      } else {
        const session = await getSession();
        router.push(getRoleHome(session?.user?.role));
        router.refresh();
      }
    } catch (err) {
      setError(t.login.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        background: isDark
          ? "var(--mantine-color-dark-8)"
          : "var(--mantine-color-gray-0)",
      }}
    >
      {/* Left Side - Branding */}
      <Box
        visibleFrom="md"
        style={{
          flex: 1,
          background:
            "linear-gradient(135deg, #228BE6 0%, #1C7ED6 50%, #1971C2 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: rem(60),
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background decorations */}
        <Box
          style={{
            position: "absolute",
            top: "-20%",
            right: "-20%",
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            filter: "blur(60px)",
          }}
        />
        <Box
          style={{
            position: "absolute",
            bottom: "-10%",
            left: "-10%",
            width: "40%",
            height: "40%",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.08)",
            filter: "blur(40px)",
          }}
        />

        <Stack gap="xl" style={{ position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <Group gap="sm">
            <Box
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: 24,
              }}
            >
              E
            </Box>
            <Text size="xl" fw={700} c="white">
              Exima
            </Text>
          </Group>

          {/* Tagline */}
          <Stack gap="sm">
            <Title order={2} c="white" fw={700} style={{ fontSize: rem(36) }}>
              {t.login.branding.title}
            </Title>
            <Text c="rgba(255, 255, 255, 0.8)" size="lg" maw={400}>
              {t.login.branding.description}
            </Text>
          </Stack>

          {/* Features */}
          <Stack gap="md" mt="xl">
            {features.map((feature) => (
              <Group key={feature.title} gap="md">
                <ThemeIcon
                  size={44}
                  radius="md"
                  variant="light"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.15)",
                    color: "white",
                  }}
                >
                  {feature.icon}
                </ThemeIcon>
                <Stack gap={2}>
                  <Text c="white" fw={600} size="sm">
                    {feature.title}
                  </Text>
                  <Text c="rgba(255, 255, 255, 0.7)" size="xs">
                    {feature.description}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>

          {/* Trust badges */}
          <Group gap="lg" mt="xl">
            <Group gap="xs">
              <IconCheck size={16} color="rgba(255, 255, 255, 0.8)" />
              <Text size="xs" c="rgba(255, 255, 255, 0.8)">
                {t.home.benefits.free.split(",")[0]}
              </Text>
            </Group>
            <Group gap="xs">
              <IconCheck size={16} color="rgba(255, 255, 255, 0.8)" />
              <Text size="xs" c="rgba(255, 255, 255, 0.8)">
                {t.common.selfHost}
              </Text>
            </Group>
            <Group gap="xs">
              <IconCheck size={16} color="rgba(255, 255, 255, 0.8)" />
              <Text size="xs" c="rgba(255, 255, 255, 0.8)">
                {t.common.free.split(" · ")[1]}
              </Text>
            </Group>
          </Group>
        </Stack>
      </Box>

      {/* Right Side - Login Form */}
      <Box
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: rem(24),
        }}
      >
        <Container size={420} w="100%">
          <Stack gap="xl">
            <Group justify="flex-end">
              <LanguageSelect />
            </Group>

            {/* Mobile Logo */}
            <Group gap="sm" hiddenFrom="md" justify="center">
              <Box
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background:
                    "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 20,
                }}
              >
                E
              </Box>
              <Text
                size="xl"
                fw={700}
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #74C0FC 0%, #A5D8FF 100%)"
                    : "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Exima
              </Text>
            </Group>

            {/* Header */}
            <Stack gap="xs" ta={{ base: "center", md: "left" }}>
              <Title order={2} fw={700}>
                {t.login.title}
              </Title>
              <Text c="dimmed" size="sm">
                {t.login.subtitle}
              </Text>
            </Stack>

            {/* Form */}
            <Paper
              withBorder
              shadow="md"
              p="xl"
              radius="lg"
              style={{
                backgroundColor: isDark
                  ? "var(--mantine-color-dark-7)"
                  : "white",
                border: isDark
                  ? "1px solid var(--mantine-color-dark-4)"
                  : "1px solid var(--mantine-color-gray-2)",
              }}
            >
              <form onSubmit={handleSubmit}>
                <Stack gap="md">
                  {error && (
                    <Alert
                      icon={<IconAlertCircle size={16} />}
                      title={t.login.errorTitle}
                      color="red"
                      variant="light"
                      radius="md"
                    >
                      {error}
                    </Alert>
                  )}

                  <TextInput
                    label={t.login.email}
                    placeholder={t.login.placeholderEmail}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    size="md"
                    radius="md"
                    styles={{
                      label: {
                        marginBottom: 6,
                        fontWeight: 500,
                      },
                    }}
                  />

                  <PasswordInput
                    label={t.login.password}
                    placeholder={t.login.placeholderPassword}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    size="md"
                    radius="md"
                    styles={{
                      label: {
                        marginBottom: 6,
                        fontWeight: 500,
                      },
                    }}
                  />

                  <Group justify="flex-end">
                    <Anchor
                      component="button"
                      type="button"
                      c="brand"
                      size="sm"
                      fw={500}
                    >
                      {t.login.forgotPassword}
                    </Anchor>
                  </Group>

                  <Button
                    type="submit"
                    fullWidth
                    loading={loading}
                    size="md"
                    radius="md"
                    rightSection={!loading && <IconArrowRight size={18} />}
                    style={{
                      background:
                        "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
                      boxShadow: "0 4px 14px rgba(34, 139, 230, 0.3)",
                      transition: "all 0.2s ease",
                    }}
                    styles={{
                      root: {
                        "&:hover": {
                          boxShadow: "0 6px 20px rgba(34, 139, 230, 0.4)",
                        },
                      },
                    }}
                  >
                    {loading ? t.common.processing : t.login.submit}
                  </Button>
                </Stack>
              </form>
            </Paper>

            {/* Footer */}
            <Stack gap="md" align="center">
              <Divider
                label={t.login.or}
                labelPosition="center"
                w="100%"
                color={isDark ? "dark.4" : "gray.3"}
              />

              <Text size="sm" c="dimmed" ta="center">
                {t.login.noAccount}{" "}
                <Anchor
                  component="button"
                  type="button"
                  fw={600}
                  onClick={() => router.push("/register")}
                >
                  {t.login.register}
                </Anchor>
              </Text>

              <Group gap="xs" mt="sm">
                <Anchor size="xs" c="dimmed" href="/terms">
                  {t.login.terms}
                </Anchor>
              </Group>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
