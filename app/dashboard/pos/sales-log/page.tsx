"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconAlertCircle,
  IconBan,
  IconCalendarStats,
  IconCash,
  IconEdit,
  IconPackage,
  IconReceipt,
  IconRefresh,
  IconShoppingCart,
} from "@tabler/icons-react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";

import { EmptyState } from "@/components/ui/EmptyState";
import { StatsCard } from "@/components/ui/StatsCard";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
  disconnectedAt: string | null;
}

interface SalesLogData {
  period: {
    start: string;
    end: string;
    grouping: "daily" | "weekly" | "monthly";
  };
  summary: {
    totalSales: string;
    transactions: number;
    units: number;
    averageSale: string;
  };
  groupedTotals: Array<{
    period: string;
    sales: number;
    units: number;
    total: string;
  }>;
  paymentBreakdown: Array<{
    paymentMethod: string;
    transactions: number;
    total: string;
  }>;
  transactions: Array<{
    id: string;
    createdAt: string;
    paymentMethod: string;
    status: string;
    voidReason: string | null;
    voidedAt: string | null;
    voidedBy: { id: string; name: string | null; email: string } | null;
    voidAccurateId: number | null;
    voidSyncError: string | null;
    buyerType: string;
    person: { name: string | null; email: string | null };
    cashier: { id: string; name: string | null; email: string };
    credential: { id: string; appKey: string };
    warehouseName: string;
    units: number;
    total: string;
    items: Array<{
      itemCode: string;
      itemName: string;
      quantity: number;
      unitPrice: string;
      subtotal: string;
    }>;
  }>;
  truncated: boolean;
  facets: {
    people: Array<{ value: string; label: string }>;
    items: Array<{ value: string; label: string }>;
    paymentMethods: string[];
  };
}

function dateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

