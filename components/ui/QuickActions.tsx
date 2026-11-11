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

const colorMap: Record<string, { bg: string; bgDark: string; icon: string }> = {
  brand: {
    bg: "linear-gradient(135deg, #F1F4EF 0%, #E6EBE2 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(111, 139, 106, 0.18) 0%, rgba(72, 97, 66, 0.12) 100%)",
    icon: "#486142",
  },
  accent: {
    bg: "linear-gradient(135deg, #FBF4E6 0%, #F6E9C9 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(214, 161, 58, 0.18) 0%, rgba(185, 132, 41, 0.12) 100%)",
    icon: "#B98429",
  },
  success: {
    bg: "linear-gradient(135deg, #F1F4EF 0%, #D5DFD0 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(111, 139, 106, 0.18) 0%, rgba(72, 97, 66, 0.12) 100%)",
    icon: "#486142",
  },
  danger: {
    bg: "linear-gradient(135deg, #FFF1F1 0%, #FCE3E3 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(204, 102, 102, 0.16) 0%, rgba(141, 62, 62, 0.1) 100%)",
    icon: "#AD4E4E",
  },
  violet: {
    bg: "linear-gradient(135deg, #F1F4EF 0%, #E6EBE2 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(111, 139, 106, 0.18) 0%, rgba(72, 97, 66, 0.12) 100%)",
    icon: "#486142",
  },
  cyan: {
    bg: "linear-gradient(135deg, #EFF7FA 0%, #DDEEF4 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(121, 175, 199, 0.16) 0%, rgba(76, 126, 149, 0.1) 100%)",
    icon: "#4C7E95",
  },
  teal: {
    bg: "linear-gradient(135deg, #F1F4EF 0%, #D5DFD0 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(111, 139, 106, 0.18) 0%, rgba(72, 97, 66, 0.12) 100%)",
    icon: "#486142",
  },
  grape: {
    bg: "linear-gradient(135deg, #FBF4E6 0%, #F6E9C9 100%)",
    bgDark:
      "linear-gradient(135deg, rgba(214, 161, 58, 0.18) 0%, rgba(185, 132, 41, 0.12) 100%)",
    icon: "#B98429",
  },
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
          background: isDark ? colors.bgDark : colors.bg,
          border: isDark
            ? "1px solid rgba(255, 255, 255, 0.1)"
            : "1px solid rgba(0, 0, 0, 0.05)",
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
          e.currentTarget.style.boxShadow = "";
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <ThemeIcon
              size={48}
              radius="xl"
              variant="light"
              style={{
                backgroundColor: isDark
                  ? `${colors.icon}25`
                  : `${colors.icon}20`,
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
                  backgroundColor: isDark
                    ? `${colors.icon}20`
                    : `${colors.icon}15`,
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
