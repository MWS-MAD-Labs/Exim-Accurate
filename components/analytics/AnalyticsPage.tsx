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
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import {
  IconAlertCircle,
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
import { AnalyticsDateRangeFields } from "@/components/analytics/AnalyticsDateRangeFields";
import { useLanguage, type AppLanguage } from "@/lib/language";
import { sendToSignIn } from "@/lib/sign-in-redirect";

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

const modes: Record<AnalyticsMode, { endpoint: string; color: string }> = {
  overview: {
    endpoint: "/api/analytics/overview",
    color: "blue",
  },
  peminjaman: {
    endpoint: "/api/analytics/peminjaman",
    color: "violet",
  },
  pengambilan: {
    endpoint: "/api/analytics/pengambilan",
    color: "cyan",
  },
};

const modeCopy = {
  id: {
    overview: {
      title: "Ringkasan Analitik",
      subtitle: "Ringkasan peminjaman, pengambilan mandiri, sumber daya, dan pengguna teratas.",
      badge: "Lintas modul",
    },
    peminjaman: {
      title: "Analitik Peminjaman",
      subtitle: "Analisis sesi peminjaman, reservasi, pengembalian, keterlambatan, dan sumber daya yang sering dipinjam.",
      badge: "Peminjaman",
    },
    pengambilan: {
      title: "Analitik Pengambilan",
      subtitle: "Analisis pengambilan mandiri, staf, item, status, dan kegagalan transaksi.",
      badge: "Kios",
    },
  },
  en: {
    overview: {
      title: "Analytics Overview",
      subtitle: "A summary of borrowing, self-checkout, top resources, and top users.",
      badge: "Cross-module",
    },
    peminjaman: {
      title: "Borrowing Analytics",
      subtitle: "Analyze borrowing sessions, bookings, returns, overdue items, and frequently borrowed resources.",
      badge: "Borrowing",
    },
    pengambilan: {
      title: "Checkout Analytics",
      subtitle: "Analyze self-checkout activity, staff, items, statuses, and transaction failures.",
      badge: "Kiosk",
    },
  },
};

const chartColors = ["#6F8B6A", "#D6A13A", "#79AFC7", "#486142"];

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const valueLabels: Record<AppLanguage, Record<string, string>> = {
  id: {
    active: "Aktif",
    partial: "Dikembalikan sebagian",
    returned: "Dikembalikan",
    completed: "Selesai",
    pending: "Menunggu",
    failed: "Gagal",
    booking: "Reservasi",
    borrow: "Peminjaman",
    peminjaman: "Peminjaman",
    pengambilan: "Pengambilan",
  },
  en: {
    active: "Active",
    partial: "Partially returned",
    returned: "Returned",
    completed: "Completed",
    pending: "Pending",
    failed: "Failed",
    booking: "Booking",
    borrow: "Borrowing",
    peminjaman: "Borrowing",
    pengambilan: "Checkout",
  },
};

function formatValue(value: unknown, language: AppLanguage) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") {
    return value ? (language === "id" ? "Ya" : "Yes") : (language === "id" ? "Tidak" : "No");
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString(language === "id" ? "id-ID" : "en-US");
  }
  if (typeof value === "string") {
    return valueLabels[language][value] ?? value;
  }
  return String(value);
}

const columnLabels: Record<AppLanguage, Record<string, string>> = {
  id: {
    rank: "Peringkat", borrowedAt: "Tanggal dipinjam", startsAt: "Tanggal mulai",
    dueAt: "Jatuh tempo", returnedAt: "Tanggal kembali", createdAt: "Tanggal dibuat",
    completedAt: "Tanggal selesai", type: "Jenis", status: "Status",
    borrowerEmail: "Email peminjam", borrowerName: "Nama peminjam", staffEmail: "Email staf",
    staffName: "Nama staf", email: "Email", name: "Nama", itemCode: "Kode item",
    itemName: "Nama item", quantity: "Jumlah", returnedQty: "Jumlah kembali",
    overdue: "Terlambat", total: "Total", source: "Sumber",
    errorMessage: "Pesan kesalahan", adjustmentId: "ID penyesuaian",
  },
  en: {
    rank: "Rank", borrowedAt: "Borrowed at", startsAt: "Start date", dueAt: "Due date",
    returnedAt: "Returned at", createdAt: "Created at", completedAt: "Completed at",
    type: "Type", status: "Status", borrowerEmail: "Borrower email",
    borrowerName: "Borrower name", staffEmail: "Staff email", staffName: "Staff name",
    email: "Email", name: "Name", itemCode: "Item code", itemName: "Item name",
    quantity: "Quantity", returnedQty: "Returned quantity", overdue: "Overdue",
    total: "Total", source: "Source", errorMessage: "Error message",
    adjustmentId: "Adjustment ID",
  },
};