export default function PosSalesLogPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const today = useMemo(startOfToday, []);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([today, today]);
  const [grouping, setGrouping] = useState<"daily" | "weekly" | "monthly">("daily");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [itemCode, setItemCode] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [data, setData] = useState<SalesLogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSale, setEditSale] = useState<SalesLogData["transactions"][number] | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [voidSale, setVoidSale] = useState<SalesLogData["transactions"][number] | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidingSale, setVoidingSale] = useState(false);
  const [reconcileSale, setReconcileSale] = useState<SalesLogData["transactions"][number] | null>(null);
  const [reversalId, setReversalId] = useState("");
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcilingSale, setReconcilingSale] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const labels = useMemo(() => isId ? {
    title: "Log Penjualan",
    subtitle: "Jurnal penjualan ringkas untuk melihat transaksi dan total penjualan dengan cepat.",
    today: "Hari ini",
    last7Days: "7 hari",
    last30Days: "30 hari",
    dateRange: "Rentang tanggal",
    grouping: "Jumlah per periode",
    daily: "Harian",
    weekly: "Mingguan",
    monthly: "Bulanan",
    credential: "Kredensial Accurate",
    allCredentials: "Semua kredensial",
    person: "Orang",
    allPeople: "Semua orang",
    item: "Barang",
    allItems: "Semua barang",
    paymentMethod: "Metode pembayaran",
    allPaymentMethods: "Semua metode",
    refresh: "Muat ulang",
    totalSales: "Total penjualan",
    transactions: "Transaksi",
    units: "Unit terjual",
    averageSale: "Rata-rata penjualan",
    selectedPeriod: "Dalam periode terpilih",
    periodTotals: "Jumlah penjualan per periode",
    paymentMix: "Komposisi metode pembayaran",
    paymentMixDescription: "Nilai penjualan berdasarkan tunjangan, tunai, dan QRIS dalam periode terpilih.",
    period: "Periode",
    sales: "Penjualan",
    salesLog: "Jurnal transaksi",
    time: "Waktu",
    people: "Pembeli / kasir",
    items: "Barang terjual",
    payment: "Pembayaran",
    editPayment: "Ubah metode pembayaran",
    editPaymentDescription: "Koreksi metode pembayaran untuk transaksi ini. Saldo tunjangan akan diperbarui otomatis. Transaksi yang sudah tersinkron tetap menyimpan catatan metode pembayaran awal di Accurate.",
    savePayment: "Simpan perubahan",
    cancel: "Batal",
    updatePaymentError: "Metode pembayaran tidak dapat diperbarui",
    voidTransaction: "Batalkan transaksi",
    voidDescription: "Transaksi dan barangnya tetap tersimpan. Sistem akan membuat penyesuaian stok masuk di Accurate, mengembalikan stok lokal, dan mengeluarkan transaksi ini dari total penjualan.",
    voidReason: "Alasan pembatalan",
    voidReasonPlaceholder: "Jelaskan alasan pembatalan transaksi",
    confirmVoid: "Konfirmasi pembatalan",
    voidError: "Transaksi tidak dapat dibatalkan",
    voidedBy: "Dibatalkan oleh",
    voidedAt: "Waktu pembatalan",
    actions: "Tindakan",
    reconcileVoid: "Selesaikan rekonsiliasi",
    reconcileDescription: "Periksa Accurate terlebih dahulu. Masukkan ID penyesuaian stok masuk yang benar. Tindakan ini tidak membuat penyesuaian Accurate baru; hanya menyelesaikan pembatalan dan pengembalian stok lokal satu kali.",
    accurateReversalId: "ID pembalikan Accurate",
    reconcileError: "Rekonsiliasi pembatalan tidak dapat diselesaikan",
    finalizeVoid: "Selesaikan pembatalan",
    status: "Status",
    total: "Total",
    guest: "Tamu",
    cashier: "Kasir",
    noSales: "Belum ada penjualan",
    noSalesDescription: "Tidak ada transaksi yang cocok dengan filter dan periode terpilih.",
    loadError: "Log penjualan tidak dapat dimuat",
    truncated: "Hanya 500 transaksi terbaru yang ditampilkan. Total ringkasan tetap mencakup seluruh hasil filter.",
  } : {
    title: "Sales Log",
    subtitle: "A simplified sales journal for quickly reviewing transactions and total sales.",
    today: "Today",
    last7Days: "7 days",
    last30Days: "30 days",
    dateRange: "Date range",
    grouping: "Sum by period",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    credential: "Accurate credential",
    allCredentials: "All credentials",
    person: "People",
    allPeople: "All people",
    item: "Item",
    allItems: "All items",
    paymentMethod: "Payment method",
    allPaymentMethods: "All methods",
    refresh: "Refresh",
    totalSales: "Total sales",
    transactions: "Transactions",
    units: "Units sold",
    averageSale: "Average sale",
    selectedPeriod: "In the selected period",
    periodTotals: "Sales sum per period",
    paymentMix: "Payment method mix",
    paymentMixDescription: "Sales value split between allowance, cash, and QRIS for the selected period.",
    period: "Period",
    sales: "Sales",
    salesLog: "Transaction journal",
    time: "Time",
    people: "Buyer / cashier",
    items: "Items sold",
    payment: "Payment",
    editPayment: "Change payment method",
    editPaymentDescription: "Correct the payment method for this transaction. Allowance balances will update automatically. Already-synced transactions keep the original payment note in Accurate.",
    savePayment: "Save changes",
    cancel: "Cancel",
    updatePaymentError: "Unable to update payment method",
    voidTransaction: "Void transaction",
    voidDescription: "The transaction and its items will remain recorded. The system will create an inbound stock adjustment in Accurate, restore local stock, and exclude this transaction from sales totals.",
    voidReason: "Reason for voiding",
    voidReasonPlaceholder: "Explain why this transaction must be voided",
    confirmVoid: "Confirm void",
    voidError: "Unable to void transaction",
    voidedBy: "Voided by",
    voidedAt: "Voided at",
    actions: "Actions",
    reconcileVoid: "Complete reconciliation",
    reconcileDescription: "Check Accurate first and enter the correct inbound inventory-adjustment ID. This action does not create another Accurate adjustment; it only completes the void and restores local stock once.",
    accurateReversalId: "Accurate reversal ID",
    reconcileError: "Unable to complete void reconciliation",
    finalizeVoid: "Finalize void",
    status: "Status",
    total: "Total",
    guest: "Guest",
    cashier: "Cashier",
    noSales: "No sales found",
    noSalesDescription: "No transactions match the selected filters and period.",
    loadError: "Unable to load the sales log",
    truncated: "Only the latest 500 transactions are shown. Summary totals still include all filtered results.",
  }, [isId]);

  const money = useMemo(() => new Intl.NumberFormat(isId ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }), [isId]);
  const number = useMemo(() => new Intl.NumberFormat(isId ? "id-ID" : "en-US"), [isId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ period: grouping });
    if (dateRange[0]) params.set("start", dateParam(dateRange[0]));
    if (dateRange[1]) params.set("end", dateParam(dateRange[1]));
    if (credentialId) params.set("credentialId", credentialId);
    if (person) params.set("person", person);
    if (itemCode) params.set("itemCode", itemCode);
    if (paymentMethod) params.set("paymentMethod", paymentMethod);
    return params.toString();
  }, [credentialId, dateRange, grouping, itemCode, paymentMethod, person]);

  const loadData = useCallback(async (quiet = false) => {
    if (!dateRange[0] || !dateRange[1]) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/pos/sales/log?${queryString}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || labels.loadError);
      if (!controller.signal.aborted) setData(payload);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : labels.loadError);
      }
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

  const setPreset = (days: number) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    setDateRange([start, today]);
  };

  const openPaymentEditor = (sale: SalesLogData["transactions"][number]) => {
    setEditSale(sale);
    setEditPaymentMethod(sale.paymentMethod);
    setEditError(null);
  };

  const closePaymentEditor = () => {
    if (savingPaymentMethod) return;
    setEditSale(null);
    setEditPaymentMethod(null);
    setEditError(null);
  };

  const savePaymentMethod = async () => {
    if (!editSale || !editPaymentMethod || editPaymentMethod === editSale.paymentMethod) return;
    setSavingPaymentMethod(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/pos/sales/${editSale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: editPaymentMethod }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || labels.updatePaymentError);
      setEditSale(null);
      setEditPaymentMethod(null);
      await loadData(true);
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : labels.updatePaymentError);
    } finally {
      setSavingPaymentMethod(false);
    }
  };

  const openVoidModal = (sale: SalesLogData["transactions"][number]) => {
    setVoidSale(sale);
    setVoidReason("");
    setVoidError(null);
  };

  const closeVoidModal = () => {
    if (voidingSale) return;
    setVoidSale(null);
    setVoidReason("");
    setVoidError(null);
  };

  const confirmVoid = async () => {
    if (!voidSale || voidReason.trim().length < 3) return;
    setVoidingSale(true);
    setVoidError(null);
    try {
      const response = await fetch(`/api/pos/sales/${voidSale.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || labels.voidError);
      setVoidSale(null);
      setVoidReason("");
      await loadData(true);
    } catch (submitError) {
      setVoidError(submitError instanceof Error ? submitError.message : labels.voidError);
      await loadData(true);
    } finally {
      setVoidingSale(false);
    }
  };

  const openReconcileModal = (sale: SalesLogData["transactions"][number]) => {
    setReconcileSale(sale);
    setReversalId(sale.voidAccurateId ? String(sale.voidAccurateId) : "");
    setReconcileError(null);
  };

  const closeReconcileModal = () => {
    if (reconcilingSale) return;
    setReconcileSale(null);
    setReversalId("");
    setReconcileError(null);
  };

  const finalizeReconciledVoid = async () => {
    const accurateReversalId = Number(reversalId);
    if (!reconcileSale || !Number.isInteger(accurateReversalId) || accurateReversalId <= 0) return;
    setReconcilingSale(true);
    setReconcileError(null);
    try {
      const response = await fetch(`/api/pos/sales/${reconcileSale.id}/void`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accurateReversalId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || labels.reconcileError);
      setReconcileSale(null);
      setReversalId("");
      await loadData(true);
    } catch (submitError) {
      setReconcileError(submitError instanceof Error ? submitError.message : labels.reconcileError);
    } finally {
      setReconcilingSale(false);
    }
  };

  const formatPayment = (value: string) => value === "qris"
    ? "QRIS"
    : value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  const formatPeriod = (value: string) => {
    if (/^\d{4}-\d{2}$/.test(value)) {
      return new Date(`${value}-01T00:00:00`).toLocaleDateString(isId ? "id-ID" : "en-US", {
        month: "long",
        year: "numeric",
      });
    }
    return new Date(`${value}T00:00:00`).toLocaleDateString(isId ? "id-ID" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const credentialOptions = [
    { value: "all", label: labels.allCredentials },
    ...credentials.map((credential, index) => ({
      value: credential.id,
      label: `${credential.appKey || `Accurate ${index + 1}`}${credential.disconnectedAt ? " · disconnected" : ""}`,
    })),
  ];
  const peopleOptions = [
    { value: "all", label: labels.allPeople },
    ...(data?.facets.people ?? []),
  ];
  const itemOptions = [
    { value: "all", label: labels.allItems },
    ...(data?.facets.items ?? []),
  ];
  const paymentOptions = [
    { value: "all", label: labels.allPaymentMethods },
    ...(data?.facets.paymentMethods ?? []).map((value) => ({ value, label: formatPayment(value) })),
  ];
  const editablePaymentOptions = ["allowance", "cash", "qris"]
    .filter((value) => value !== "allowance" || editSale?.buyerType === "staff")
    .map((value) => ({ value, label: formatPayment(value) }));
  const paymentChartData = (data?.paymentBreakdown ?? [])
    .map((row) => ({
      name: formatPayment(row.paymentMethod),
      paymentMethod: row.paymentMethod,
      value: Number(row.total),
      transactions: row.transactions,
    }))
    .filter((row) => row.value > 0);
  const paymentColors: Record<string, string> = {
    allowance: "var(--mantine-color-violet-6)",
    cash: "var(--mantine-color-green-6)",
    qris: "var(--mantine-color-blue-6)",
  };

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
          leftSection={<IconRefresh size={16} />}
          onClick={() => void loadData(true)}
          loading={refreshing}
        >
          {labels.refresh}
        </Button>
      </Group>

      <Paper p="md" radius="lg" withBorder>
        <Stack gap="md">
          <Group gap="xs">
            <Button size="xs" variant="light" onClick={() => setPreset(1)}>{labels.today}</Button>
            <Button size="xs" variant="light" onClick={() => setPreset(7)}>{labels.last7Days}</Button>
            <Button size="xs" variant="light" onClick={() => setPreset(30)}>{labels.last30Days}</Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            <DatePickerInput
              type="range"
              label={labels.dateRange}
              value={dateRange}
              onChange={setDateRange}
              clearable={false}
              maxDate={today}
              leftSection={<IconCalendarStats size={16} />}
            />
            <Select
              label={labels.credential}
              data={credentialOptions}
              value={credentialId ?? "all"}
              onChange={(value) => setCredentialId(value === "all" ? null : value)}
              searchable
            />
            <Select
              label={labels.person}
              data={peopleOptions}
              value={person ?? "all"}
              onChange={(value) => setPerson(value === "all" ? null : value)}
              searchable
            />
            <Select
              label={labels.item}
              data={itemOptions}
              value={itemCode ?? "all"}
              onChange={(value) => setItemCode(value === "all" ? null : value)}
              searchable
            />
            <Select
              label={labels.paymentMethod}
              data={paymentOptions}
              value={paymentMethod ?? "all"}
              onChange={(value) => setPaymentMethod(value === "all" ? null : value)}
              searchable
            />
            <Box>
              <Text size="sm" fw={500} mb={3}>{labels.grouping}</Text>
              <SegmentedControl
                fullWidth
                value={grouping}
                onChange={(value) => setGrouping(value as "daily" | "weekly" | "monthly")}
                data={[
                  { value: "daily", label: labels.daily },
                  { value: "weekly", label: labels.weekly },
                  { value: "monthly", label: labels.monthly },
                ]}
              />
            </Box>
          </SimpleGrid>
        </Stack>
      </Paper>

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={18} />} title={labels.loadError}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={130} radius="lg" />)}
        </SimpleGrid>
      ) : data ? (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <StatsCard title={labels.totalSales} value={money.format(Number(data.summary.totalSales))} description={labels.selectedPeriod} icon={<IconCash size={24} />} color="success" />
            <StatsCard title={labels.transactions} value={number.format(data.summary.transactions)} description={labels.selectedPeriod} icon={<IconReceipt size={24} />} color="brand" />
            <StatsCard title={labels.units} value={number.format(data.summary.units)} description={labels.selectedPeriod} icon={<IconPackage size={24} />} color="cyan" />
            <StatsCard title={labels.averageSale} value={money.format(Number(data.summary.averageSale))} description={labels.selectedPeriod} icon={<IconShoppingCart size={24} />} color="violet" />
          </SimpleGrid>

          {data.truncated ? (
            <Alert color="orange" icon={<IconAlertCircle size={18} />}>{labels.truncated}</Alert>
          ) : null}

          <Paper p="md" radius="lg" withBorder>
            <Title order={3}>{labels.paymentMix}</Title>
            <Text size="sm" c="dimmed" mb="md">{labels.paymentMixDescription}</Text>
            {paymentChartData.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">{labels.noSalesDescription}</Text>
            ) : (
              <Box h={340}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={115}
                      paddingAngle={3}
                    >
                      {paymentChartData.map((entry) => (
                        <Cell key={entry.paymentMethod} fill={paymentColors[entry.paymentMethod] || "var(--mantine-color-gray-6)"} />
                      ))}
                    </Pie>
                    <ChartTooltip formatter={(value) => money.format(Number(value))} />
                    <Legend formatter={(value) => String(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>

          <Paper p="md" radius="lg" withBorder>
            <Title order={3} mb="md">{labels.periodTotals}</Title>
            <ScrollArea>
              <Table striped highlightOnHover miw={620}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{labels.period}</Table.Th>
                    <Table.Th ta="right">{labels.transactions}</Table.Th>
                    <Table.Th ta="right">{labels.units}</Table.Th>
                    <Table.Th ta="right">{labels.totalSales}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.groupedTotals.map((row) => (
                    <Table.Tr key={row.period}>
                      <Table.Td fw={600}>{formatPeriod(row.period)}</Table.Td>
                      <Table.Td ta="right">{number.format(row.sales)}</Table.Td>
                      <Table.Td ta="right">{number.format(row.units)}</Table.Td>
                      <Table.Td ta="right" fw={700}>{money.format(Number(row.total))}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>

          <Paper p="md" radius="lg" withBorder>
            <Title order={3} mb="md">{labels.salesLog}</Title>
            {data.transactions.length === 0 ? (
              <EmptyState title={labels.noSales} description={labels.noSalesDescription} variant="empty-cart" />
            ) : (
              <ScrollArea>
                <Table verticalSpacing="md" highlightOnHover miw={1080}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{labels.time}</Table.Th>
                      <Table.Th>{labels.people}</Table.Th>
                      <Table.Th>{labels.items}</Table.Th>
                      <Table.Th>{labels.payment}</Table.Th>
                      <Table.Th>{labels.status}</Table.Th>
                      <Table.Th ta="right">{labels.total}</Table.Th>
                      <Table.Th ta="right">{labels.actions}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.transactions.map((sale) => (
                      <Table.Tr key={sale.id}>
                        <Table.Td>
                          <Text fw={600}>{new Date(sale.createdAt).toLocaleDateString(isId ? "id-ID" : "en-US", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                          <Text size="xs" c="dimmed">{new Date(sale.createdAt).toLocaleTimeString(isId ? "id-ID" : "en-US", { hour: "2-digit", minute: "2-digit" })}</Text>
                          <Text size="xs" c="dimmed">{sale.credential.appKey} · {sale.warehouseName}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600}>{sale.person.name || sale.person.email || labels.guest}</Text>
                          {sale.person.email ? <Text size="xs" c="dimmed">{sale.person.email}</Text> : null}
                          <Text size="xs" c="dimmed">{labels.cashier}: {sale.cashier.name || sale.cashier.email}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            {sale.items.map((item) => (
                              <Box key={`${sale.id}-${item.itemCode}`}>
                                <Text size="sm" fw={500}>{item.itemName}</Text>
                                <Text size="xs" c="dimmed">{item.quantity} × {money.format(Number(item.unitPrice))} · {item.itemCode}</Text>
                              </Box>
                            ))}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Badge variant="light">{formatPayment(sale.paymentMethod)}</Badge>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              aria-label={labels.editPayment}
                              title={labels.editPayment}
                              onClick={() => openPaymentEditor(sale)}
                              disabled={sale.status === "voiding" || sale.status === "voided"}
                            >
                              <IconEdit size={15} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={sale.status === "synced" ? "green" : sale.status === "sync_error" || sale.status === "voided" ? "red" : "yellow"}
                            variant="light"
                          >
                            {formatPayment(sale.status)}
                          </Badge>
                          {sale.voidReason ? <Text size="xs" mt={4}>{sale.voidReason}</Text> : null}
                          {sale.voidedAt ? (
                            <Text size="xs" c="dimmed">
                              {labels.voidedAt}: {new Date(sale.voidedAt).toLocaleString(isId ? "id-ID" : "en-US")}
                            </Text>
                          ) : null}
                          {sale.voidedBy ? <Text size="xs" c="dimmed">{labels.voidedBy}: {sale.voidedBy.name || sale.voidedBy.email}</Text> : null}
                          {sale.voidSyncError ? <Text size="xs" c="red">{sale.voidSyncError}</Text> : null}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700}>{money.format(Number(sale.total))}</Text>
                          <Text size="xs" c="dimmed">{number.format(sale.units)} {labels.units.toLowerCase()}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <ActionIcon
                            color={sale.status === "voiding" ? "orange" : "red"}
                            variant="light"
                            aria-label={sale.status === "voiding" ? labels.reconcileVoid : labels.voidTransaction}
                            title={sale.status === "voiding" ? labels.reconcileVoid : labels.voidTransaction}
                            onClick={() => sale.status === "voiding" ? openReconcileModal(sale) : openVoidModal(sale)}
                            disabled={sale.status !== "synced" && sale.status !== "voiding"}
                          >
                            <IconBan size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Paper>
        </>
      ) : null}

      <Modal
        opened={!!reconcileSale}
        onClose={closeReconcileModal}
        title={labels.reconcileVoid}
        centered
      >
        <Stack>
          <Alert color="orange" icon={<IconAlertCircle size={18} />}>{labels.reconcileDescription}</Alert>
          {reconcileSale?.voidSyncError ? <Text size="sm" c="red">{reconcileSale.voidSyncError}</Text> : null}
          <TextInput
            label={labels.accurateReversalId}
            value={reversalId}
            onChange={(event) => setReversalId(event.currentTarget.value.replace(/\D/g, ""))}
            inputMode="numeric"
            required
          />
          {reconcileError ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{reconcileError}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeReconcileModal} disabled={reconcilingSale}>{labels.cancel}</Button>
            <Button
              color="orange"
              onClick={() => void finalizeReconciledVoid()}
              loading={reconcilingSale}
              disabled={!/^\d+$/.test(reversalId) || Number(reversalId) <= 0}
            >
              {labels.finalizeVoid}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!voidSale}
        onClose={closeVoidModal}
        title={labels.voidTransaction}
        centered
      >
        <Stack>
          <Alert color="orange" icon={<IconAlertCircle size={18} />}>{labels.voidDescription}</Alert>
          {voidSale ? (
            <Text size="sm">
              {new Date(voidSale.createdAt).toLocaleString(isId ? "id-ID" : "en-US")} · {money.format(Number(voidSale.total))}
            </Text>
          ) : null}
          <Textarea
            label={labels.voidReason}
            placeholder={labels.voidReasonPlaceholder}
            value={voidReason}
            onChange={(event) => setVoidReason(event.currentTarget.value)}
            minRows={3}
            maxLength={500}
            required
          />
          {voidError ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{voidError}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeVoidModal} disabled={voidingSale}>{labels.cancel}</Button>
            <Button
              color="red"
              leftSection={<IconBan size={16} />}
              onClick={() => void confirmVoid()}
              loading={voidingSale}
              disabled={voidReason.trim().length < 3}
            >
              {labels.confirmVoid}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!editSale}
        onClose={closePaymentEditor}
        title={labels.editPayment}
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">{labels.editPaymentDescription}</Text>
          {editSale ? (
            <Text size="sm">
              {new Date(editSale.createdAt).toLocaleString(isId ? "id-ID" : "en-US")} · {money.format(Number(editSale.total))}
            </Text>
          ) : null}
          <Select
            label={labels.paymentMethod}
            data={editablePaymentOptions}
            value={editPaymentMethod}
            onChange={setEditPaymentMethod}
            allowDeselect={false}
          />
          {editError ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{editError}</Alert> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={closePaymentEditor} disabled={savingPaymentMethod}>{labels.cancel}</Button>
            <Button
              onClick={() => void savePaymentMethod()}
              loading={savingPaymentMethod}
              disabled={!editPaymentMethod || editPaymentMethod === editSale?.paymentMethod}
            >
              {labels.savePayment}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
