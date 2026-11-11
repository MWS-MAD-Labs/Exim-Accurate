"use client";

import {
  SimpleGrid,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Group,
  Box,
  Badge,
  UnstyledButton,
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import {
  IconFileExport,
  IconFileImport,
  IconPlugConnected,
  IconScan,
  IconSettings,
  IconChartBar,
  IconArrowRight,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

export interface QuickAction {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  color?:
  | "brand"
  | "accent"
  | "success"
  | "danger"
  | "violet"
  | "cyan"
  | "teal"
  | "grape";
  badge?: string;
  disabled?: boolean;
}

interface QuickActionsProps {
  actions?: QuickAction[];
  columns?: { base: number; sm?: number; md?: number; lg?: number };
}

// Icon box tint and icon colour per family. The CSS variables switch to light icon shades in dark mode.
const tint = (family: "sage" | "gold" | "sky" | "rose") => ({
  box: `var(--sade-tint-${family})`,
  icon: `var(--sade-tint-${family}-text)`,
});

const colorMap: Record<string, { box: string; icon: string }> = {
  brand: tint("sage"),
  success: tint("sage"),
  violet: tint("sage"),
  teal: tint("sage"),
  cyan: tint("sky"),
  accent: tint("gold"),
  grape: tint("gold"),
  danger: tint("rose"),
};

// Default quick actions for the dashboard
export const defaultQuickActions: QuickAction[] = [
  {
    id: "export",
    title: "Ekspor Baru",
    description: "Ekspor inventory adjustment ke CSV, XLSX, atau JSON",
    icon: <IconFileExport size={24} />,
    href: "/dashboard/export/inventory-adjustment",
    color: "brand",
  },
  {
    id: "import",
    title: "Impor Baru",
    description: "Impor inventory adjustment dari file Anda",
    icon: <IconFileImport size={24} />,
    href: "/dashboard/import/inventory-adjustment",
    color: "success",
  },
  {
    id: "credentials",
    title: "Kelola Akun",
    description: "Hubungkan atau kelola akun Accurate",
    icon: <IconPlugConnected size={24} />,
    href: "/dashboard/credentials",
    color: "violet",
  },
];

interface QuickActionTileProps {
  action: QuickAction;
}

function QuickActionTile({ action }: QuickActionTileProps) {
  const router = useRouter();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  const colors = colorMap[action.color || "brand"];

  const handleClick = () => {
    if (action.disabled) return;
    if (action.onClick) {
      action.onClick();
    } else if (action.href) {
      router.push(action.href);
    }
  };

  return (
    <UnstyledButton
      onClick={handleClick}
      disabled={action.disabled}
      style={{
        width: "100%",
        opacity: action.disabled ? 0.6 : 1,
        cursor: action.disabled ? "not-allowed" : "pointer",
      }}
    >
      <Paper
        p="lg"
        radius="lg"
        style={{
          background: "var(--sade-surface)",
          border: "1px solid var(--sade-border)",
          boxShadow: "var(--sade-card-shadow)",
          transition: "all 0.2s ease",
          height: "100%",
        }}
        onMouseEnter={(e) => {
          if (!action.disabled) {
            e.currentTarget.style.transform = "translateY(-4px)";
            e.currentTarget.style.boxShadow = isDark
              ? "0 12px 40px rgba(0, 0, 0, 0.3)"
              : "0 12px 40px rgba(0, 0, 0, 0.1)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "var(--sade-card-shadow)";
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <ThemeIcon
              size={48}
              radius="xl"
              variant="light"
              style={{
                backgroundColor: colors.box,
                color: colors.icon,
              }}
            >
              {action.icon}
            </ThemeIcon>
            {action.badge && (
              <Badge
                size="sm"
                variant="light"
                color={action.color || "brand"}
                radius="sm"
              >
                {action.badge}
              </Badge>
            )}
          </Group>

          <Stack gap={4}>
            <Group gap="xs" align="center">
              <Text fw={600} size="lg">
                {action.title}
              </Text>
              <Box
                style={{
                  transition: "transform 0.2s ease",
                  color: colors.icon,
                }}
                className="action-arrow"
              >
                <IconArrowRight size={18} />
              </Box>
            </Group>
            {action.description && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {action.description}
              </Text>
            )}
          </Stack>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

export function QuickActions({
  actions = defaultQuickActions,
  columns = { base: 1, sm: 2, lg: 4 },
}: QuickActionsProps) {
  return (
    <SimpleGrid cols={columns} spacing="md">
      {actions.map((action) => (
        <QuickActionTile key={action.id} action={action} />
      ))}
    </SimpleGrid>
  );
}

// Compact version for sidebar or smaller spaces
interface CompactQuickActionsProps {
  actions?: QuickAction[];
}

export function CompactQuickActions({
  actions = defaultQuickActions,
}: CompactQuickActionsProps) {
  const router = useRouter();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Stack gap="xs">
      {actions.map((action) => {
        const colors = colorMap[action.color || "brand"];

        const handleClick = () => {
          if (action.disabled) return;
          if (action.onClick) {
            action.onClick();
          } else if (action.href) {
            router.push(action.href);
          }
        };

        return (
          <UnstyledButton
            key={action.id}
            onClick={handleClick}
            disabled={action.disabled}
            style={{
              width: "100%",
              opacity: action.disabled ? 0.6 : 1,
              cursor: action.disabled ? "not-allowed" : "pointer",
            }}
          >
            <Group
              gap="sm"
              p="sm"
              style={{
                borderRadius: 8,
                transition: "all 0.15s ease",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                if (!action.disabled) {
                  e.currentTarget.style.background = isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.03)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ThemeIcon
                size={36}
                radius="md"
                variant="light"
                style={{
                  backgroundColor: colors.box,
                  color: colors.icon,
                }}
              >
                {action.icon}
              </ThemeIcon>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text size="sm" fw={600}>
                  {action.title}
                </Text>
                {action.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {action.description}
                  </Text>
                )}
              </Stack>
              <IconArrowRight
                size={16}
                color={isDark ? "#949B88" : "#7C776E"}
              />
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
