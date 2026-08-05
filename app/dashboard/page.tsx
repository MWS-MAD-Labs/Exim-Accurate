"use client";

import { useState, useEffect } from "react";
import {
  Title,
  Text,
  SimpleGrid,
  Stack,
  Group,
  Paper,
  Box,
  useMantineColorScheme,
  Skeleton,
  Badge,
  ThemeIcon,
  Anchor,
  rem,
  Button,
  Tooltip as MantineTooltip,
} from "@mantine/core";
import {
  IconFileExport,
  IconFileImport,
  IconPlugConnected,
  IconCalendarStats,
  IconArrowUpRight,
  IconArrowDownRight,
  IconDatabase,
  IconScan,
  IconUser,
  IconActivity,
  IconPackage,
  IconTrophy,
  IconRefresh,
} from "@tabler/icons-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { StatsCard } from "@/components/ui/StatsCard";
import { ActivityCard, ActivityItem } from "@/components/ui/ActivityTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLanguage } from "@/lib/language";

interface KioskStats {
  totalCheckouts: number;
  uniqueUsers: number;
  topUser: {
    email: string;
    name: string | null;
    count: number;
  } | null;
}

interface DashboardStats {
  totalExports: number;
  totalImports: number;
  connectedAccounts: number;
  thisMonth: number;
  exportsTrend: number;
  importsTrend: number;
  monthTrend: number;
}

interface WeeklyActivityPoint {
  name: string;
  exports: number;
  imports: number;
}

interface KioskWeeklyPoint {
  name: string;
  checkouts: number;
}

interface MonthlyTrendPoint {
  name: string;
  total: number;
}

interface TopItem {
  rank: number;
  itemCode: string;
  itemName: string;
  totalQuantity: number;
}

interface TopCheckoutUser {
  rank: number;
  email: string;
  name: string | null;
  count: number;
}

