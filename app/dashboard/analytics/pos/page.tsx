"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconAlertCircle,
  IconBox,
  IconCalendarStats,
  IconChartLine,
  IconCoins,
  IconDownload,
  IconPackageExport,
  IconReceipt,
  IconRefresh,
  IconShoppingCart,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/EmptyState";
import { StatsCard } from "@/components/ui/StatsCard";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
  disconnectedAt: string | null;
}

interface PosAnalyticsData {
  period: {
    start: string;
    end: string;
    days: number;
    previousStart: string;
    previousEnd: string;
  };
  summary: {
    revenue: string;
    cost: string;
    profit: string;
    margin: string;
    units: number;
    sales: number;
    averageOrderValue: string;
    averageUnitsPerSale: number;
  };
  comparison: {
    revenue: number | null;
    cost: number | null;
    profit: number | null;
    units: number | null;
    sales: number | null;
  };
  inventory: {
    activeProducts: number;
    inventoryValue: string;
    lowStock: number;
    outOfStock: number;
    recommendedRestockUnits: number;
    recommendedRestockCost: string;
    productSyncErrors: number;
  };
  transactionHealth: {
    total: number;
    synced: number;
    pending: number;
    failed: number;
    voiding: number;
    voided: number;
  };
  topItems: Array<{
    itemCode: string;
    itemName: string;
    units: number;
    orders: number;
    revenue: string;
    cost: string;
    profit: string;
    margin: string;
    currentStock: number | null;
  }>;
  restock: Array<{
    itemCode: string;
    itemName: string;
    currentStock: number;
    soldUnits: number;
    dailyVelocity: number;
    daysCover: number | null;
    reorderPoint: number;
    recommendedUnits: number;
    estimatedCost: string;
    status: "out_of_stock" | "low_stock" | "healthy";
  }>;
  paymentMix: Array<{ paymentMethod: string; count: number; revenue: string }>;
  customerMix: Array<{ buyerType: string; count: number; revenue: string }>;
  trend: Array<{
    date: string;
    revenue: string;
    cost: string;
    profit: string;
    sales: number;
    units: number;
  }>;
}

const PIE_COLORS = ["#228BE6", "#12B886", "#FD7E14", "#7950F2"];

function dateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvCell(value: string | number) {
  const text = String(value);
  const isNumeric = text.trim() !== "" && Number.isFinite(Number(text));
  const safeText = !isNumeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText;
}

function Panel({
  title,
  subtitle,
  badge,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colorScheme } = useMantineColorScheme();
  return (
    <Paper
      p="lg"
      radius="lg"
      shadow="sm"
      style={{
        border: colorScheme === "dark"
          ? "1px solid var(--mantine-color-dark-4)"
          : "1px solid var(--mantine-color-gray-2)",
      }}
    >
      <Group justify="space-between" align="flex-start" mb="lg">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon variant="light" radius="md" size={38}>{icon}</ThemeIcon>
          <Box>
            <Text fw={700}>{title}</Text>
            <Text size="xs" c="dimmed">{subtitle}</Text>
          </Box>
        </Group>
        {badge ? <Badge variant="light">{badge}</Badge> : null}
      </Group>
      {children}
    </Paper>
  );
}