const chartMetricLabels: Record<AppLanguage, Record<string, string>> = {
  id: {
    peminjaman: "Peminjaman", pengambilan: "Pengambilan", borrow: "Dipinjam",
    booking: "Reservasi", return: "Dikembalikan", checkouts: "Pengambilan",
  },
  en: {
    peminjaman: "Borrowing", pengambilan: "Checkout", borrow: "Borrowed",
    booking: "Booked", return: "Returned", checkouts: "Checkouts",
  },
};

function linkedCell(
  column: string,
  row: Record<string, unknown>,
  language: AppLanguage,
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
        {formatValue(value, language)}
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
        {formatValue(value, language)}
      </Text>
    );
  }

  return (
    <Text
      size="sm"
      c={value === null || value === undefined ? "dimmed" : undefined}
    >
      {formatValue(value, language)}
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
  const colorScheme = useAppColorScheme();
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
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  if (!active || !payload?.length) return null;

  return (
    <Paper
      p="sm"
      radius="md"
      shadow="md"
      style={{
        backgroundColor: isDark ? "var(--mantine-color-dark-6)" : "var(--mantine-color-white)",
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
  const { language } = useLanguage();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";
  const columns = rows.length
    ? Object.keys(rows[0])
        .filter((column) => column !== "sessionId")
        .slice(0, 10)
    : [];

  if (!rows.length) {
    return (
      <EmptyState
        title={language === "id" ? "Belum ada data" : "No data yet"}
        description={language === "id" ? "Ubah filter atau pilih rentang tanggal lain." : "Change the filters or select another date range."}
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
                  {columnLabels[language][column] ?? column}
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
                  {linkedCell(column, row, language, detailQueryString)}
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
  const { language } = useLanguage();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";
  const chartGridColor = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.1)";
  const chartTextColor = isDark ? "#949B88" : "#7C776E";

  return (
    <DashboardPanel
      title={title}
      subtitle={subtitle}
      icon={<IconChartAreaLine size={14} />}
      color="blue"
      badge={`${data.length} ${language === "id" ? "titik" : "points"}`}
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
                    name={chartMetricLabels[language][bar] ?? bar}
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
                    <stop offset="5%" stopColor="#6F8B6A" stopOpacity={1} />
                    <stop offset="95%" stopColor="#9DB18F" stopOpacity={0.82} />
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
                  name={chartMetricLabels[language][bars[0]] ?? bars[0]}
                  fill="url(#analytics-bar)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </Box>
      ) : (
        <EmptyState
          title={language === "id" ? "Grafik kosong" : "Empty chart"}
          description={language === "id" ? "Belum ada data untuk rentang filter ini." : "No data is available for the selected filters."}
          size="sm"
        />
      )}
    </DashboardPanel>
  );
}

const pageCopy = {
  id: {
    loadError: "Gagal memuat analitik",
    performance: "Insight performa",
    refresh: "Perbarui",
    filterTitle: "Filter Analitik",
    filterSubtitle: "Sesuaikan periode, status, staf, dan item untuk menelusuri data.",
    scope: "Cakupan utama",
    startDate: "Tanggal mulai",
    endDate: "Tanggal akhir",
    groupBy: "Kelompokkan berdasarkan",
    groups: [{ value: "day", label: "Harian" }, { value: "week", label: "Mingguan" }, { value: "month", label: "Bulanan" }],
    statuses: [
      { value: "active", label: "Aktif" }, { value: "partial", label: "Sebagian" },
      { value: "returned", label: "Dikembalikan" }, { value: "completed", label: "Selesai" },
      { value: "pending", label: "Menunggu" }, { value: "failed", label: "Gagal" },
    ],
    emailPlaceholder: "Cari email staf/pengguna",
    itemLabel: "Kode / nama item",
    itemPlaceholder: "Kode atau nama item",
    activityTrend: "Tren Aktivitas",
    trendSubtitle: "Pergerakan volume transaksi berdasarkan filter aktif.",
    topResources: "Sumber Daya Teratas",
    topResourcesSubtitle: "Sumber daya paling aktif pada periode ini.",
    topPeople: "Pengguna / Staf Teratas",
    topPeopleSubtitle: "Pengguna dan staf dengan aktivitas tertinggi.",
    topEight: "8 Teratas",
    detailTitle: "Detail Data",
    detailSubtitle: "Data mentah terfilter untuk pemeriksaan lebih lanjut.",
    records: "data",
    overviewCards: [
      ["Sesi Peminjaman", "Total sesi pinjam pada rentang filter"],
      ["Jumlah Dipinjam", "Akumulasi jumlah dari semua sumber daya"],
      ["Sesi Pengambilan", "Total sesi pengambilan mandiri"],
      ["Sumber Daya Unik", "Sumber daya berbeda yang terlibat"],
    ],
    borrowingCards: [
      ["Total Sesi", "Semua sesi peminjaman"], ["Aktif", "Sesi yang masih berjalan"],
      ["Terlambat", "Sesi melewati jatuh tempo"], ["Jumlah Dipinjam", "Total jumlah yang dipinjam"],
    ],
    checkoutCards: [
      ["Total Sesi", "Semua sesi pengambilan"], ["Selesai", "Sesi berhasil selesai"],
      ["Gagal", "Sesi gagal diproses"], ["Staf Unik", "Staf unik yang melakukan pengambilan"],
    ],
  },
  en: {
    loadError: "Unable to load analytics",
    performance: "Performance insights",
    refresh: "Refresh",
    filterTitle: "Analytics Filters",
    filterSubtitle: "Adjust the period, status, staff, and item filters to explore the data.",
    scope: "Primary scope",
    startDate: "Start date",
    endDate: "End date",
    groupBy: "Group by",
    groups: [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }],
    statuses: [
      { value: "active", label: "Active" }, { value: "partial", label: "Partially returned" },
      { value: "returned", label: "Returned" }, { value: "completed", label: "Completed" },
      { value: "pending", label: "Pending" }, { value: "failed", label: "Failed" },
    ],
    emailPlaceholder: "Search staff/user email",
    itemLabel: "Item code / name",
    itemPlaceholder: "Item code or name",
    activityTrend: "Activity Trend",
    trendSubtitle: "Transaction volume over time based on the active filters.",
    topResources: "Top Resources",
    topResourcesSubtitle: "The most active resources in this period.",
    topPeople: "Top Users / Staff",
    topPeopleSubtitle: "Users and staff with the highest activity.",
    topEight: "Top 8",
    detailTitle: "Detailed Data",
    detailSubtitle: "Filtered raw data for further investigation.",
    records: "records",
    overviewCards: [
      ["Borrowing Sessions", "Total borrowing sessions in the selected range"],
      ["Borrowed Quantity", "Total quantity across all resources"],
      ["Checkout Sessions", "Total self-checkout sessions"],
      ["Unique Resources", "Distinct resources involved"],
    ],
    borrowingCards: [
      ["Total Sessions", "All borrowing sessions"], ["Active", "Sessions currently in progress"],
      ["Overdue", "Sessions past their due date"], ["Borrowed Quantity", "Total quantity borrowed"],
    ],
    checkoutCards: [
      ["Total Sessions", "All checkout sessions"], ["Completed", "Successfully completed sessions"],
      ["Failed", "Sessions that failed to process"], ["Unique Staff", "Distinct staff who performed checkouts"],
    ],
  },
} as const;

export function AnalyticsPage({ mode }: { mode: AnalyticsMode }) {
  const { language } = useLanguage();
  const copy = pageCopy[language];
  const config = { ...modes[mode], ...modeCopy[language][mode] };
  const searchParams = useSearchParams();
  const colorScheme = useAppColorScheme();
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
        sendToSignIn();
        return;
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error || copy.loadError);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, copy.loadError, queryString]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards = useMemo<StatCardConfig[]>(() => {
    if (!data) return [];
    if (mode === "overview") {
      return [
        {
          label: copy.overviewCards[0][0],
          value: data.peminjamanSummary?.sessions || 0,
          description: copy.overviewCards[0][1],
          color: "brand",
          icon: <IconDatabase size={24} />,
        },
        {
          label: copy.overviewCards[1][0],
          value: data.peminjamanSummary?.quantity || 0,
          description: copy.overviewCards[1][1],
          color: "success",
          icon: <IconPackage size={24} />,
        },
        {
          label: copy.overviewCards[2][0],
          value: data.pengambilanSummary?.sessions || 0,
          description: copy.overviewCards[2][1],
          color: "cyan",
          icon: <IconScan size={24} />,
        },
        {
          label: copy.overviewCards[3][0],
          value: data.resourceSummary?.uniqueResources || 0,
          description: copy.overviewCards[3][1],
          color: "violet",
          icon: <IconChartBar size={24} />,
        },
      ];
    }
    if (mode === "peminjaman") {
      return [
        {
          label: copy.borrowingCards[0][0],
          value: data.summary?.totalSessions || 0,
          description: copy.borrowingCards[0][1],
          color: "brand",
          icon: <IconDatabase size={24} />,
        },
        {
          label: copy.borrowingCards[1][0],
          value: data.summary?.active || 0,
          description: copy.borrowingCards[1][1],
          color: "success",
          icon: <IconClock size={24} />,
        },
        {
          label: copy.borrowingCards[2][0],
          value: data.summary?.overdue || 0,
          description: copy.borrowingCards[2][1],
          color: "danger",
          icon: <IconAlertCircle size={24} />,
        },
        {
          label: copy.borrowingCards[3][0],
          value: data.summary?.totalQuantity || 0,
          description: copy.borrowingCards[3][1],
          color: "accent",
          icon: <IconPackage size={24} />,
        },
      ];
    }
    return [
      {
        label: copy.checkoutCards[0][0],
        value: data.summary?.totalSessions || 0,
        description: copy.checkoutCards[0][1],
        color: "cyan",
        icon: <IconScan size={24} />,
      },
      {
        label: copy.checkoutCards[1][0],
        value: data.summary?.completed || 0,
        description: copy.checkoutCards[1][1],
        color: "success",
        icon: <IconChecklist size={24} />,
      },
      {
        label: copy.checkoutCards[2][0],
        value: data.summary?.failed || 0,
        description: copy.checkoutCards[2][1],
        color: "danger",
        icon: <IconX size={24} />,
      },
      {
        label: copy.checkoutCards[3][0],
        value: data.summary?.uniqueStaff || 0,
        description: copy.checkoutCards[3][1],
        color: "violet",
        icon: <IconUsers size={24} />,
      },
    ];
  }, [copy, data, mode]);

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
  const numberLocale = language === "id" ? "id-ID" : "en-US";
  const dateLabel = `${dateRange[0]?.toLocaleDateString(numberLocale, {
    day: "numeric",
    month: "short",
  })} - ${dateRange[1]?.toLocaleDateString(numberLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>
            {copy.performance}
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
            {copy.refresh}
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
            ? "linear-gradient(135deg, rgba(121,175,199,0.08) 0%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-white) 100%)",
        }}
      >
        <Group justify="space-between" align="center" mb="md">
          <Group gap="xs">
            <ThemeIcon size={24} radius="md" variant="light" color="blue">
              <IconFilter size={14} />
            </ThemeIcon>
            <Box>
              <Text fw={600}>{copy.filterTitle}</Text>
              <Text size="xs" c="dimmed">
                {copy.filterSubtitle}
              </Text>
            </Box>
          </Group>
          <Badge size="sm" variant="light" color="blue">
            {copy.scope}
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          <AnalyticsDateRangeFields
            value={dateRange}
            onChange={setDateRange}
            startLabel={copy.startDate}
            endLabel={copy.endDate}
            locale={language}
          />
          <Select
            label={copy.groupBy}
            value={groupBy}
            onChange={setGroupBy}
            data={[...copy.groups]}
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            clearable
            data={[...copy.statuses]}
          />
          <TextInput
            label="Email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
          />
          <TextInput
            label={copy.itemLabel}
            placeholder={copy.itemPlaceholder}
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
              ? "rgba(204, 102, 102, 0.08)"
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
                value={card.value.toLocaleString(numberLocale)}
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
          title={copy.activityTrend}
          subtitle={copy.trendSubtitle}
          data={mainTrend}
          bars={chartBars}
        />
      )}

      {!loading && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <DashboardPanel
            title={copy.topResources}
            subtitle={copy.topResourcesSubtitle}
            icon={<IconPackage size={14} />}
            color="orange"
            badge={copy.topEight}
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
            title={copy.topPeople}
            subtitle={copy.topPeopleSubtitle}
            icon={<IconUsers size={14} />}
            color="grape"
            badge={copy.topEight}
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
          title={copy.detailTitle}
          subtitle={copy.detailSubtitle}
          icon={<IconDatabase size={14} />}
          color="teal"
          badge={`${totalRecords.toLocaleString(numberLocale)} ${copy.records}`}
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
