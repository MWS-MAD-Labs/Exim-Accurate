"use client";

import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Button,
  Avatar,
  Menu,
  Divider,
  Box,
  useMantineColorScheme,
  Badge,
  Tooltip,
  Stack,
  rem,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconDashboard,
  IconFileExport,
  IconFileImport,
  IconKey,
  IconUser,
  IconLogout,
  IconAdjustments,
  IconScan,
  IconChevronRight,
  IconSettings,
  IconExternalLink,
  IconClipboardList,
  IconChartBar,
  IconChartLine,
  IconShoppingCart,
  IconBuildingWarehouse,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { useLanguage } from "@/lib/language";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: {
    label: string;
    icon: React.ReactNode;
    href: string;
    badge?: string;
  }[];
  badge?: string;
}

function UserMenu() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const getInitials = (email?: string | null) => {
    if (!email) return "U";
    const parts = email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getUserName = (email?: string | null) => {
    if (!email) return "Pengguna";
    const localPart = email.split("@")[0];
    return localPart
      .split(/[._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Menu position="bottom-end" withArrow shadow="lg" width={220}>
      <Menu.Target>
        <Button
          variant="subtle"
          px="xs"
          style={{
            height: "auto",
            padding: "6px 10px",
          }}
        >
          <Group gap="sm">
            <Avatar
              size={32}
              radius="xl"
              color="brand"
              variant="filled"
              style={{
                cursor: "pointer",
              }}
            >
              {getInitials(session?.user?.email)}
            </Avatar>
            <Box visibleFrom="sm">
              <Text size="sm" fw={500} lh={1.2}>
                {getUserName(session?.user?.email)}
              </Text>
              <Text size="xs" c="dimmed" lh={1.2}>
                {session?.user?.email}
              </Text>
            </Box>
          </Group>
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t.dashboard.userMenu.account}</Menu.Label>
        <Menu.Item
          leftSection={<IconUser size={16} />}
          onClick={() => router.push("/dashboard/profile")}
        >
          {t.dashboard.userMenu.profile}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconSettings size={16} />}
          onClick={() => router.push("/dashboard/settings")}
        >
          {t.dashboard.userMenu.settings}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>{t.dashboard.userMenu.links}</Menu.Label>
        <Menu.Item
          leftSection={<IconExternalLink size={16} />}
          onClick={() => window.open("/kiosk", "_blank")}
        >
          {t.dashboard.userMenu.openKiosk}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          color="red"
          onClick={handleSignOut}
        >
          {t.dashboard.userMenu.logout}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  const navItems: NavItem[] = [
    {
      label: t.dashboard.nav.dashboard,
      icon: <IconDashboard size={20} />,
      href: "/dashboard",
    },
    {
      label: t.dashboard.nav.inventoryAdjustment,
      icon: <IconAdjustments size={20} />,
      children: [
        {
          label: t.dashboard.nav.export,
          icon: <IconFileExport size={16} />,
          href: "/dashboard/export/inventory-adjustment",
        },
        {
          label: t.dashboard.nav.import,
          icon: <IconFileImport size={16} />,
          href: "/dashboard/import/inventory-adjustment",
        },
      ],
    },
    {
      label: t.dashboard.nav.selfCheckout,
      icon: <IconScan size={20} />,
      href: "/kiosk",
    },
    {
      label: t.dashboard.nav.peminjaman,
      icon: <IconClipboardList size={20} />,
      href: "/dashboard/peminjaman",
    },
    {
      label: "Point of Sales",
      icon: <IconShoppingCart size={20} />,
      children: [
        {
          label: "POS Cashier",
          icon: <IconShoppingCart size={16} />,
          href: "/pos-cashier",
        },
        {
          label: "Stock Management",
          icon: <IconBuildingWarehouse size={16} />,
          href: "/dashboard/pos",
        },
        {
          label: "POS Settings",
          icon: <IconSettings size={16} />,
          href: "/dashboard/pos/settings",
        },
      ],
    },
    {
      label: "Analytics",
      icon: <IconChartBar size={20} />,
      children: [
        {
          label: "Overview",
          icon: <IconChartLine size={16} />,
          href: "/dashboard/analytics",
        },
        {
          label: "Peminjaman",
          icon: <IconClipboardList size={16} />,
          href: "/dashboard/analytics/peminjaman",
        },
        {
          label: "Pengambilan",
          icon: <IconScan size={16} />,
          href: "/dashboard/analytics/pengambilan",
        },
        {
          label: "POS Sales",
          icon: <IconShoppingCart size={16} />,
          href: "/dashboard/analytics/pos",
        },
      ],
    },
    {
      label: t.dashboard.nav.credentials,
      icon: <IconKey size={20} />,
      href: "/dashboard/credentials",
    },
  ];

  const isActive = (href: string) => pathname === href;
  const isParentActive = (children?: { href: string }[]) =>
    children?.some(
      (child) =>
        pathname === child.href || pathname.startsWith(`${child.href}/`),
    );

  const handleNavClick = (href: string) => {
    router.push(href);
    close();
  };

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: 280,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
      styles={{
        main: {
          backgroundColor: isDark
            ? "var(--mantine-color-dark-8)"
            : "var(--mantine-color-gray-0)",
        },
      }}
    >
      <AppShell.Header
        style={{
          borderBottom: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
          backgroundColor: isDark ? "var(--mantine-color-dark-7)" : "white",
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Group
              gap="xs"
              style={{ cursor: "pointer" }}
              onClick={() => router.push("/dashboard")}
            >
              <Box
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background:
                    "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 16,
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
          </Group>

          <Group gap="sm">
            <LanguageSelect />
            <ThemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="md"
        style={{
          backgroundColor: isDark ? "var(--mantine-color-dark-7)" : "white",
          borderRight: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
        }}
      >
        <Stack gap="xs">
          {navItems.map((item) => {
            if (item.children) {
              const parentActive = isParentActive(item.children);

              return (
                <NavLink
                  key={item.label}
                  label={
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {item.label}
                      </Text>
                      {item.badge && (
                        <Badge size="xs" variant="light">
                          {item.badge}
                        </Badge>
                      )}
                    </Group>
                  }
                  leftSection={item.icon}
                  childrenOffset={28}
                  defaultOpened={parentActive}
                  style={{
                    borderRadius: rem(8),
                    fontWeight: parentActive ? 600 : 500,
                  }}
                  styles={{
                    root: {
                      "&:hover": {
                        backgroundColor: isDark
                          ? "var(--mantine-color-dark-5)"
                          : "var(--mantine-color-gray-1)",
                      },
                    },
                    children: {
                      paddingLeft: rem(12),
                      borderLeft: isDark
                        ? "2px solid var(--mantine-color-dark-4)"
                        : "2px solid var(--mantine-color-gray-2)",
                      marginLeft: rem(14),
                    },
                  }}
                >
                  {item.children.map((child) => (
                    <NavLink
                      key={child.href}
                      label={
                        <Group gap="xs" justify="space-between" wrap="nowrap">
                          <Text size="sm">{child.label}</Text>
                          {child.badge && (
                            <Badge size="xs" variant="light">
                              {child.badge}
                            </Badge>
                          )}
                        </Group>
                      }
                      leftSection={child.icon}
                      active={isActive(child.href)}
                      onClick={() => handleNavClick(child.href)}
                      style={{
                        borderRadius: rem(6),
                      }}
                      styles={{
                        root: {
                          "&[dataActive]": {
                            backgroundColor: isDark
                              ? "rgba(34, 139, 230, 0.15)"
                              : "rgba(34, 139, 230, 0.1)",
                            color: "var(--mantine-color-brand-6)",
                            fontWeight: 600,
                          },
                        },
                      }}
                    />
                  ))}
                </NavLink>
              );
            }

            return (
              <NavLink
                key={item.href}
                label={
                  <Group gap="xs">
                    <Text size="sm" fw={isActive(item.href!) ? 600 : 500}>
                      {item.label}
                    </Text>
                    {item.badge && (
                      <Badge size="xs" variant="light">
                        {item.badge}
                      </Badge>
                    )}
                  </Group>
                }
                leftSection={item.icon}
                active={isActive(item.href!)}
                onClick={() => handleNavClick(item.href!)}
                style={{
                  borderRadius: rem(8),
                }}
                styles={{
                  root: {
                    "&[dataActive]": {
                      backgroundColor: isDark
                        ? "rgba(34, 139, 230, 0.15)"
                        : "rgba(34, 139, 230, 0.1)",
                      color: "var(--mantine-color-brand-6)",
                      fontWeight: 600,
                    },
                    "&:hover": {
                      backgroundColor: isDark
                        ? "var(--mantine-color-dark-5)"
                        : "var(--mantine-color-gray-1)",
                    },
                  },
                }}
              />
            );
          })}
        </Stack>

        <Box style={{ flex: 1 }} />

        <Divider my="md" />

        <Box
          p="sm"
          style={{
            backgroundColor: isDark
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-gray-0)",
            borderRadius: rem(8),
          }}
        >
          <Group gap="xs" mb={4}>
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-green-6)",
              }}
            />
            <Text size="xs" fw={500}>
              {t.dashboard.status.connected}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {t.dashboard.status.operational}
          </Text>
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
