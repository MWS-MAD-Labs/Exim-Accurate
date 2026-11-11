"use client";

import {
  ActionIcon,
  Tooltip,
  Group,
  SegmentedControl,
  Paper,
  Text,
  Box,
  Menu,
} from "@mantine/core";
import { useAppColorScheme, useColorSchemeChoice } from "@/lib/use-app-color-scheme";
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconPalette,
} from "@tabler/icons-react";

// Simple icon toggle button
export function ThemeToggle() {
  const { setColorScheme } = useColorSchemeChoice();
  const computedColorScheme = useAppColorScheme();

  const isDark = computedColorScheme === "dark";

  return (
    <Tooltip label={isDark ? "Mode terang" : "Mode gelap"} position="bottom">
      <ActionIcon
        onClick={() => setColorScheme(isDark ? "light" : "dark")}
        variant="subtle"
        size="lg"
        radius="md"
        aria-label="Ganti skema warna"
        style={{
          transition: "all 0.2s ease",
        }}
      >
        {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
      </ActionIcon>
    </Tooltip>
  );
}

// Segmented control for more explicit selection
interface ThemeSegmentedControlProps {
  size?: "xs" | "sm" | "md";
  fullWidth?: boolean;
}

export function ThemeSegmentedControl({
  size = "sm",
  fullWidth = false,
}: ThemeSegmentedControlProps) {
  const { choice: colorScheme, setColorScheme } = useColorSchemeChoice();

  return (
    <SegmentedControl
      size={size}
      fullWidth={fullWidth}
      value={colorScheme}
      onChange={(value) => setColorScheme(value as "light" | "dark" | "auto")}
      data={[
        {
          value: "light",
          label: (
            <Group gap={6} wrap="nowrap">
              <IconSun size={16} />
              <span>Terang</span>
            </Group>
          ),
        },
        {
          value: "dark",
          label: (
            <Group gap={6} wrap="nowrap">
              <IconMoon size={16} />
              <span>Gelap</span>
            </Group>
          ),
        },
        {
          value: "auto",
          label: (
            <Group gap={6} wrap="nowrap">
              <IconDeviceDesktop size={16} />
              <span>Otomatis</span>
            </Group>
          ),
        },
      ]}
    />
  );
}

// Dropdown menu for theme selection
export function ThemeMenu() {
  const { choice: colorScheme, setColorScheme } = useColorSchemeChoice();
  const computedColorScheme = useAppColorScheme();

  const isDark = computedColorScheme === "dark";

  const getIcon = () => {
    if (colorScheme === "auto") return <IconDeviceDesktop size={20} />;
    return isDark ? <IconMoon size={20} /> : <IconSun size={20} />;
  };

  return (
    <Menu position="bottom-end" withArrow shadow="md">
      <Menu.Target>
        <Tooltip label="Ubah tema" position="bottom">
          <ActionIcon
            variant="subtle"
            size="lg"
            radius="md"
            aria-label="Buka menu tema"
          >
            {getIcon()}
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Tampilan</Menu.Label>
        <Menu.Item
          leftSection={<IconSun size={16} />}
          onClick={() => setColorScheme("light")}
          rightSection={
            colorScheme === "light" && (
              <Box
                w={8}
                h={8}
                style={{
                  borderRadius: "50%",
                  backgroundColor: "var(--mantine-color-brand-6)",
                }}
              />
            )
          }
        >
          Terang
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMoon size={16} />}
          onClick={() => setColorScheme("dark")}
          rightSection={
            colorScheme === "dark" && (
              <Box
                w={8}
                h={8}
                style={{
                  borderRadius: "50%",
                  backgroundColor: "var(--mantine-color-brand-6)",
                }}
              />
            )
          }
        >
          Gelap
        </Menu.Item>
        <Menu.Item
          leftSection={<IconDeviceDesktop size={16} />}
          onClick={() => setColorScheme("auto")}
          rightSection={
            colorScheme === "auto" && (
              <Box
                w={8}
                h={8}
                style={{
                  borderRadius: "50%",
                  backgroundColor: "var(--mantine-color-brand-6)",
                }}
              />
            )
          }
        >
          Sistem
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// Card-based theme selector for settings pages
export function ThemeCard() {
  const { choice: colorScheme, setColorScheme } = useColorSchemeChoice();
  const computedColorScheme = useAppColorScheme();
  const isDark = computedColorScheme === "dark";

  const options = [
    {
      value: "light" as const,
      icon: <IconSun size={24} />,
      label: "Terang",
      description: "Selalu gunakan mode terang",
    },
    {
      value: "dark" as const,
      icon: <IconMoon size={24} />,
      label: "Gelap",
      description: "Selalu gunakan mode gelap",
    },
    {
      value: "auto" as const,
      icon: <IconDeviceDesktop size={24} />,
      label: "Sistem",
      description: "Ikuti preferensi sistem",
    },
  ];

  return (
    <Paper p="md" radius="lg" withBorder>
      <Group gap="xs" mb="md">
        <IconPalette size={20} />
        <Text fw={600}>Tema</Text>
      </Group>

      <Group gap="sm">
        {options.map((option) => {
          const isSelected = colorScheme === option.value;

          return (
            <Paper
              key={option.value}
              p="md"
              radius="md"
              withBorder
              style={{
                cursor: "pointer",
                flex: 1,
                minWidth: 100,
                borderColor: isSelected
                  ? "var(--mantine-color-brand-6)"
                  : undefined,
                borderWidth: isSelected ? 2 : 1,
                backgroundColor: isSelected
                  ? isDark
                    ? "rgba(111, 139, 106, 0.1)"
                    : "rgba(111, 139, 106, 0.05)"
                  : undefined,
                transition: "all 0.15s ease",
              }}
              onClick={() => setColorScheme(option.value)}
            >
              <Box
                c={isSelected ? "brand" : "dimmed"}
                mb="xs"
                style={{ textAlign: "center" }}
              >
                {option.icon}
              </Box>
              <Text
                size="sm"
                fw={isSelected ? 600 : 500}
                ta="center"
                c={isSelected ? "brand" : undefined}
              >
                {option.label}
              </Text>
              <Text size="xs" c="dimmed" ta="center" mt={4}>
                {option.description}
              </Text>
            </Paper>
          );
        })}
      </Group>
    </Paper>
  );
}