function CustomTooltip({ active, payload, label }: any) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  if (active && payload && payload.length) {
    return (
      <Paper
        p="sm"
        radius="md"
        shadow="md"
        style={{
          backgroundColor: isDark ? "var(--mantine-color-dark-6)" : "white",
          border: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
        }}
      >
        <Text size="sm" fw={600} mb={4}>
          {label}
        </Text>
        {payload.map((entry: any, index: number) => (
          <Group key={index} gap="xs">
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: entry.color,
              }}
            />
            <Text size="xs" c="dimmed">
              {entry.name}: {entry.value}
            </Text>
          </Group>
        ))}
      </Paper>
    );
  }
  return null;
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalExports: 0,
    totalImports: 0,
    connectedAccounts: 0,
    thisMonth: 0,
    exportsTrend: 0,
    importsTrend: 0,
    monthTrend: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [weeklyActivityData, setWeeklyActivityData] = useState<
    WeeklyActivityPoint[]
  >([]);
  const [monthlyTrendData, setMonthlyTrendData] = useState<MonthlyTrendPoint[]>(
    [],
  );
  const [monthTotal, setMonthTotal] = useState(0);
  const [kioskStats, setKioskStats] = useState<KioskStats | null>(null);
  const [kioskWeeklyData, setKioskWeeklyData] = useState<KioskWeeklyPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [topCheckoutUsers, setTopCheckoutUsers] = useState<TopCheckoutUser[]>([]);
  const [kioskLastSync, setKioskLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/dashboard/summary", {
          cache: "no-store",
          credentials: "include",
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error ?? "Gagal memuat data dasbor");
        }

        const data = await response.json();
        setStats(data.stats);
        setKioskStats(data.kioskStats);
        setKioskWeeklyData(data.kioskWeeklyData || []);
        setTopItems(data.topItems || []);
        setTopCheckoutUsers(data.topCheckoutUsers || []);
        setKioskLastSync(data.kioskLastSync || null);
        setWeeklyActivityData(data.weeklyActivityData || []);
        setMonthlyTrendData(data.monthlyTrendData || []);
        setMonthTotal(data.monthTotal || 0);
        setActivities(data.activities || []);
      } catch (error) {
        console.error(error);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const chartGridColor = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.1)";
  const chartTextColor = isDark ? "#909296" : "#868E96";

  const syncKioskData = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron/sync-kiosk", { credentials: "include" });
      if (res.ok) {
        // Reload dashboard data
        const response = await fetch("/api/dashboard/summary", {
          cache: "no-store",
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setKioskStats(data.kioskStats);
          setKioskWeeklyData(data.kioskWeeklyData || []);
          setTopItems(data.topItems || []);
          setTopCheckoutUsers(data.topCheckoutUsers || []);
          setKioskLastSync(data.kioskLastSync || null);
        }
      }
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="flex-end">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>
            {t.dashboard.welcome}
          </Text>
          <Title order={2}>{t.dashboard.title}</Title>
        </Box>
        <Badge
          size="lg"
          variant="light"
          color="green"
          leftSection={
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-green-6)",
              }}
            />
          }
        >
          {t.dashboard.systemOperational}
        </Badge>
      </Group>

      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {loading ? (
          <>
            <Skeleton height={140} radius="lg" />
            <Skeleton height={140} radius="lg" />
            <Skeleton height={140} radius="lg" />
            <Skeleton height={140} radius="lg" />
          </>
        ) : (
          <>
            <StatsCard
              title={t.dashboard.stats.totalExports}
              value={stats.totalExports.toLocaleString()}
              description={t.dashboard.stats.totalExportsDesc}
              trend={{
                value: stats.exportsTrend,
                label: t.dashboard.stats.trendLabel,
              }}
              icon={<IconFileExport size={26} />}
              color="brand"
            />
            <StatsCard
              title={t.dashboard.stats.totalImports}
              value={stats.totalImports.toLocaleString()}
              description={t.dashboard.stats.totalImportsDesc}
              trend={{
                value: stats.importsTrend,
                label: t.dashboard.stats.trendLabel,
              }}
              icon={<IconFileImport size={26} />}
              color="success"
            />
            <StatsCard
              title={t.dashboard.stats.connectedAccounts}
              value={stats.connectedAccounts}
              description={t.dashboard.stats.connectedAccountsDesc}
              icon={<IconPlugConnected size={26} />}
              color="violet"
            />
            <StatsCard
              title={t.dashboard.stats.thisMonth}
              value={`${stats.thisMonth} ${t.dashboard.stats.jobs}`}
              description={t.dashboard.stats.thisMonthDesc}
              trend={{
                value: stats.monthTrend,
                label: t.dashboard.stats.trendLabel,
              }}
              icon={<IconCalendarStats size={26} />}
              color="accent"
            />
          </>
        )}
      </SimpleGrid>

      {/* Kiosk Statistics */}
      <Box>
        <Group justify="space-between" align="center" mb="md">
          <Group gap="xs">
            <ThemeIcon size={24} radius="md" variant="light" color="accent">
              <IconScan size={14} />
            </ThemeIcon>
            <Text fw={600}>Statistik Mode Kiosk</Text>
          </Group>
          <Group gap="xs">
            {kioskLastSync && (
              <Text size="xs" c="dimmed">
                Terakhir sync: {new Date(kioskLastSync).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
            <Badge size="sm" variant="light" color="blue">
              Bulan ini
            </Badge>
            <Button
              size="compact-xs"
              variant="light"
              color="blue"
              leftSection={<IconRefresh size={14} />}
              loading={syncing}
              onClick={syncKioskData}
            >
              Sync
            </Button>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {loading ? (
            <>
              <Skeleton height={100} radius="lg" />
              <Skeleton height={100} radius="lg" />
              <Skeleton height={100} radius="lg" />
            </>
          ) : (
            <>
              <StatsCard
                title="Total Checkout"
                value={kioskStats?.totalCheckouts.toLocaleString() || "0"}
                description="Total transaksi bulan ini"
                icon={<IconScan size={22} />}
                color="cyan"
                compact
              />
              <StatsCard
                title="Pengguna Unik"
                value={kioskStats?.uniqueUsers.toLocaleString() || "0"}
                description="Staf yang menggunakan kiosk"
                icon={<IconUser size={22} />}
                color="teal"
                compact
              />
              <StatsCard
                title="Top User"
                value={kioskStats?.topUser?.name || kioskStats?.topUser?.email || "-"}
                description={`${kioskStats?.topUser?.count || 0} checkout`}
                icon={<IconActivity size={22} />}
                color="violet"
                compact
              />
            </>
          )}
        </SimpleGrid>
      </Box>

      {/* Top 5 Items */}
      <Box>
        <Group justify="space-between" align="center" mb="md">
          <Group gap="xs">
            <ThemeIcon size={24} radius="md" variant="light" color="orange">
              <IconTrophy size={14} />
            </ThemeIcon>
            <Text fw={600}>Top 5 Item Paling Sering Checkout</Text>
          </Group>
          <Badge size="sm" variant="light" color="orange">
            Bulan ini
          </Badge>
        </Group>
        {loading ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="md">
            <Skeleton height={120} radius="lg" />
            <Skeleton height={120} radius="lg" />
            <Skeleton height={120} radius="lg" />
            <Skeleton height={120} radius="lg" />
            <Skeleton height={120} radius="lg" />
          </SimpleGrid>
        ) : topItems.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="md">
            {topItems.map((item) => {
              const rankColors = ["yellow", "gray", "orange", "blue", "violet"];
              const color = rankColors[item.rank - 1] || "gray";
              return (
                <Paper
                  key={item.itemCode}
                  p="md"
                  radius="lg"
                  shadow="sm"
                  style={{
                    border: isDark
                      ? "1px solid var(--mantine-color-dark-4)"
                      : "1px solid var(--mantine-color-gray-2)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <Badge
                    size="lg"
                    variant="light"
                    color={color}
                    style={{ position: "absolute", top: 12, right: 12 }}
                  >
                    #{item.rank}
                  </Badge>
                  <Stack gap={6}>
                    <ThemeIcon
                      size={36}
                      radius="md"
                      variant="light"
                      color={color}
                    >
                      <IconPackage size={20} />
                    </ThemeIcon>
                    <Text fw={600} size="sm" lineClamp={2} mt={4}>
                      {item.itemName}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {item.itemCode}
                    </Text>
                    <Badge size="md" variant="filled" color={color} mt={4}>
                      {item.totalQuantity} unit
                    </Badge>
                  </Stack>
                </Paper>
              );
            })}
          </SimpleGrid>
        ) : (
          <Paper
            p="xl"
            radius="lg"
            shadow="sm"
            style={{
              border: isDark
                ? "1px solid var(--mantine-color-dark-4)"
                : "1px solid var(--mantine-color-gray-2)",
              textAlign: "center",
            }}
          >
            <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
              <IconPackage size={24} />
            </ThemeIcon>
            <Text c="dimmed" size="sm">
              Belum ada data checkout item bulan ini
            </Text>
          </Paper>
        )}
      </Box>

      {/* Charts */}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Kiosk Weekly Activity Chart */}
        <Paper
          p="md"
          radius="lg"
          shadow="sm"
          style={{
            border: isDark
              ? "1px solid var(--mantine-color-dark-4)"
              : "1px solid var(--mantine-color-gray-2)",
          }}
        >
          <Group justify="space-between" align="center" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="md" variant="light" color="cyan">
                <IconScan size={14} />
              </ThemeIcon>
              <Text fw={600}>Aktivitas Kiosk (7 Hari Terakhir)</Text>
            </Group>
            <Badge size="sm" variant="light" color="cyan">
              {kioskStats?.totalCheckouts || 0} checkout
            </Badge>
          </Group>

          {loading ? (
            <Skeleton height={200} radius="md" />
          ) : (
            <Box h={220} miw={0}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart
                  data={kioskWeeklyData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorKiosk"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#15AABF" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#15AABF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartGridColor}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="checkouts"
                    name="Checkout"
                    stroke="#15AABF"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorKiosk)"
                    dot={{ r: 3, fill: "#15AABF", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#15AABF", strokeWidth: 2, stroke: "white" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}

          <Group justify="center" gap="xl" mt="md">
            <Group gap="xs">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#15AABF",
                }}
              />
              <Text size="xs" c="dimmed">
                Self Checkout
              </Text>
            </Group>
          </Group>
        </Paper>

        {/* Weekly Activity Chart */}
        <Paper
          p="md"
          radius="lg"
          shadow="sm"
          style={{
            border: isDark
              ? "1px solid var(--mantine-color-dark-4)"
              : "1px solid var(--mantine-color-gray-2)",
          }}
        >
          <Group justify="space-between" align="center" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="md" variant="light" color="brand">
                <IconDatabase size={14} />
              </ThemeIcon>
              <Text fw={600}>{t.dashboard.charts.weeklyTitle}</Text>
            </Group>
            <Anchor size="xs" fw={500}>
              {t.dashboard.charts.viewDetail}
            </Anchor>
          </Group>

          {loading ? (
            <Skeleton height={200} radius="md" />
          ) : (
            <Box h={220} miw={0}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart
                  data={weeklyActivityData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorExports"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#228BE6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#228BE6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="colorImports"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#40C057" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#40C057" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartGridColor}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="exports"
                    name={t.dashboard.charts.exports}
                    stroke="#228BE6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorExports)"
                  />
                  <Area
                    type="monotone"
                    dataKey="imports"
                    name={t.dashboard.charts.imports}
                    stroke="#40C057"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorImports)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}

          <Group justify="center" gap="xl" mt="md">
            <Group gap="xs">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#228BE6",
                }}
              />
              <Text size="xs" c="dimmed">
                {t.dashboard.charts.exports}
              </Text>
            </Group>
            <Group gap="xs">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#40C057",
                }}
              />
              <Text size="xs" c="dimmed">
                {t.dashboard.charts.imports}
              </Text>
            </Group>
          </Group>
        </Paper>

        {/* Top Checkout Users */}
        <Paper
          p="md"
          radius="lg"
          shadow="sm"
          style={{
            border: isDark
              ? "1px solid var(--mantine-color-dark-4)"
              : "1px solid var(--mantine-color-gray-2)",
          }}
        >
          <Group justify="space-between" align="center" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="md" variant="light" color="grape">
                <IconUser size={14} />
              </ThemeIcon>
              <Text fw={600}>Top 10 User Checkout</Text>
            </Group>
            <Badge size="sm" variant="light" color="grape">
              Bulan ini
            </Badge>
          </Group>

          {loading ? (
            <Skeleton height={220} radius="md" />
          ) : topCheckoutUsers.length > 0 ? (
            <Box h={220} style={{ overflowY: "auto", paddingRight: rem(4) }}>
              <Stack gap={6}>
                {topCheckoutUsers.map((user) => (
                  <Group
                    key={user.email}
                    justify="space-between"
                    align="center"
                    wrap="nowrap"
                    px="xs"
                    py={6}
                    style={{
                      borderRadius: rem(12),
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "var(--mantine-color-gray-0)",
                    }}
                  >
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                      <Badge
                        size="md"
                        variant={user.rank <= 3 ? "filled" : "light"}
                        color={
                          user.rank === 1
                            ? "yellow"
                            : user.rank === 2
                              ? "gray"
                              : user.rank === 3
                                ? "orange"
                                : "grape"
                        }
                      >
                        #{user.rank}
                      </Badge>
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600} truncate>
                          {user.name || user.email}
                        </Text>
                        {user.name ? (
                          <Text size="xs" c="dimmed" truncate>
                            {user.email}
                          </Text>
                        ) : null}
                      </Box>
                    </Group>
                    <Badge size="sm" variant="light" color="grape">
                      {user.count}x
                    </Badge>
                  </Group>
                ))}
              </Stack>
            </Box>
          ) : (
            <Box h={220}>
              <EmptyState
                icon={<IconUser size={48} stroke={1.5} />}
                title="Belum ada ranking user"
                description="Data ranking checkout user akan muncul setelah sinkronisasi kiosk."
                size="sm"
              />
            </Box>
          )}
        </Paper>

        {/* Monthly Trend Chart */}
        <Paper
          p="md"
          radius="lg"
          shadow="sm"
          style={{
            border: isDark
              ? "1px solid var(--mantine-color-dark-4)"
              : "1px solid var(--mantine-color-gray-2)",
          }}
        >
          <Group justify="space-between" align="center" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="md" variant="light" color="accent">
                <IconCalendarStats size={14} />
              </ThemeIcon>
              <Text fw={600}>{t.dashboard.charts.monthlyTitle}</Text>
            </Group>
            <Badge size="sm" variant="light" color="teal">
              +25% {t.dashboard.charts.growth}
            </Badge>
          </Group>

          {loading ? (
            <Skeleton height={200} radius="md" />
          ) : (
            <Box h={220} miw={0}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={monthlyTrendData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FD7E14" stopOpacity={1} />
                      <stop
                        offset="95%"
                        stopColor="#FF922B"
                        stopOpacity={0.8}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartGridColor}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: chartTextColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="total"
                    name={t.dashboard.charts.totalOperations}
                    fill="url(#colorBar)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">
              {t.dashboard.charts.totalMonth}
            </Text>
            <Group gap={4}>
              <IconArrowUpRight size={14} color="#40C057" />
              <Text size="sm" fw={600}>
                {monthTotal} {t.dashboard.charts.operations}
              </Text>
            </Group>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Recent Activity */}
      <Box>
        {loading ? (
          <Paper p="md" radius="lg" shadow="sm">
            <Skeleton height={24} width={150} mb="md" />
            <Stack gap="md">
              <Skeleton height={60} radius="md" />
              <Skeleton height={60} radius="md" />
              <Skeleton height={60} radius="md" />
            </Stack>
          </Paper>
        ) : activities.length > 0 ? (
          <ActivityCard
            title={t.dashboard.activity.title}
            activities={activities}
            maxItems={5}
            onViewAll={() => console.log("Lihat semua aktivitas")}
          />
        ) : (
          <Paper
            p="xl"
            radius="lg"
            shadow="sm"
            style={{
              border: isDark
                ? "1px solid var(--mantine-color-dark-4)"
                : "1px solid var(--mantine-color-gray-2)",
            }}
          >
            <EmptyState
              variant="no-data"
              title={t.dashboard.activity.noActivity}
              description={t.dashboard.activity.noActivityDesc}
              action={{
                label: t.dashboard.activity.startExport,
                onClick: () =>
                (window.location.href =
                  "/dashboard/export/inventory-adjustment"),
              }}
            />
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
