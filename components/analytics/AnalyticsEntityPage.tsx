"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { AnalyticsDateRangeFields } from "@/components/analytics/AnalyticsDateRangeFields";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLanguage, type AppLanguage } from "@/lib/language";
import { sendToSignIn } from "@/lib/sign-in-redirect";

type EntityType = "item" | "user";

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const entityValueLabels: Record<AppLanguage, Record<string, string>> = {
  id: {
    active: "Aktif", partial: "Dikembalikan sebagian", returned: "Dikembalikan",
    completed: "Selesai", pending: "Menunggu", failed: "Gagal",
    booking: "Reservasi", borrow: "Peminjaman",
  },
  en: {
    active: "Active", partial: "Partially returned", returned: "Returned",
    completed: "Completed", pending: "Pending", failed: "Failed",
    booking: "Booking", borrow: "Borrowing",
  },
};

function formatValue(value: unknown, language: AppLanguage) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") {
    return value ? (language === "id" ? "Ya" : "Yes") : (language === "id" ? "Tidak" : "No");
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString(language === "id" ? "id-ID" : "en-US");
  }
  if (typeof value === "string") {
    return entityValueLabels[language][value] ?? value;
  }
  return String(value);
}

const historyColumnLabels: Record<AppLanguage, Record<string, string>> = {
  id: {
    Date: "Tanggal", Status: "Status", Email: "Email", Name: "Nama",
    Quantity: "Jumlah", itemCode: "Kode item", itemName: "Nama item",
  },
  en: {
    Date: "Date", Status: "Status", Email: "Email", Name: "Name",
    Quantity: "Quantity", itemCode: "Item code", itemName: "Item name",
  },
};

function cell(
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
        fw={500}
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
        fw={500}
      >
        {formatValue(value, language)}
      </Text>
    );
  }

  return formatValue(value, language);
}

