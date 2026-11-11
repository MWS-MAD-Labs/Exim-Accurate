"use client";

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { BrandMark } from "@/components/BrandMark";
import { useLanguage } from "@/lib/language";

export default function TermsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";
  const currentYear = new Date().getFullYear();

  return (
    <Box
      style={{
        minHeight: "100vh",
        background: isDark
          ? "linear-gradient(180deg, var(--mantine-color-dark-8) 0%, var(--mantine-color-dark-9) 100%)"
          : "linear-gradient(180deg, #FFFAF4 0%, #F5F2EC 100%)",
      }}
    >
      <Box
        component="header"
        py="md"
        style={{
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
            <Box
              style={{ cursor: "pointer" }}
              onClick={() => router.push("/")}
            >
              <BrandMark />
            </Box>

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
              <Button
                variant="filled"
                size="sm"
                onClick={() => router.push("/login")}
              >
                {t.common.login}
              </Button>
            </Group>
          </Group>
        </Container>
      </Box>

      <Container size="md" py={{ base: "xl", md: 60 }}>
        <Stack gap="lg">
          <Badge size="md" variant="light" color="brand" w="fit-content">
            {t.common.terms}
          </Badge>
          <Title order={1}>{t.terms.title}</Title>
          <Text c="dimmed">{t.terms.subtitle}</Text>

          <Card
            radius="lg"
            padding="xl"
            style={{
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.08)"
                : "1px solid rgba(0, 0, 0, 0.05)",
              backgroundColor: isDark
                ? "rgba(23, 30, 21, 0.6)"
                : "rgba(255, 255, 255, 0.9)",
            }}
          >
            <List spacing="sm">
              {t.terms.list.map((item, index) => (
                <List.Item key={index}>{item}</List.Item>
              ))}
            </List>
          </Card>

          <Card
            radius="lg"
            padding="xl"
            style={{
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.08)"
                : "1px solid rgba(0, 0, 0, 0.05)",
              backgroundColor: isDark
                ? "rgba(23, 30, 21, 0.6)"
                : "rgba(255, 255, 255, 0.9)",
            }}
          >
            <Stack gap="sm">
              <Text fw={600}>{t.terms.integration.title}</Text>
              <Text c="dimmed">{t.terms.integration.description}</Text>
            </Stack>
          </Card>
        </Stack>
      </Container>

      <Box
        component="footer"
        py="xl"
        style={{
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
                  {t.terms.footer.copyright.split(".")[0]}
                </Anchor>
                . {t.terms.footer.copyright.split(".")[1]}
              </Text>
            </Group>

            <Group gap="md">
              <Anchor size="sm" c="dimmed" href="/">
                {t.common.home}
              </Anchor>
              <Anchor size="sm" c="dimmed" href="/login">
                {t.common.login}
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  );
}
