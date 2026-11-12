"use client";

import {
  ActionIcon,
  Drawer,
  Group,
  NavLink,
  Text,
  Button,
  UnstyledButton,
  Menu,
  Divider,
  Box,
  Badge,
  Tooltip,
  Stack,
  ScrollArea,
  rem,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import { useSession } from "@/lib/session-client";
import { usePathname, useRouter } from "next/navigation";
import {
  IconDashboard,
  IconFileExport,
  IconFileImport,
  IconKey,
  IconUser,
  IconArrowBackUp,
  IconAdjustments,
  IconScan,
  IconChevronDown,
  IconChevronRight,
  IconSettings,
  IconExternalLink,
  IconClipboardList,
  IconChartBar,
  IconChartLine,
  IconShoppingCart,
  IconBuildingWarehouse,
  IconQrcode,
  IconUsers,
  IconClock,
  IconWallet,
  IconReceipt,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { BrandMark } from "@/components/BrandMark";
import { useLanguage } from "@/lib/language";
import { InitialsAvatar } from "@/components/ui/InitialsAvatar";
import { initialsOf, roleLabelOf } from "@/lib/initials";
import { getRoleHome, hasAnyPermission, type AppPermission } from "@/lib/access-control";

// The kiosk and the cashier are full-screen stations of their own, so the dashboard opens them in a new tab
// instead of leaving the dashboard.
const NEW_TAB_ROUTES = ["/kiosk", "/pos-cashier"];
function opensInNewTab(href: string) {
  return NEW_TAB_ROUTES.some((route) => href === route || href.startsWith(`${route}/`));
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: NavItem[];
  badge?: string;
  // Shown to a person who has any of these permissions. A group shows when one of its items does.
  requires?: readonly AppPermission[];
}

function visibleItems(items: NavItem[], permissions: readonly string[] | undefined): NavItem[] {
  return items.flatMap((item) => {
    if (item.children) {
      const children = visibleItems(item.children, permissions);
      return children.length > 0 ? [{ ...item, children }] : [];
    }
    return !item.requires || hasAnyPermission(permissions, item.requires) ? [item] : [];
  });
}

function UserMenu() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignOut = () => {
    // Leaves Exima for the Hub, so a full page load and not a client route change.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/auth/hub";
  };

  const email = session?.user?.email;
  const name = session?.user?.name?.trim() || null;
  const displayName = name || (email ? email.split("@")[0].split(/[._-]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") : "Pengguna");
  const initials = initialsOf(name, email);
  const role = roleLabelOf(session?.user?.role);

  return (
    <Menu position="bottom-end" withArrow shadow="lg" width={240}>
      <Menu.Target>
        <UnstyledButton
          aria-label="Account menu"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", borderRadius: 10 }}
        >
          <InitialsAvatar initials={initials} size={34} label={displayName} />
          <Box visibleFrom="sm" style={{ minWidth: 0, maxWidth: 160 }}>
            <Text size="sm" fw={600} lh={1.2} truncate>{displayName}</Text>
            {role && <Text size="xs" c="dimmed" lh={1.2} truncate>{role}</Text>}
          </Box>
          <IconChevronDown size={14} style={{ opacity: 0.55 }} />
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Group gap="sm" px="sm" py="xs" wrap="nowrap">
          <InitialsAvatar initials={initials} size={40} label={displayName} />
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={700} lh={1.25} truncate>{displayName}</Text>
            <Text size="xs" c="dimmed" lh={1.25} truncate>{email}</Text>
          </Box>
        </Group>
        <Menu.Divider />
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
          onClick={() => window.open("/kiosk", "_blank", "noopener")}
        >
          {t.dashboard.userMenu.openKiosk}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconArrowBackUp size={16} />}
          color="red"
          onClick={handleSignOut}
        >
          {t.dashboard.userMenu.backToHub}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const COLLAPSED_KEY = "sade.sidebar.collapsed";

// The deepest menu entry whose page is open, with the group it sits in, for the header.
function activeTrail(items: NavItem[], isActive: (item: NavItem) => boolean): NavItem[] {
  for (const item of items) {
    if (!isActive(item)) continue;
    if (!item.children) return [item];
    const rest = activeTrail(item.children, isActive);
    return rest.length ? [item, ...rest] : [item];
  }
  return [];
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, language } = useLanguage();
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure();
  // Remembered per browser. Read after mounting so the server and the first render agree.
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Storage can be blocked; the sidebar then starts open.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
      } catch {
        // Not remembered, still toggled.
      }
      return !current;
    });
  };

  const resourceManagementItem: NavItem = {
    label: t.dashboard.nav.resourceManagement,
    icon: <IconBuildingWarehouse size={20} />,
    children: [
      {
        label: t.dashboard.nav.inventoryAdjustment,
        icon: <IconAdjustments size={16} />,
        children: [
          {
            label: t.dashboard.nav.export,
            icon: <IconFileExport size={16} />,
            href: "/dashboard/export/inventory-adjustment",
            requires: ["inventory.export"],
          },
          {
            label: t.dashboard.nav.import,
            icon: <IconFileImport size={16} />,
            href: "/dashboard/import/inventory-adjustment",
            requires: ["inventory.import"],
          },
        ],
      },
      {
        label: t.dashboard.nav.selfCheckout,
        icon: <IconScan size={16} />,
        href: "/kiosk",
        requires: ["borrowing.manage"],
      },
      {
        label: t.dashboard.nav.peminjaman,
        icon: <IconClipboardList size={16} />,
        href: "/dashboard/peminjaman",
        requires: ["borrowing.manage"],
      },
    ],
  };

  const adminNavItems: NavItem[] = [
    {
      label: t.dashboard.nav.dashboard,
      icon: <IconDashboard size={20} />,
      href: "/dashboard",
      requires: ["dashboard.read"],
    },
    resourceManagementItem,
    {
      label: "Point of Sales",
      icon: <IconShoppingCart size={20} />,
      children: [
        {
          label: "POS Cashier",
          icon: <IconShoppingCart size={16} />,
          href: "/pos-cashier",
          requires: ["pos.checkout"],
        },
        {
          label: "Sales Log",
          icon: <IconReceipt size={16} />,
          href: "/dashboard/pos/sales-log",
          requires: ["pos.manage"],
        },
        {
          label: "Stock Management",
          icon: <IconBuildingWarehouse size={16} />,
          href: "/dashboard/pos",
          requires: ["pos.manage"],
        },
        {
          label: "Pre Order Management",
          icon: <IconClock size={16} />,
          href: "/dashboard/pos/preorders",
          requires: ["pos.manage"],
        },
        {
          label: t.dashboard.pos.staffAllowanceTitle,
          icon: <IconWallet size={16} />,
          href: "/dashboard/pos/allowance",
          requires: ["allowance.manage"],
        },
        {
          label: "POS Settings",
          icon: <IconSettings size={16} />,
          href: "/dashboard/pos/settings",
          requires: ["pos.manage"],
        },
      ],
    },
    {
      label: language === "id" ? "Analitik" : "Analytics",
      icon: <IconChartBar size={20} />,
      children: [
        {
          label: language === "id" ? "Ringkasan" : "Overview",
          icon: <IconChartLine size={16} />,
          href: "/dashboard/analytics",
          requires: ["analytics.read"],
        },
        {
          label: language === "id" ? "Peminjaman" : "Borrowing",
          icon: <IconClipboardList size={16} />,
          href: "/dashboard/analytics/peminjaman",
          requires: ["analytics.read"],
        },
        {
          label: language === "id" ? "Pengambilan" : "Checkout",
          icon: <IconScan size={16} />,
          href: "/dashboard/analytics/pengambilan",
          requires: ["analytics.read"],
        },
        {
          label: language === "id" ? "Penjualan POS" : "POS Sales",
          icon: <IconShoppingCart size={16} />,
          href: "/dashboard/analytics/pos",
          requires: ["analytics.read"],
        },
      ],
    },
    {
      label: t.dashboard.nav.credentials,
      icon: <IconKey size={20} />,
      href: "/dashboard/credentials",
      requires: ["credentials.manage"],
    },
    {
      label: t.dashboard.nav.userManagement,
      icon: <IconUsers size={20} />,
      href: "/admin",
      requires: ["users.manage"],
    },
    {
      label: "Badges",
      icon: <IconQrcode size={20} />,
      href: "/admin/badges",
      requires: ["users.manage"],
    },
  ];

  // What a person sees follows the permissions of their role in Central, not the name of the role.
  const navItems = visibleItems(adminNavItems, session?.user?.permissions);

  const isActive = (href: string) => pathname === href;
  const isItemActive = (item: NavItem): boolean => {
    if (item.href) {
      // User management and Badges both live under /admin, so /admin is matched exactly.
      if (item.href === "/admin") return pathname === item.href;
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }

    return item.children?.some(isItemActive) ?? false;
  };

  const trail = activeTrail(navItems, isItemActive);

  const go = (href: string) => {
    if (opensInNewTab(href)) {
      window.open(href, "_blank", "noopener");
    } else {
      router.push(href);
    }
    closeDrawer();
  };

  // The full menu: the open sidebar and the phone drawer.
  const renderNavItem = (item: NavItem, depth = 0): React.ReactNode => {
    const active = isItemActive(item);
    const label = (selected: boolean) => (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={selected ? 700 : 500} truncate>
          {item.label}
        </Text>
        {item.badge && (
          <Badge size="xs" variant="light">
            {item.badge}
          </Badge>
        )}
      </Group>
    );

    if (item.children) {
      return (
        <NavLink
          key={item.label}
          className="sade-nav"
          label={label(active)}
          leftSection={item.icon}
          childrenOffset={depth === 0 ? 28 : 20}
          defaultOpened={active}
          // A group holding the current page is marked too: solid at the top level, a tint below it.
          active={active}
          variant={depth === 0 ? "filled" : "light"}
          style={{ borderRadius: rem(depth === 0 ? 8 : 6) }}
          styles={{
            children: {
              paddingLeft: rem(depth === 0 ? 12 : 8),
              borderLeft: "2px solid var(--sade-border)",
              marginLeft: rem(depth === 0 ? 14 : 10),
            },
          }}
        >
          {item.children.map((child) => renderNavItem(child, depth + 1))}
        </NavLink>
      );
    }

    return (
      <NavLink
        key={item.href}
        className="sade-nav"
        label={label(isActive(item.href!))}
        leftSection={item.icon}
        active={isActive(item.href!)}
        variant={depth === 0 ? "filled" : "light"}
        onClick={() => go(item.href!)}
        style={{ borderRadius: rem(depth === 0 ? 8 : 6) }}
      />
    );
  };

  // Collapsed sidebar: icons only. A link shows its name on hover, a group opens its pages beside the bar.
  const renderMenuEntries = (items: NavItem[]): React.ReactNode =>
    items.map((child) =>
      child.children ? (
        <Box key={child.label}>
          <Menu.Label>{child.label}</Menu.Label>
          {renderMenuEntries(child.children)}
        </Box>
      ) : (
        <Menu.Item
          key={child.href}
          leftSection={child.icon}
          onClick={() => go(child.href!)}
          className="sade-flyout-item"
          data-active={isActive(child.href!) || undefined}
        >
          {child.label}
        </Menu.Item>
      ),
    );

  const renderRailItem = (item: NavItem): React.ReactNode => {
    const active = isItemActive(item);
    const button = (
      <UnstyledButton
        className="sade-rail-item"
        data-active={active || undefined}
        aria-label={item.label}
        onClick={item.href ? () => go(item.href!) : undefined}
      >
        {item.icon}
      </UnstyledButton>
    );

    if (!item.children) {
      return (
        <Tooltip key={item.href} label={item.label} position="right" withArrow>
          {button}
        </Tooltip>
      );
    }

    return (
      <Menu key={item.label} trigger="click-hover" position="right-start" offset={10} withArrow shadow="md" width={240}>
        <Menu.Target>{button}</Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{item.label}</Menu.Label>
          {renderMenuEntries(item.children)}
        </Menu.Dropdown>
      </Menu>
    );
  };

  const statusPanel = (
    <Box className="sade-status">
      <Group gap="xs" mb={4} wrap="nowrap">
        <Box className="sade-status-dot" />
        <Text size="xs" fw={600} truncate>
          {t.dashboard.status.connected}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {t.dashboard.status.operational}
      </Text>
    </Box>
  );

  const home = () => {
    const href = getRoleHome(session?.user?.role, session?.user?.permissions);
    if (opensInNewTab(href)) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  return (
    <div className="sade-shell">
      {/* Sidebar: full height beside the main column, so the content never sits under it */}
      <aside className="sade-sidebar" data-collapsed={collapsed || undefined} aria-label="Sidebar">
        <UnstyledButton className="sade-sidebar-brand" onClick={home} aria-label="Sade">
          <BrandMark size={32} withWordmark={!collapsed} />
        </UnstyledButton>

        <ScrollArea className="sade-sidebar-nav" scrollbarSize={6} type="hover">
          {collapsed ? (
            <Stack gap={6} align="center" py="md">
              {navItems.map(renderRailItem)}
            </Stack>
          ) : (
            <Stack gap={4} p="md">
              {navItems.map((item) => renderNavItem(item))}
            </Stack>
          )}
        </ScrollArea>

        <div className="sade-sidebar-footer">
          {collapsed ? (
            <Tooltip label={t.dashboard.status.connected} position="right" withArrow>
              <Box className="sade-status-dot" mx="auto" />
            </Tooltip>
          ) : (
            statusPanel
          )}
        </div>

        <UnstyledButton
          className="sade-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconLayoutSidebarLeftExpand size={15} /> : <IconLayoutSidebarLeftCollapse size={15} />}
        </UnstyledButton>
      </aside>

      {/* Phones and small tablets: the same menu in a drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size={280}
        padding={0}
        withCloseButton={false}
        hiddenFrom="sm"
        classNames={{ content: "sade-drawer" }}
      >
        <div className="sade-sidebar-brand">
          <BrandMark size={32} />
        </div>
        <Stack gap={4} p="md">
          {navItems.map((item) => renderNavItem(item))}
        </Stack>
        <div className="sade-sidebar-footer">{statusPanel}</div>
      </Drawer>

      <div className="sade-main">
        <header className="sade-header">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ActionIcon variant="subtle" color="gray" hiddenFrom="sm" onClick={openDrawer} aria-label="Open menu">
              <IconMenu2 size={20} />
            </ActionIcon>
            <Box hiddenFrom="sm">
              <BrandMark size={28} withWordmark={false} />
            </Box>
            {trail.length > 0 && (
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }} visibleFrom="xs">
                {trail.slice(0, -1).map((item) => (
                  <Group key={item.label} gap={6} wrap="nowrap">
                    <Text size="sm" c="dimmed" truncate>
                      {item.label}
                    </Text>
                    <IconChevronRight size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                  </Group>
                ))}
                <Text size="sm" fw={700} truncate>
                  {trail[trail.length - 1].label}
                </Text>
              </Group>
            )}
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Box visibleFrom="sm">
              <LanguageSelect />
            </Box>
            <ThemeToggle />
            <UserMenu />
          </Group>
        </header>

        <main className="sade-content">{children}</main>
      </div>
    </div>
  );
}