function HistoryTable({
  rows,
  detailQueryString = "",
}: {
  rows: Record<string, unknown>[];
  detailQueryString?: string;
}) {
  const { language } = useLanguage();
  const columns = rows.length ? Object.keys(rows[0]) : [];

  if (!rows.length) {
    return (
      <EmptyState
        title={language === "id" ? "Belum ada riwayat" : "No history yet"}
        description={language === "id" ? "Tidak ada data untuk filter tanggal ini." : "No data is available for this date filter."}
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            {columns.map((column) => (
              <Table.Th key={column}>
                {historyColumnLabels[language][column] ?? column}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, index) => (
            <Table.Tr key={index}>
              {columns.map((column) => (
                <Table.Td key={column}>
                  {cell(column, row, language, detailQueryString)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function AnalyticsEntityPage({
  type,
  value,
}: {
  type: EntityType;
  value: string;
}) {
  const { language } = useLanguage();
  const isId = language === "id";
  const searchParams = useSearchParams();
  const now = new Date();
  const startDateParam = parseDateParam(searchParams.get("startDate"));
  const endDateParam = parseDateParam(searchParams.get("endDate"));
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startDateParam || new Date(now.getFullYear(), now.getMonth(), 1),
    endDateParam || new Date(now.getFullYear(), now.getMonth() + 1, 0),
  ]);
  const [loading, setLoading] = useState(true);
  const [peminjaman, setPeminjaman] = useState<any>(null);
  const [pengambilan, setPengambilan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange[0]) params.set("startDate", dateValue(dateRange[0]));
    if (dateRange[1]) params.set("endDate", dateValue(dateRange[1]));
    params.set(type === "item" ? "itemCode" : "email", value);
    if (type === "item") params.set("exactItemCode", "true");
    return params.toString();
  }, [dateRange, type, value]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [peminjamanRes, pengambilanRes] = await Promise.all([
        fetch(`/api/analytics/peminjaman?${queryString}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/analytics/pengambilan?${queryString}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      if (peminjamanRes.status === 401 || pengambilanRes.status === 401) {
        sendToSignIn();
        return;
      }

      const [peminjamanPayload, pengambilanPayload] = await Promise.all([
        peminjamanRes.json(),
        pengambilanRes.json(),
      ]);

      if (!peminjamanRes.ok)
        throw new Error(
          peminjamanPayload?.error || (isId ? "Gagal memuat riwayat peminjaman" : "Unable to load borrowing history"),
        );
      if (!pengambilanRes.ok)
        throw new Error(
          pengambilanPayload?.error || (isId ? "Gagal memuat riwayat pengambilan" : "Unable to load checkout history"),
        );

      setPeminjaman(peminjamanPayload);
      setPengambilan(pengambilanPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : (isId ? "Gagal memuat riwayat analitik" : "Unable to load analytics history"),
      );
    } finally {
      setLoading(false);
    }
  }, [isId, queryString]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const peminjamanRows = peminjaman?.details?.data || [];
  const pengambilanRows = pengambilan?.details?.data || [];
  const detailQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange[0]) params.set("startDate", dateValue(dateRange[0]));
    if (dateRange[1]) params.set("endDate", dateValue(dateRange[1]));
    return params.toString();
  }, [dateRange]);
  const detailQuery = detailQueryString ? `?${detailQueryString}` : "";
  const itemName =
    type === "item"
      ? peminjamanRows[0]?.itemName || pengambilanRows[0]?.itemName || value
      : value;

  const peminjamanDisplayRows = peminjamanRows.map(
    (row: Record<string, unknown>) =>
      type === "item"
        ? {
            Date: row.borrowedAt,
            Status: row.status,
            Email: row.borrowerEmail,
            Name: row.borrowerName,
            Quantity: row.quantity,
          }
        : {
            Date: row.borrowedAt,
            Status: row.status,
            itemCode: row.itemCode,
            itemName: row.itemName,
            Quantity: row.quantity,
          },
  );

  const pengambilanDisplayRows = pengambilanRows.map(
    (row: Record<string, unknown>) =>
      type === "item"
        ? {
            Date: row.createdAt,
            Status: row.status,
            Email: row.staffEmail,
            Name: row.staffName,
            Quantity: row.quantity,
          }
        : {
            Date: row.createdAt,
            Status: row.status,
            itemCode: row.itemCode,
            itemName: row.itemName,
            Quantity: row.quantity,
          },
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Button
            component={Link}
            href={`/dashboard/analytics${detailQuery}`}
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            mb="sm"
          >
            {isId ? "Kembali ke Ringkasan" : "Back to Overview"}
          </Button>
          <Group gap="xs">
            <Title order={2}>
              {type === "item"
                ? `${isId ? "Analitik Item" : "Item Analytics"}: ${itemName}`
                : isId ? "Analitik Pengguna" : "User Analytics"}
            </Title>
            <Badge variant="light">{isId ? "Riwayat" : "History"}</Badge>
          </Group>
          <Text c="dimmed" mt={4}>
            {type === "item"
              ? isId ? "Riwayat peminjaman dan pengambilan untuk item." : "Borrowing and checkout history for this item."
              : isId ? "Riwayat peminjaman dan pengambilan untuk email pengguna." : "Borrowing and checkout history for this user email."}
          </Text>
          {type === "item" ? (
            <Text fw={600} mt="xs">
              {isId ? "Kode item" : "Item code"}: {value}
            </Text>
          ) : (
            <Text fw={600} mt="xs">
              {value}
            </Text>
          )}
        </Box>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          onClick={loadData}
          loading={loading}
        >
          {isId ? "Perbarui" : "Refresh"}
        </Button>
      </Group>

      <Card withBorder radius="lg" p="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <AnalyticsDateRangeFields
            value={dateRange}
            onChange={setDateRange}
            startLabel={isId ? "Tanggal mulai" : "Start date"}
            endLabel={isId ? "Tanggal akhir" : "End date"}
            locale={language}
          />
        </SimpleGrid>
      </Card>

      {error && (
        <Paper p="md" radius="lg" withBorder>
          <Text c="red">{error}</Text>
        </Paper>
      )}

      {loading ? (
        <Stack>
          <Skeleton height={240} radius="lg" />
          <Skeleton height={240} radius="lg" />
        </Stack>
      ) : (
        <Paper p="md" radius="lg" withBorder>
          <Tabs defaultValue="peminjaman">
            <Tabs.List mb="md">
              <Tabs.Tab value="peminjaman">
                {isId ? "Peminjaman" : "Borrowing"} (
                {peminjaman?.details?.total || peminjamanRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="pengambilan">
                {isId ? "Pengambilan" : "Checkout"} (
                {pengambilan?.details?.total || pengambilanRows.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="peminjaman">
              <HistoryTable
                rows={peminjamanDisplayRows}
                detailQueryString={detailQueryString}
              />
            </Tabs.Panel>

            <Tabs.Panel value="pengambilan">
              <HistoryTable
                rows={pengambilanDisplayRows}
                detailQueryString={detailQueryString}
              />
            </Tabs.Panel>
          </Tabs>
        </Paper>
      )}
    </Stack>
  );
}
