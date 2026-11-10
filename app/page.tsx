"use client";

import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Box,
  ThemeIcon,
  useMantineColorScheme,
  Anchor,
  Divider,
  rem,
} from "@mantine/core";
import {
  IconDownload,
  IconUpload,
  IconShield,
  IconPlugConnected,
  IconCheck,
  IconSparkles,
  IconRocket,
  IconBrandGithub,
  IconArrowsLeftRight,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { BrandMark } from "@/components/BrandMark";
import { useLanguage } from "@/lib/language";

export default function HomePage() {
  const router = useRouter();
  const { t } = useLanguage();

  const features = [
    {
      icon: <IconArrowsLeftRight size={28} />,
      title: t.home.features.bulk.title,
      description: t.home.features.bulk.description,
      color: "brand",
      gradient: "var(--sade-brand-gradient)",
    },
    {
      icon: <IconShield size={28} />,
      title: t.home.features.security.title,
      description: t.home.features.security.description,
      color: "accent",
      gradient: "var(--sade-gold-gradient)",
    },
    {
      icon: <IconPlugConnected size={28} />,
      title: t.home.features.workflow.title,
      description: t.home.features.workflow.description,
      color: "brand",
      gradient: "var(--sade-brand-gradient)",
    },
    {
      icon: <IconDeviceDesktop size={28} />,
      title: t.home.features.kiosk.title,
      description: t.home.features.kiosk.description,
      color: "teal",
      gradient: "linear-gradient(135deg, #8FA983 0%, #486142 100%)",
    },
  ];

  const benefits = [
    t.home.benefits.free,
    t.home.benefits.responsive,
    t.home.benefits.realtime,
    t.home.benefits.multiAccount,
    t.home.benefits.validation,
    t.home.benefits.exportFormat,
  ];

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const currentYear = new Date().getFullYear();

  return (
    <Box
      style={{
        minHeight: "100vh",
        background: isDark
          ? "linear-gradient(180deg, var(--mantine-color-dark-8) 0%, var(--mantine-color-dark-9) 100%)"
          : "linear-gradient(180deg, #FFFAF4 0%, #F5F2EC 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated background elements */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {/* Gradient orbs */}
        <Box
          style={{
            position: "absolute",
            top: "-20%",
            right: "-10%",
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: isDark
              ? "radial-gradient(circle, rgba(111, 139, 106, 0.16) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(111, 139, 106, 0.1) 0%, transparent 70%)",
            filter: "blur(40px)",
            animation: "float 20s ease-in-out infinite",
          }}
        />
        <Box
          style={{
            position: "absolute",
            bottom: "-10%",
            left: "-10%",
            width: "50%",
            height: "50%",
            borderRadius: "50%",
            background: isDark
              ? "radial-gradient(circle, rgba(214, 161, 58, 0.12) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(214, 161, 58, 0.08) 0%, transparent 70%)",
            filter: "blur(40px)",
            animation: "float 25s ease-in-out infinite reverse",
          }}
        />
        <Box
          style={{
            position: "absolute",
            top: "40%",
            left: "30%",
            width: "40%",
            height: "40%",
            borderRadius: "50%",
            background: isDark
              ? "radial-gradient(circle, rgba(72, 97, 66, 0.1) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(72, 97, 66, 0.06) 0%, transparent 70%)",
            filter: "blur(60px)",
            animation: "float 30s ease-in-out infinite",
          }}
        />
      </Box>

      {/* Navigation */}
      <Box
        component="header"
        py="md"
        style={{
          position: "relative",
          zIndex: 10,
          borderBottom: isDark
            ? "1px solid rgba(255, 255, 255, 0.1)"
            : "1px solid rgba(0, 0, 0, 0.05)",
          backdropFilter: "blur(10px)",
          backgroundColor: isDark
            ? "rgba(23, 30, 21, 0.8)"
            : "rgba(255, 250, 244, 0.86)",
        }}
      >
        <Container size="lg">
          <Group justify="space-between">
            <BrandMark />

            <Group gap="sm">
              <LanguageSelect />
              <ThemeToggle />
              <Button
                variant="subtle"
                size="sm"
                onClick={() => router.push("/terms")}
              >
                {t.common.terms}
              </Button>
            </Group>
          </Group>
        </Container>
      </Box>

      {/* Hero Section */}
      <Container
        size="lg"
        py={{ base: 60, md: 100 }}
        style={{ position: "relative", zIndex: 1 }}
      >
        <Stack gap="xl" align="center">
          {/* Badge */}
          <Badge
            size="lg"
            variant="light"
            color="brand"
            leftSection={<IconSparkles size={14} />}
            style={{
              padding: "10px 16px",
              cursor: "default",
            }}
          >
            {t.common.free}
          </Badge>

          {/* Heading */}
          <Stack gap="md" align="center" maw={800} ta="center">
            <Title
              order={1}
              fz={{ base: 36, sm: 48, md: 56 }}
              fw={800}
              lh={1.1}
              style={{
                letterSpacing: "-0.02em",
              }}
            >
              {t.home.hero.title}{" "}
              <Text
                component="span"
                inherit
                style={{
                  background:
                    "linear-gradient(135deg, #6F8B6A 0%, #486142 60%, #D6A13A 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t.home.hero.titleHighlight}
              </Text>
            </Title>

            <Text size="xl" c="dimmed" maw={600} lh={1.6} ta="center" className="sade-quote">
              {t.home.hero.subtitle}
            </Text>
          </Stack>

          {/* CTA Buttons */}
          <Group gap="md" mt="md">
            <Button
              size="lg"
              radius="md"
              variant="outline"
              leftSection={<IconBrandGithub size={18} />}
              onClick={() =>
                window.open(
                  "https://github.com/faisalnh/Exim-Accurate",
                  "_blank",
                )
              }
            >
              {t.home.hero.viewGithub}
            </Button>
          </Group>

          {/* Social Proof */}
          <Group gap="xl" mt="xl" c="dimmed">
            <Group gap="xs">
              <IconCheck size={18} color="var(--mantine-color-green-6)" />
              <Text size="sm">{t.common.noCreditCard}</Text>
            </Group>
            <Group gap="xs">
              <IconCheck size={18} color="var(--mantine-color-green-6)" />
              <Text size="sm">{t.common.selfHost}</Text>
            </Group>
            <Group gap="xs">
              <IconCheck size={18} color="var(--mantine-color-green-6)" />
              <Text size="sm">{t.common.verified}</Text>
            </Group>
          </Group>
        </Stack>
      </Container>

      {/* Features Section */}
      <Container
        size="lg"
        py={{ base: 60, md: 80 }}
        style={{ position: "relative", zIndex: 1 }}
      >
        <Stack gap="xl">
          <Stack gap="sm" align="center" ta="center" mb="xl">
            <Badge size="md" variant="light" color="accent">
              {t.home.benefits.badge}
            </Badge>
            <Title order={2} fz={{ base: 28, md: 36 }}>
              {t.home.benefits.title}
            </Title>
            <Text c="dimmed" maw={500}>
              {t.home.benefits.description}
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {features.map((feature, index) => (
              <Card
                key={feature.title}
                padding="xl"
                radius="lg"
                style={{
                  border: isDark
                    ? "1px solid rgba(255, 255, 255, 0.1)"
                    : "1px solid rgba(0, 0, 0, 0.05)",
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.02)"
                    : "rgba(255, 250, 244, 0.82)",
                  backdropFilter: "blur(10px)",
                  transition: "all 0.3s ease",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = isDark
                    ? "0 20px 40px rgba(0, 0, 0, 0.3)"
                    : "0 20px 40px rgba(0, 0, 0, 0.1)";
                  e.currentTarget.style.borderColor = isDark
                    ? "rgba(255, 255, 255, 0.2)"
                    : "rgba(111, 139, 106, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "";
                  e.currentTarget.style.borderColor = isDark
                    ? "rgba(255, 255, 255, 0.1)"
                    : "rgba(0, 0, 0, 0.05)";
                }}
              >
                <Group align="flex-start" gap="md">
                  <ThemeIcon
                    size={56}
                    radius="xl"
                    variant="light"
                    color={feature.color}
                    style={{
                      backgroundColor: isDark
                        ? `var(--mantine-color-${feature.color}-9)`
                        : `var(--mantine-color-${feature.color}-0)`,
                    }}
                  >
                    {feature.icon}
                  </ThemeIcon>
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Title order={4} fw={600}>
                      {feature.title}
                    </Title>
                    <Text size="sm" c="dimmed" lh={1.6}>
                      {feature.description}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      {/* Benefits Section */}
      <Box
        py={{ base: 60, md: 80 }}
        style={{
          position: "relative",
          zIndex: 1,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.02)"
            : "rgba(0, 0, 0, 0.02)",
        }}
      >
        <Container size="lg">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="lg">
              <Badge size="md" variant="light" color="green" w="fit-content">
                {t.home.benefits.badge}
              </Badge>
              <Title order={2} fz={{ base: 28, md: 36 }}>
                {t.home.benefits.title}
              </Title>
              <Text c="dimmed" lh={1.7}>
                {t.home.benefits.description}
              </Text>

              <Stack gap="sm" mt="md">
                {benefits.map((benefit) => (
                  <Group key={benefit} gap="sm">
                    <ThemeIcon
                      size={24}
                      radius="xl"
                      color="green"
                      variant="light"
                    >
                      <IconCheck size={14} />
                    </ThemeIcon>
                    <Text size="sm">{benefit}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>

            <Box
              style={{
                position: "relative",
                padding: rem(20),
              }}
            >
              {/* Decorative card stack */}
              <Box
                style={{
                  position: "relative",
                  maxWidth: 400,
                  margin: "0 auto",
                }}
              >
                <Card
                  shadow="xl"
                  padding="xl"
                  radius="lg"
                  style={{
                    background: isDark
                      ? "linear-gradient(135deg, rgba(111, 139, 106, 0.12) 0%, rgba(214, 161, 58, 0.08) 100%)"
                      : "linear-gradient(135deg, rgba(111, 139, 106, 0.06) 0%, rgba(214, 161, 58, 0.05) 100%)",
                    border: isDark
                      ? "1px solid rgba(255, 255, 255, 0.1)"
                      : "1px solid rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Stack gap="md">
                    <Group>
                      <ThemeIcon
                        size={48}
                        radius="md"
                        style={{
                          background: "var(--sade-brand-gradient)",
                        }}
                      >
                        <IconRocket size={24} color="white" />
                      </ThemeIcon>
                      <Stack gap={0}>
                        <Text fw={600}>{t.home.setup.title}</Text>
                        <Text size="xs" c="dimmed">
                          {t.home.setup.subtitle}
                        </Text>
                      </Stack>
                    </Group>

                    <Divider />

                    <Stack gap="xs">
                      <Group gap="xs">
                        <Box
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--sade-brand-gradient)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text size="xs" c="white" fw={700}>
                            1
                          </Text>
                        </Box>
                        <Text size="sm">{t.home.setup.step1}</Text>
                      </Group>
                      <Group gap="xs">
                        <Box
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--sade-brand-gradient)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text size="xs" c="white" fw={700}>
                            2
                          </Text>
                        </Box>
                        <Text size="sm">{t.home.setup.step2}</Text>
                      </Group>
                      <Group gap="xs">
                        <Box
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--sade-brand-gradient)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text size="xs" c="white" fw={700}>
                            3
                          </Text>
                        </Box>
                        <Text size="sm">{t.home.setup.step3}</Text>
                      </Group>
                    </Stack>
                    <Text size="xs" c="dimmed">
                      {t.home.setup.note}
                    </Text>
                  </Stack>
                </Card>
              </Box>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* Footer */}
      <Box
        component="footer"
        py="xl"
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: isDark
            ? "1px solid rgba(255, 255, 255, 0.1)"
            : "1px solid rgba(0, 0, 0, 0.05)",
        }}
      >
        <Container size="lg">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <BrandMark size={28} />
              <Text size="sm" c="dimmed">
                © {currentYear}{" "}
                <Anchor
                  href="https://madlabs.millenniaws.sch.id/"
                  target="_blank"
                  rel="noreferrer"
                  c="dimmed"
                >
                  MAD Labs by Millennia World School
                </Anchor>
                . Seluruh hak cipta dilindungi.
              </Text>
            </Group>

            <Group gap="md">
              <Anchor size="sm" c="dimmed" href="/terms">
                Syarat
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>

      {/* CSS Animation */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-20px, 20px);
          }
        }
      `}</style>
    </Box>
  );
}