export default function PosAnalyticsPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const today = useMemo(() => new Date(), []);
  const initialStart = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 29);
    return date;
  }, [today]);

  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    initialStart,
    today,
  ]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [data, setData] = useState<PosAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const money = useMemo(
    () => new Intl.NumberFormat(isId ? "id-ID" : "en-US", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }),
    [isId],
  );
  const number = useMemo(() => new Intl.NumberFormat(isId ? "id-ID" : "en-US"), [isId]);

  const labels = useMemo(() => isId ? {
    title: "Analitik & Laporan POS",
    subtitle: "Pantau penjualan, laba kotor, kesehatan transaksi, dan kebutuhan restock dalam satu laporan.",
    allCredentials: "Semua kredensial",
    credential: "Kredensial Accurate",
    dateRange: "Rentang tanggal",
    refresh: "Perbarui",
    export: "Unduh CSV",
    revenue: "Pendapatan",
    cogs: "Harga pokok terjual",
    profit: "Laba kotor",
    margin: "Margin kotor",
    sales: "Transaksi berhasil",
    units: "Unit terjual",
    averageOrder: "Rata-rata transaksi",
    previousPeriod: "dibanding periode sebelumnya",
    noComparison: "Belum ada data pembanding",
    salesTrend: "Tren pendapatan & laba",
    salesTrendSubtitle: "Hanya transaksi yang sudah tersinkron ke Accurate.",
    paymentMix: "Metode pembayaran",
    paymentMixSubtitle: "Kontribusi transaksi per metode pembayaran.",
    itemPerformance: "Profitabilitas barang",
    itemPerformanceSubtitle: "Peringkat berdasarkan pendapatan dalam periode terpilih.",
    restock: "Rekomendasi restock",
    restockSubtitle: "Perkiraan kebutuhan 14 hari berdasarkan kecepatan penjualan periode ini; bukan catatan pembelian aktual.",
    inventoryValue: "Nilai persediaan (biaya)",
    activeProducts: "Produk aktif",
    lowStock: "Stok rendah",
    outOfStock: "Stok habis",
    restockUnits: "Saran unit restock",
    restockCost: "Estimasi dana restock",
    transactionHealth: "Kesehatan transaksi",
    transactionHealthSubtitle: "Status sinkronisasi transaksi pada rentang terpilih.",
    synced: "Tersinkron",
    pending: "Menunggu",
    failed: "Gagal",
    voiding: "Perlu rekonsiliasi",
    voided: "Dibatalkan",
    item: "Barang",
    stock: "Stok",
    sold: "Terjual",
    revenueTable: "Pendapatan",
    cost: "HPP",
    profitTable: "Laba",
    marginTable: "Margin",
    velocity: "Unit/hari",
    cover: "Cakupan",
    reorderPoint: "Batas restock",
    recommendation: "Saran",
    estimatedCost: "Estimasi biaya",
    days: "hari",
    healthy: "Aman",
    noSales: "Belum ada penjualan",
    noSalesDescription: "Pilih rentang tanggal atau kredensial lain untuk melihat laporan.",
    loadError: "Laporan POS tidak dapat dimuat",
    syncWarning: "Ada transaksi yang belum masuk perhitungan laba karena belum berhasil tersinkron.",
    inventoryWarning: "Ada produk yang gagal sinkron dan perlu diperiksa di manajemen stok.",
  } : {
    title: "POS Analytics & Reports",
    subtitle: "Monitor sales, gross profit, transaction health, and restock needs in one report.",
    allCredentials: "All credentials",
    credential: "Accurate credential",
    dateRange: "Date range",
    refresh: "Refresh",
    export: "Download CSV",
    revenue: "Revenue",
    cogs: "Cost of goods sold",
    profit: "Gross profit",
    margin: "Gross margin",
    sales: "Successful sales",
    units: "Units sold",
    averageOrder: "Average order value",
    previousPeriod: "versus previous period",
    noComparison: "No comparison data yet",
    salesTrend: "Revenue & profit trend",
    salesTrendSubtitle: "Includes only transactions synced to Accurate.",
    paymentMix: "Payment methods",
    paymentMixSubtitle: "Transaction contribution by payment method.",
    itemPerformance: "Item profitability",
    itemPerformanceSubtitle: "Ranked by revenue in the selected period.",
    restock: "Restock recommendations",
    restockSubtitle: "14-day demand estimate based on current-period sales velocity; not an actual purchase ledger.",
    inventoryValue: "Inventory value (cost)",
    activeProducts: "Active products",
    lowStock: "Low stock",
    outOfStock: "Out of stock",
    restockUnits: "Suggested restock units",
    restockCost: "Estimated restock funding",
    transactionHealth: "Transaction health",
    transactionHealthSubtitle: "Sales synchronization status in the selected range.",
    synced: "Synced",
    pending: "Pending",
    failed: "Failed",
    voiding: "Needs reconciliation",
    voided: "Voided",
    item: "Item",
    stock: "Stock",
    sold: "Sold",
    revenueTable: "Revenue",
    cost: "COGS",
    profitTable: "Profit",
    marginTable: "Margin",
    velocity: "Units/day",
    cover: "Coverage",
    reorderPoint: "Reorder point",
    recommendation: "Suggestion",
    estimatedCost: "Estimated cost",
    days: "days",
    healthy: "Healthy",
    noSales: "No sales yet",
    noSalesDescription: "Choose another date range or credential to view the report.",
    loadError: "Unable to load the POS report",
    syncWarning: "Some transactions are excluded from profit calculations because they have not synced successfully.",
    inventoryWarning: "Some products failed to sync and should be checked in stock management.",
  }, [isId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange[0]) params.set("start", dateParam(dateRange[0]));
    if (dateRange[1]) params.set("end", dateParam(dateRange[1]));
    if (credentialId) params.set("credentialId", credentialId);
    return params.toString();
  }, [credentialId, dateRange]);

  const loadData = useCallback(async (quiet = false) => {
    if (!dateRange[0] || !dateRange[1]) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analytics/pos?${queryString}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || labels.loadError);
      if (!controller.signal.aborted) setData(payload);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : labels.loadError);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateRange, labels.loadError, queryString]);

  useEffect(() => {
    void fetch("/api/credentials", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: Credential[]) => setCredentials(Array.isArray(payload) ? payload : []))
      .catch(() => setCredentials([]));
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const credentialOptions = useMemo(() => [
    { value: "all", label: labels.allCredentials },
    ...credentials.map((credential, index) => ({
      value: credential.id,
      label: `${credential.appKey || `Accurate ${index + 1}`}${credential.disconnectedAt ? " · disconnected" : ""}`,
    })),
  ], [credentials, labels.allCredentials]);

  const trendData = useMemo(() => data?.trend.map((row) => ({
    ...row,
    name: new Date(`${row.date}T00:00:00`).toLocaleDateString(isId ? "id-ID" : "en-US", {
      day: "2-digit",
      month: "short",
    }),
    revenueValue: Number(row.revenue),
    costValue: Number(row.cost),
    profitValue: Number(row.profit),
  })) ?? [], [data, isId]);

  const paymentData = useMemo(() => data?.paymentMix.map((row) => ({
    ...row,
    name: row.paymentMethod === "cash" ? (isId ? "Tunai" : "Cash") : row.paymentMethod.toUpperCase(),
    value: row.count,
  })) ?? [], [data, isId]);

  const itemChartData = useMemo(() => data?.topItems.slice(0, 8).map((item) => ({
    name: item.itemName.length > 18 ? `${item.itemName.slice(0, 18)}…` : item.itemName,
    profit: Number(item.profit),
  })) ?? [], [data]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      [labels.title],
      [labels.dateRange, data.period.start, data.period.end],
      [],
      [labels.revenue, data.summary.revenue],
      [labels.cogs, data.summary.cost],
      [labels.profit, data.summary.profit],
      [labels.margin, `${(Number(data.summary.margin) * 100).toFixed(1)}%`],
      [labels.sales, data.summary.sales],
      [labels.units, data.summary.units],
      [],
      [labels.item, "Item code", labels.units, labels.revenueTable, labels.cost, labels.profitTable, labels.marginTable, labels.stock],
      ...data.topItems.map((item) => [
        item.itemName,
        item.itemCode,
        item.units,
        item.revenue,
        item.cost,
        item.profit,
        `${(Number(item.margin) * 100).toFixed(1)}%`,
        item.currentStock ?? "-",
      ]),
      [],
      [labels.restock, "Item code", labels.stock, labels.sold, labels.velocity, labels.reorderPoint, labels.recommendation, labels.estimatedCost],
      ...data.restock.filter((item) => item.recommendedUnits > 0).map((item) => [
        item.itemName,
        item.itemCode,
        item.currentStock,
        item.soldUnits,
        item.dailyVelocity,
        item.reorderPoint,
        item.recommendedUnits,
        item.estimatedCost,
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pos-report-${data.period.start}-${data.period.end}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data, labels]);

  const trend = (value: number | null) => value === null ? undefined : {
    value,
    label: labels.previousPeriod,
  };

  const formatMoney = (value: string | number) => money.format(Number(value));
  const hasSyncIssues = Boolean(data && (data.transactionHealth.pending > 0 || data.transactionHealth.failed > 0 || data.transactionHealth.voiding > 0));
  const syncRelevantTotal = data
    ? data.transactionHealth.total - data.transactionHealth.voided
    : 0;
  const successfulRate = data && syncRelevantTotal > 0
    ? (data.transactionHealth.synced / syncRelevantTotal) * 100
    : 0;
  const syncedLifecycleRate = data?.transactionHealth.total
    ? (data.transactionHealth.synced / data.transactionHealth.total) * 100
    : 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs" mb={4}>
            <Title order={1}>{labels.title}</Title>
            <Badge variant="gradient" gradient={{ from: "blue", to: "cyan" }}>POS</Badge>
          </Group>
          <Text c="dimmed">{labels.subtitle}</Text>
        </Box>
        <Button
          variant="light"
          leftSection={<IconDownload size={16} />}
          onClick={exportCsv}
          disabled={!data}
        >
          {labels.export}
        </Button>
      </Group>

      <Paper p="md" radius="lg" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range"
            label={labels.dateRange}
            value={dateRange}
            onChange={setDateRange}
            clearable={false}
            leftSection={<IconCalendarStats size={16} />}
            maxDate={today}
            flex={1}
            miw={260}
          />
          <Select
            label={labels.credential}
            data={credentialOptions}
            value={credentialId ?? "all"}
            onChange={(value) => setCredentialId(value === "all" ? null : value)}
            searchable
            flex={1}
            miw={240}
          />
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => void loadData(true)}
            loading={refreshing}
          >
            {labels.refresh}
          </Button>
        </Group>
      </Paper>

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={18} />} title={labels.loadError}>
          {error}
        </Alert>
      ) : null}

      {hasSyncIssues ? (
        <Alert color="orange" icon={<IconAlertCircle size={18} />}>
          {labels.syncWarning}
        </Alert>
      ) : null}
      {data?.inventory.productSyncErrors ? (
        <Alert color="red" icon={<IconAlertCircle size={18} />}>
          {labels.inventoryWarning} ({data.inventory.productSyncErrors})
        </Alert>
      ) : null}

      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} height={150} radius="lg" />)}
        </SimpleGrid>
      ) : data ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <StatsCard title={labels.revenue} value={formatMoney(data.summary.revenue)} description={labels.salesTrendSubtitle} trend={trend(data.comparison.revenue)} icon={<IconWallet size={24} />} color="brand" />
            <StatsCard title={labels.cogs} value={formatMoney(data.summary.cost)} description={isId ? "Biaya historis pada baris penjualan" : "Historical cost captured on sale lines"} trend={trend(data.comparison.cost)} icon={<IconPackageExport size={24} />} color="accent" />
            <StatsCard title={labels.profit} value={formatMoney(data.summary.profit)} description={`${labels.margin}: ${(Number(data.summary.margin) * 100).toFixed(1)}%`} trend={trend(data.comparison.profit)} icon={<IconTrendingUp size={24} />} color={Number(data.summary.profit) >= 0 ? "success" : "danger"} />
            <StatsCard title={labels.sales} value={number.format(data.summary.sales)} description={`${labels.averageOrder}: ${formatMoney(data.summary.averageOrderValue)}`} trend={trend(data.comparison.sales)} icon={<IconReceipt size={24} />} color="violet" />
            <StatsCard title={labels.units} value={number.format(data.summary.units)} description={`${data.summary.averageUnitsPerSale} / ${isId ? "transaksi" : "sale"}`} trend={trend(data.comparison.units)} icon={<IconShoppingCart size={24} />} color="cyan" />
            <StatsCard title={labels.inventoryValue} value={formatMoney(data.inventory.inventoryValue)} description={`${number.format(data.inventory.activeProducts)} ${labels.activeProducts.toLowerCase()}`} icon={<IconBox size={24} />} color="teal" />
            <StatsCard title={labels.lowStock} value={number.format(data.inventory.lowStock + data.inventory.outOfStock)} description={`${data.inventory.outOfStock} ${labels.outOfStock.toLowerCase()}`} icon={<IconAlertCircle size={24} />} color={data.inventory.outOfStock > 0 ? "danger" : "accent"} />
            <StatsCard title={labels.restockCost} value={formatMoney(data.inventory.recommendedRestockCost)} description={`${number.format(data.inventory.recommendedRestockUnits)} ${labels.restockUnits.toLowerCase()}`} icon={<IconCoins size={24} />} color="grape" />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Panel title={labels.salesTrend} subtitle={labels.salesTrendSubtitle} badge={`${data.period.days} ${labels.days}`} icon={<IconChartLine size={20} />}>
              {data.summary.sales ? (
                <Box h={320} miw={0}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pos-revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#228BE6" stopOpacity={0.3} /><stop offset="95%" stopColor="#228BE6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="pos-profit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#12B886" stopOpacity={0.28} /><stop offset="95%" stopColor="#12B886" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} minTickGap={24} />
                      <YAxis axisLine={false} tickLine={false} fontSize={11} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                      <Tooltip formatter={(value, name) => [formatMoney(Number(value)), name === "revenueValue" ? labels.revenue : labels.profit]} />
                      <Area type="monotone" dataKey="revenueValue" name={labels.revenue} stroke="#228BE6" strokeWidth={2.5} fill="url(#pos-revenue)" />
                      <Area type="monotone" dataKey="profitValue" name={labels.profit} stroke="#12B886" strokeWidth={2.5} fill="url(#pos-profit)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyState title={labels.noSales} description={labels.noSalesDescription} size="sm" />}
            </Panel>

            <Panel title={labels.paymentMix} subtitle={labels.paymentMixSubtitle} badge={`${data.paymentMix.length}`} icon={<IconWallet size={20} />}>
              {paymentData.length ? (
                <Box h={320} miw={0}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3} label={({ name, value }) => `${name}: ${value}`}>
                        {paymentData.map((entry, index) => <Cell key={entry.paymentMethod} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [number.format(Number(value)), labels.sales]} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              ) : <EmptyState title={labels.noSales} description={labels.noSalesDescription} size="sm" />}
            </Panel>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 3 }}>
            <Box style={{ gridColumn: "span 2" }}>
              <Panel title={labels.itemPerformance} subtitle={labels.itemPerformanceSubtitle} badge={`${data.topItems.length}`} icon={<IconTrendingUp size={20} />}>
                {itemChartData.length ? (
                  <Box h={300} miw={0}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={itemChartData} layout="vertical" margin={{ left: 28, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                        <XAxis type="number" axisLine={false} tickLine={false} fontSize={11} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                        <YAxis type="category" dataKey="name" width={120} axisLine={false} tickLine={false} fontSize={11} />
                        <Tooltip formatter={(value) => [formatMoney(Number(value)), labels.profit]} />
                        <Bar dataKey="profit" fill="#12B886" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                ) : <EmptyState title={labels.noSales} description={labels.noSalesDescription} size="sm" />}
              </Panel>
            </Box>

            <Panel title={labels.transactionHealth} subtitle={labels.transactionHealthSubtitle} badge={`${data.transactionHealth.total}`} icon={<IconRefresh size={20} />}>
              <Stack gap="lg">
                <Center>
                  <Box ta="center">
                    <Text size="2.5rem" fw={800}>{successfulRate.toFixed(0)}%</Text>
                    <Text size="sm" c="dimmed">{labels.synced}</Text>
                  </Box>
                </Center>
                <Progress.Root size="xl">
                  <Progress.Section value={syncedLifecycleRate} color="teal"><Progress.Label>{data.transactionHealth.synced}</Progress.Label></Progress.Section>
                  <Progress.Section value={data.transactionHealth.total ? data.transactionHealth.pending / data.transactionHealth.total * 100 : 0} color="orange"><Progress.Label>{data.transactionHealth.pending}</Progress.Label></Progress.Section>
                  <Progress.Section value={data.transactionHealth.total ? data.transactionHealth.failed / data.transactionHealth.total * 100 : 0} color="red"><Progress.Label>{data.transactionHealth.failed}</Progress.Label></Progress.Section>
                  <Progress.Section value={data.transactionHealth.total ? data.transactionHealth.voiding / data.transactionHealth.total * 100 : 0} color="yellow"><Progress.Label>{data.transactionHealth.voiding}</Progress.Label></Progress.Section>
                  <Progress.Section value={data.transactionHealth.total ? data.transactionHealth.voided / data.transactionHealth.total * 100 : 0} color="gray"><Progress.Label>{data.transactionHealth.voided}</Progress.Label></Progress.Section>
                </Progress.Root>
                <SimpleGrid cols={{ base: 2, sm: 5 }}>
                  <Box ta="center"><Text fw={700} c="teal">{data.transactionHealth.synced}</Text><Text size="xs" c="dimmed">{labels.synced}</Text></Box>
                  <Box ta="center"><Text fw={700} c="orange">{data.transactionHealth.pending}</Text><Text size="xs" c="dimmed">{labels.pending}</Text></Box>
                  <Box ta="center"><Text fw={700} c="red">{data.transactionHealth.failed}</Text><Text size="xs" c="dimmed">{labels.failed}</Text></Box>
                  <Box ta="center"><Text fw={700} c="yellow">{data.transactionHealth.voiding}</Text><Text size="xs" c="dimmed">{labels.voiding}</Text></Box>
                  <Box ta="center"><Text fw={700} c="gray">{data.transactionHealth.voided}</Text><Text size="xs" c="dimmed">{labels.voided}</Text></Box>
                </SimpleGrid>
              </Stack>
            </Panel>
          </SimpleGrid>

          <Panel title={labels.itemPerformance} subtitle={labels.itemPerformanceSubtitle} badge={`${data.topItems.length}`} icon={<IconReceipt size={20} />}>
            {data.topItems.length ? (
              <Table.ScrollContainer minWidth={920}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead><Table.Tr><Table.Th>{labels.item}</Table.Th><Table.Th ta="right">{labels.units}</Table.Th><Table.Th ta="right">{labels.revenueTable}</Table.Th><Table.Th ta="right">{labels.cost}</Table.Th><Table.Th ta="right">{labels.profitTable}</Table.Th><Table.Th ta="right">{labels.marginTable}</Table.Th><Table.Th ta="right">{labels.stock}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{data.topItems.map((item) => (
                    <Table.Tr key={item.itemCode}>
                      <Table.Td><Text fw={600} size="sm">{item.itemName}</Text><Text size="xs" c="dimmed">{item.itemCode} · {item.orders} {isId ? "transaksi" : "orders"}</Text></Table.Td>
                      <Table.Td ta="right">{number.format(item.units)}</Table.Td>
                      <Table.Td ta="right">{formatMoney(item.revenue)}</Table.Td>
                      <Table.Td ta="right">{formatMoney(item.cost)}</Table.Td>
                      <Table.Td ta="right"><Text fw={600} c={Number(item.profit) >= 0 ? "teal" : "red"}>{formatMoney(item.profit)}</Text></Table.Td>
                      <Table.Td ta="right">{(Number(item.margin) * 100).toFixed(1)}%</Table.Td>
                      <Table.Td ta="right">{item.currentStock === null ? "-" : number.format(item.currentStock)}</Table.Td>
                    </Table.Tr>
                  ))}</Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : <EmptyState title={labels.noSales} description={labels.noSalesDescription} size="sm" />}
          </Panel>

          <Panel title={labels.restock} subtitle={labels.restockSubtitle} badge={`${data.inventory.recommendedRestockUnits} ${isId ? "unit" : "units"}`} icon={<IconPackageExport size={20} />}>
            {data.restock.length ? (
              <Table.ScrollContainer minWidth={980}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead><Table.Tr><Table.Th>{labels.item}</Table.Th><Table.Th ta="right">{labels.stock}</Table.Th><Table.Th ta="right">{labels.sold}</Table.Th><Table.Th ta="right">{labels.velocity}</Table.Th><Table.Th ta="right">{labels.cover}</Table.Th><Table.Th ta="right">{labels.reorderPoint}</Table.Th><Table.Th ta="right">{labels.recommendation}</Table.Th><Table.Th ta="right">{labels.estimatedCost}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{data.restock.map((item) => (
                    <Table.Tr key={item.itemCode}>
                      <Table.Td><Group gap="xs" wrap="nowrap"><Badge size="xs" color={item.status === "out_of_stock" ? "red" : item.status === "low_stock" ? "orange" : "teal"}>{item.status === "out_of_stock" ? labels.outOfStock : item.status === "low_stock" ? labels.lowStock : labels.healthy}</Badge><Box><Text fw={600} size="sm">{item.itemName}</Text><Text size="xs" c="dimmed">{item.itemCode}</Text></Box></Group></Table.Td>
                      <Table.Td ta="right">{number.format(item.currentStock)}</Table.Td>
                      <Table.Td ta="right">{number.format(item.soldUnits)}</Table.Td>
                      <Table.Td ta="right">{item.dailyVelocity}</Table.Td>
                      <Table.Td ta="right">{item.daysCover === null ? "∞" : `${item.daysCover} ${labels.days}`}</Table.Td>
                      <Table.Td ta="right">{number.format(item.reorderPoint)}</Table.Td>
                      <Table.Td ta="right"><Text fw={700} c={item.recommendedUnits > 0 ? "orange" : "teal"}>{item.recommendedUnits > 0 ? `+${number.format(item.recommendedUnits)}` : "-"}</Text></Table.Td>
                      <Table.Td ta="right">{formatMoney(item.estimatedCost)}</Table.Td>
                    </Table.Tr>
                  ))}</Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : <EmptyState title={labels.noSales} description={labels.noSalesDescription} size="sm" />}
          </Panel>
        </>
      ) : null}
    </Stack>
  );
}
