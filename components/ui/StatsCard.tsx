"use client";

import {
  Paper,
  Group,
  Text,
  ThemeIcon,
  Stack,
  Box,
  rem,
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react";
import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    label?: string;
  };
  icon: ReactNode;
  color?: "brand" | "accent" | "success" | "danger" | "violet" | "cyan" | "grape" | "teal";
  compact?: boolean;
  // Solid gold icon box. Only for the one card that should stand out (the dashboard's "This month").
  highlight?: boolean;
}

type Tint = "sage" | "sky" | "gold" | "rose";

// violet and teal follow the theme, which maps them to the sage family.
const tintOf: Record<NonNullable<StatsCardProps["color"]>, Tint> = {
  brand: "sage",
  success: "sage",
  violet: "sage",
  teal: "sage",
  cyan: "sky",
  accent: "gold",
  grape: "gold",
  danger: "rose",
};

// Icon box background and icon colour, light / dark. Dark icons are light shades so they stay visible on #242E21.
const iconBox: Record<Tint, { light: [string, string]; dark: [string, string] }> = {
  sage: { light: ["#E7EEE4", "#486142"], dark: ["rgba(111, 139, 106, 0.2)", "#8FAE88"] },
  sky: { light: ["#E3F0F7", "#2F6A86"], dark: ["rgba(121, 175, 199, 0.16)", "#8CB8D6"] },
  gold: { light: ["#FBF0D3", "#7A5208"], dark: ["rgba(214, 161, 58, 0.16)", "#D6A13A"] },
  rose: { light: ["#FFF1F1", "#AD4E4E"], dark: ["rgba(204, 102, 102, 0.16)", "#E99C9C"] },
};

export function StatsCard({
  title,
  value,
  description,
  trend,
  icon,
  color = "brand",
  compact = false,
  highlight = false,
}: StatsCardProps) {
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  const [iconBackground, iconColor] = highlight
    ? ["#D6A13A", "#2B2A24"]
    : iconBox[tintOf[color] ?? "sage"][isDark ? "dark" : "light"];

  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <IconTrendingUp size={16} />;
    if (trend.value < 0) return <IconTrendingDown size={16} />;
    return <IconMinus size={16} />;
  };

  // Green and rose text use the text shades (#486142 / #AD4E4E, lighter in dark mode), not the base colours.
  const getTrendColor = () => {
    if (!trend) return "dimmed";
    if (trend.value > 0) return "var(--sade-text-green)";
    if (trend.value < 0) return "var(--sade-warning-text)";
    return "dimmed";
  };

  return (
    <Paper
      p={compact ? "md" : "lg"}
      radius="lg"
      style={{
        background: "var(--sade-surface)",
        border: "1px solid var(--sade-border)",
        boxShadow: "var(--sade-card-shadow)",
        transition: "all 0.2s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = isDark
          ? "0 8px 24px rgba(0, 0, 0, 0.22)"
          : "0 8px 24px rgba(43, 55, 37, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--sade-card-shadow)";
      }}
    >
      <Group justify="space-between" align="center">
        <Stack gap={2}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" lts={0.5}>
            {title}
          </Text>
          <Text size={compact ? "xl" : "2rem"} fw={700} lh={1.2} style={{ fontSize: compact ? rem(24) : rem(32) }}>
            {value}
          </Text>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
          {trend && (
            <Group gap={4} mt={4}>
              <Box c={getTrendColor()}>{getTrendIcon()}</Box>
              <Text size="sm" c={getTrendColor()} fw={500}>
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </Text>
              {trend.label && (
                <Text size="xs" c="dimmed">
                  {trend.label}
                </Text>
              )}
            </Group>
          )}
        </Stack>
        <ThemeIcon
          size={48}
          radius={14}
          variant="light"
          style={{
            backgroundColor: iconBackground,
            color: iconColor,
          }}
        >
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
