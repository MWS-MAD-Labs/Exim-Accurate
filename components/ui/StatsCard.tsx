"use client";

import {
  Paper,
  Group,
  Text,
  ThemeIcon,
  Stack,
  useMantineColorScheme,
  Box,
  rem,
} from "@mantine/core";
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
}

const colorGradients: Record<string, { light: string; dark: string }> = {
  brand: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #F8F6F0 100%)",
    dark: "linear-gradient(135deg, #242E21 0%, #202A1D 100%)",
  },
  accent: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #FAF4E7 100%)",
    dark: "linear-gradient(135deg, #2A3526 0%, #202A1D 100%)",
  },
  success: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #F8F6F0 100%)",
    dark: "linear-gradient(135deg, #242E21 0%, #202A1D 100%)",
  },
  danger: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #FAF1EF 100%)",
    dark: "linear-gradient(135deg, #2F2B27 0%, #202A1D 100%)",
  },
  violet: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #F8F6F0 100%)",
    dark: "linear-gradient(135deg, #242E21 0%, #202A1D 100%)",
  },
  cyan: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #F3F6F5 100%)",
    dark: "linear-gradient(135deg, #212E2B 0%, #202A1D 100%)",
  },
  grape: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #FAF4E7 100%)",
    dark: "linear-gradient(135deg, #2A3526 0%, #202A1D 100%)",
  },
  teal: {
    light: "linear-gradient(135deg, #FFFEFB 0%, #F8F6F0 100%)",
    dark: "linear-gradient(135deg, #242E21 0%, #202A1D 100%)",
  },
};

const iconColors: Record<string, string> = {
  brand: "#486142",
  accent: "#B98429",
  success: "#486142",
  danger: "#AD4E4E",
  violet: "#486142",
  cyan: "#4C7E95",
  grape: "#B98429",
  teal: "#486142",
};

export function StatsCard({
  title,
  value,
  description,
  trend,
  icon,
  color = "brand",
  compact = false,
}: StatsCardProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  const gradient = colorGradients[color] || colorGradients.brand;
  const iconColor = iconColors[color] || iconColors.brand;

  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <IconTrendingUp size={16} />;
    if (trend.value < 0) return <IconTrendingDown size={16} />;
    return <IconMinus size={16} />;
  };

  const getTrendColor = () => {
    if (!trend) return "dimmed";
    if (trend.value > 0) return "teal";
    if (trend.value < 0) return "red";
    return "dimmed";
  };

  return (
    <Paper
      p={compact ? "md" : "lg"}
      radius="lg"
      style={{
        background: isDark ? gradient.dark : gradient.light,
        border: isDark
          ? "1px solid rgba(237, 232, 220, 0.12)"
          : "1px solid rgba(72, 67, 55, 0.12)",
        transition: "all 0.2s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = isDark
          ? "0 8px 24px rgba(0, 0, 0, 0.22)"
          : "0 8px 24px rgba(50, 45, 37, 0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "";
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
          size={compact ? 44 : 52}
          radius="xl"
          variant="light"
          style={{
            backgroundColor: isDark
              ? `${iconColor}2B`
              : `${iconColor}1A`,
            color: iconColor,
          }}
        >
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
