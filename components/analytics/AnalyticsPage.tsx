"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  rem,
  useMantineColorScheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconAlertCircle,
  IconCalendarStats,
  IconChartAreaLine,
  IconChartBar,
  IconChecklist,
  IconClock,
  IconDatabase,
  IconFilter,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconScan,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatsCard } from "@/components/ui/StatsCard";

type AnalyticsMode = "overview" | "peminjaman" | "pengambilan";
type StatsColor =
  | "brand"
  | "accent"
  | "success"
  | "danger"
  | "violet"
  | "cyan"
  | "grape"
  | "teal";

interface StatCardConfig {
  label: string;
  value: string | number;
  description: string;
  color: StatsColor;
  icon: ReactNode;
}

const titles: Record<
  AnalyticsMode,
  {
    title: string;
    subtitle: string;
    endpoint: string;
    badge: string;
    color: string;
  }
> = {
  overview: {
    title: "Analytics Overview",
    subtitle:
      "Ringkasan peminjaman, pengambilan self-checkout, resource, dan pengguna teratas.",
    endpoint: "/api/analytics/overview",
    badge: "Cross-module",
    color: "blue",
  },
  peminjaman: {
    title: "Peminjaman Analytics",
    subtitle:
      "Analisis sesi pinjam, booking, return, overdue, dan resource yang sering dipinjam.",
    endpoint: "/api/analytics/peminjaman",
    badge: "Borrowing",
    color: "violet",
  },
  pengambilan: {
    title: "Pengambilan Analytics",
    subtitle:
      "Analisis self-checkout, staf, item, status, dan kegagalan transaksi.",
    endpoint: "/api/analytics/pengambilan",
    badge: "Kiosk",
    color: "cyan",
  },
};

const chartColors = ["#228BE6", "#40C057", "#FD7E14", "#7950F2"];

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString("id-ID");
  }
  return String(value);
}

function linkedCell(
  column: string,
  row: Record<string, unknown>,
  detailQueryString = "",
) {
  const value = row[column];
  const itemCode = typeof row.itemCode === "string" ? row.itemCode : null;
  const email = typeof value === "string" ? value : null;
  const detailQuery = detailQueryString ? `?${detailQueryString}` : "";

  if ((column === "itemCode" || column === "itemName") && itemCode) {
    return (
      <Text
        component={Link}
        href={`/dashboard/analytics/items/${encodeURIComponent(itemCode)}${detailQuery}`}
        c="blue"
        fw={600}
        size="sm"
      >
        {formatValue(value)}
      </Text>
    );
  }

  if (["email", "borrowerEmail", "staffEmail"].includes(column) && email) {
    return (
      <Text
        component={Link}
        href={`/dashboard/analytics/users/${encodeURIComponent(email)}${detailQuery}`}
        c="blue"
        fw={600}
        size="sm"
      >
        {formatValue(value)}
      </Text>
    );
  }

  return (
    <Text
      size="sm"
      c={value === null || value === undefined ? "dimmed" : undefined}
    >
      {formatValue(value)}
    </Text>
  );
}

function DashboardPanel({
  title,
  subtitle,
  icon,
  color = "blue",
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  color?: string;
  badge?: string | number;
  children: ReactNode;
}) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  return (
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
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size={24} radius="md" variant="light" color={color}>
            {icon}
          </ThemeIcon>
          <Box>
            <Text fw={600}>{title}</Text>
            {subtitle ? (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </Group>
        {badge !== undefined ? (
          <Badge size="sm" variant="light" color={color}>
            {badge}
          </Badge>
        ) : null}
      </Group>
      {children}
    </Paper>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  if (!active || !payload?.length) return null;

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
        <Group key={`${entry.name}-${index}`} gap="xs">
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

function DataTable({
  rows,
  detailQueryString = "",
  minWidth = 720,
  compact = false,
}: {
  rows: Record<string, unknown>[];
  detailQueryString?: string;
  minWidth?: number;
  compact?: boolean;
}) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const columns = rows.length
    ? Object.keys(rows[0])
        .filter((column) => column !== "sessionId")
        .slice(0, 10)
    : [];

  if (!rows.length) {
    return (
      <EmptyState
        title="Belum ada data"
        description="Ubah filter atau pilih rentang tanggal lain."
        size="sm"
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table
        striped
        highlightOnHover
        verticalSpacing={compact ? "xs" : "sm"}
        horizontalSpacing={compact ? "sm" : "md"}
      >
        <Table.Thead
          style={{
            backgroundColor: isDark
              ? "rgba(255,255,255,0.03)"
              : "var(--mantine-color-gray-0)",
          }}
        >
          <Table.Tr>
            {columns.map((column) => (
              <Table.Th
                key={column}
                style={{
                  width: column === "rank" ? rem(72) : undefined,
                  whiteSpace: "nowrap",
                }}
              >
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.4}>
                  {column}
                </Text>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, index) => (
            <Table.Tr key={index}>
              {columns.map((column) => (
                <Table.Td
                  key={column}
                  style={{
                    width: column === "rank" ? rem(72) : undefined,
                    whiteSpace: "nowrap",
                  }}
                >
                  {linkedCell(column, row, detailQueryString)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
  bars,
}: {
  title: string;
  subtitle: string;
  data: Record<string, unknown>[];
  bars: string[];
}) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const chartGridColor = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.1)";
  const chartTextColor = isDark ? "#909296" : "#868E96";

  return (
    <DashboardPanel
      title={title}
      subtitle={subtitle}
      icon={<IconChartAreaLine size={14} />}
      color="blue"
      badge={`${data.length} titik`}
    >
      {data.length ? (
        <Box h={300} miw={0}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {bars.length > 1 ? (
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  {bars.map((bar, index) => (
                    <linearGradient
                      key={bar}
                      id={`analytics-${bar}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={chartColors[index] || chartColors[0]}
                        stopOpacity={0.32}
                      />
                      <stop
                        offset="95%"
                        stopColor={chartColors[index] || chartColors[0]}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  ))}
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
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: chartTextColor }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {bars.map((bar, index) => (
                  <Area
                    key={bar}
                    type="monotone"
                    dataKey={bar}
                    name={bar}
                    stroke={chartColors[index] || chartColors[0]}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#analytics-${bar})`}
                    dot={{
                      r: 3,
                      fill: chartColors[index] || chartColors[0],
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 5,
                      fill: chartColors[index] || chartColors[0],
                      stroke: "white",
                      strokeWidth: 2,
                    }}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="analytics-bar"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#228BE6" stopOpacity={1} />
                    <stop offset="95%" stopColor="#4DABF7" stopOpacity={0.82} />
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
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: chartTextColor }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey={bars[0]}
                  name={bars[0]}
                  fill="url(#analytics-bar)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </Box>
      ) : (
        <EmptyState
          title="Chart kosong"
          description="Belum ada data untuk rentang filter ini."
          size="sm"
        />
      )}
    </DashboardPanel>
  );
}

export function AnalyticsPage({ mode }: { mode: AnalyticsMode }) {
  const config = titles[mode];
  const searchParams = useSearchParams();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const now = new Date();
  const startDateParam = parseDateParam(searchParams.get("startDate"));
  const endDateParam = parseDateParam(searchParams.get("endDate"));
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startDateParam || new Date(now.getFullYear(), now.getMonth(), 1),
    endDateParam || new Date(now.getFullYear(), now.getMonth() + 1, 0),
  ]);
  const [groupBy, setGroupBy] = useState<string | null>("day");
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange[0]) params.set("startDate", dateValue(dateRange[0]));
    if (dateRange[1]) params.set("endDate", dateValue(dateRange[1]));
    if (groupBy) params.set("groupBy", groupBy);
    if (status) params.set("status", status);
    if (email) params.set("email", email);
    if (itemCode) params.set("itemCode", itemCode);
    return params.toString();
  }, [dateRange, email, groupBy, itemCode, status]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${config.endpoint}?${queryString}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error || "Gagal memuat analytics");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat analytics");
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, queryString]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards = useMemo<StatCardConfig[]>(() => {
    if (!data) return [];
    if (mode === "overview") {
      return [
        {
          label: "Sesi Peminjaman",
          value: data.peminjamanSummary?.sessions || 0,
          description: "Total sesi pinjam pada rentang filter",
          color: "brand",
          icon: <IconDatabase size={24} />,
        },
        {
          label: "Qty Dipinjam",
          value: data.peminjamanSummary?.quantity || 0,
          description: "Akumulasi quantity dari semua resource",
          color: "success",
          icon: <IconPackage size={24} />,
        },
        {
          label: "Sesi Pengambilan",
          value: data.pengambilanSummary?.sessions || 0,
          description: "Total sesi self-checkout",
          color: "cyan",
          icon: <IconScan size={24} />,
        },
        {
          label: "Resource Unik",
          value: data.resourceSummary?.uniqueResources || 0,
          description: "Resource berbeda yang terlibat",
          color: "violet",
          icon: <IconChartBar size={24} />,
        },
      ];
    }
    if (mode === "peminjaman") {
      return [
        {
          label: "Total Sesi",
          value: data.summary?.totalSessions || 0,
          description: "Semua sesi peminjaman",
          color: "brand",
          icon: <IconDatabase size={24} />,
        },
        {
          label: "Aktif",
          value: data.summary?.active || 0,
          description: "Sesi yang masih berjalan",
          color: "success",
          icon: <IconClock size={24} />,
        },
        {
          label: "Overdue",
          value: data.summary?.overdue || 0,
          description: "Sesi melewati jatuh tempo",
          color: "danger",
          icon: <IconAlertCircle size={24} />,
        },
        {
          label: "Qty Dipinjam",
          value: data.summary?.totalQuantity || 0,
          description: "Total quantity yang dipinjam",
          color: "accent",
          icon: <IconPackage size={24} />,
        },
      ];
    }
    return [
      {
        label: "Total Sesi",
        value: data.summary?.totalSessions || 0,
        description: "Semua sesi pengambilan",
        color: "cyan",
        icon: <IconScan size={24} />,
      },
      {
        label: "Completed",
        value: data.summary?.completed || 0,
        description: "Sesi berhasil selesai",
        color: "success",
        icon: <IconChecklist size={24} />,
      },
      {
        label: "Failed",
        value: data.summary?.failed || 0,
        description: "Sesi gagal diproses",
        color: "danger",
        icon: <IconX size={24} />,
      },
      {
        label: "Unique Staff",
        value: data.summary?.uniqueStaff || 0,
        description: "Staf unik yang melakukan checkout",
        color: "violet",
        icon: <IconUsers size={24} />,
      },
    ];
  }, [data, mode]);

  const mainTrend =
    mode === "overview"
      ? data?.trends || []
      : data?.trend || data?.borrowedVsReturned || [];
  const chartBars =
    mode === "overview"
      ? ["peminjaman", "pengambilan"]
      : mode === "peminjaman"
        ? ["borrow", "booking", "return"]
        : ["checkouts"];
  const details = data?.details?.data || [];
  const totalRecords = data?.details?.total || details.length;
  const detailQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange[0]) params.set("startDate", dateValue(dateRange[0]));
    if (dateRange[1]) params.set("endDate", dateValue(dateRange[1]));
    return params.toString();
  }, [dateRange]);
  const dateLabel = `${dateRange[0]?.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  })} - ${dateRange[1]?.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>
            Performance insights
          </Text>
          <Group gap="xs" align="center">
            <Title order={2}>{config.title}</Title>
            <Badge variant="light" color={config.color} size="lg">
              {config.badge}
            </Badge>
          </Group>
          <Text c="dimmed" mt={4}>
            {config.subtitle}
          </Text>
        </Box>
        <Group gap="xs">
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
            {dateLabel}
          </Badge>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={loadData}
            loading={loading}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <Paper
        p="md"
        radius="lg"
        shadow="sm"
        style={{
          border: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
          background: isDark
            ? "linear-gradient(135deg, rgba(34,139,230,0.08) 0%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(135deg, var(--mantine-color-blue-0) 0%, white 100%)",
        }}
      >
        <Group justify="space-between" align="center" mb="md">
          <Group gap="xs">
            <ThemeIcon size={24} radius="md" variant="light" color="blue">
              <IconFilter size={14} />
            </ThemeIcon>
            <Box>
              <Text fw={600}>Filter Analytics</Text>
              <Text size="xs" c="dimmed">
                Sesuaikan periode, status, staff, dan item untuk drill-down.
              </Text>
            </Box>
          </Group>
          <Badge size="sm" variant="light" color="blue">
            MVP scope
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="md">
          <DatePickerInput
            type="range"
            label="Rentang tanggal"
            value={dateRange}
            onChange={setDateRange}
            clearable={false}
            leftSection={<IconCalendarStats size={16} />}
          />
          <Select
            label="Group by"
            value={groupBy}
            onChange={setGroupBy}
            data={[
              { value: "day", label: "Harian" },
              { value: "week", label: "Mingguan" },
              { value: "month", label: "Bulanan" },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            clearable
            data={[
              "active",
              "partial",
              "returned",
              "completed",
              "pending",
              "failed",
            ]}
          />
          <TextInput
            label="Email"
            placeholder="Cari email staff/user"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
          />
          <TextInput
            label="Item code / name"
            placeholder="Kode atau nama item"
            value={itemCode}
            onChange={(event) => setItemCode(event.currentTarget.value)}
            leftSection={<IconPackage size={16} />}
          />
        </SimpleGrid>
      </Paper>

      {error && (
        <Paper
          p="md"
          radius="lg"
          shadow="sm"
          style={{
            border: "1px solid var(--mantine-color-red-4)",
            backgroundColor: isDark
              ? "rgba(250, 82, 82, 0.08)"
              : "var(--mantine-color-red-0)",
          }}
        >
          <Group gap="xs">
            <ThemeIcon variant="light" color="red" radius="xl">
              <IconAlertCircle size={18} />
            </ThemeIcon>
            <Text c="red" fw={600}>
              {error}
            </Text>
          </Group>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} height={140} radius="lg" />
            ))
          : cards.map((card) => (
              <StatsCard
                key={card.label}
                title={card.label}
                value={card.value.toLocaleString("id-ID")}
                description={card.description}
                icon={card.icon}
                color={card.color}
              />
            ))}
      </SimpleGrid>

      {loading ? (
        <Paper p="md" radius="lg" shadow="sm">
          <Skeleton height={28} width={180} mb="md" />
          <Skeleton height={300} radius="md" />
        </Paper>
      ) : (
        <ChartCard
          title="Trend Aktivitas"
          subtitle="Pergerakan volume transaksi berdasarkan filter aktif."
          data={mainTrend}
          bars={chartBars}
        />
      )}

      {!loading && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <DashboardPanel
            title="Top Resources"
            subtitle="Resource paling aktif pada periode ini."
            icon={<IconPackage size={14} />}
            color="orange"
            badge="Top 8"
          >
            <DataTable
              detailQueryString={detailQueryString}
              minWidth={520}
              compact
              rows={(
                data?.topResources ||
                data?.topItems ||
                data?.topBorrowed ||
                []
              ).slice(0, 8)}
            />
          </DashboardPanel>
          <DashboardPanel
            title="Top Users / Staff"
            subtitle="Pengguna dan staf dengan aktivitas tertinggi."
            icon={<IconUsers size={14} />}
            color="grape"
            badge="Top 8"
          >
            <DataTable
              detailQueryString={detailQueryString}
              minWidth={420}
              compact
              rows={(
                data?.topUsers ||
                data?.topBorrowers ||
                data?.topStaff ||
                data?.topCheckedOut ||
                []
              ).slice(0, 8)}
            />
          </DashboardPanel>
        </SimpleGrid>
      )}

      {!loading && (
        <DashboardPanel
          title="Detail Drill-down"
          subtitle="Data mentah terfilter untuk investigasi lebih lanjut."
          icon={<IconDatabase size={14} />}
          color="teal"
          badge={`${totalRecords.toLocaleString("id-ID")} records`}
        >
          <Box
            style={{
              maxHeight: rem(520),
              overflowY: "auto",
              paddingRight: rem(4),
            }}
          >
            <DataTable
              rows={details}
              detailQueryString={detailQueryString}
              minWidth={900}
            />
          </Box>
        </DashboardPanel>
      )}
    </Stack>
  );
}
