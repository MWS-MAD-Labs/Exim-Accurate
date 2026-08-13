"use client";

import {
  Alert,
  Button,
  Card,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePicker, DatePickerInput } from "@mantine/dates";
import { IconCalendarOff, IconEdit, IconSearch, IconTrash } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";

interface Credential { id: string; appKey: string }
interface Period { startsAt: string; endsAt: string; isCustom: boolean }
interface Allowance {
  staffEmail: string;
  staffName: string | null;
  baseWorkingDays: number;
  daysOffCount: number;
  effectiveWorkingDays: number;
  dailyRate: number;
  standardAllowance: number;
  manualAdjustment: number;
  totalAllowance: number;
  allowanceSpent: number;
  remainingAllowance: number;
  period: Period;
}
interface DayOff { id: string; date: string; reason: string | null }
interface Sale {
  id: string;
  createdAt: string;
  status: string;
  allowanceUsed: string;
  items: Array<{ itemCode: string; itemName: string; quantity: number; unitPrice: string }>;
}
interface Adjustment {
  id: string;
  periodStartsAt: string;
  periodEndsAt: string;
  amount: string;
  note: string | null;
  updatedAt: string;
  createdBy: { email: string };
}
interface AllowanceDetail extends Allowance { daysOff: DayOff[]; sales: Sale[]; adjustments: Adjustment[] }

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateOnly(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

export default function StaffAllowancePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Allowance[]>([]);
  const [search, setSearch] = useState("");
  const [periodRange, setPeriodRange] = useState<[Date | null, Date | null]>([null, null]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<AllowanceDetail | null>(null);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");
  const [adjustment, setAdjustment] = useState<number | "">(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/credentials").then((response) => response.json()).then((data: Credential[]) => {
      setCredentials(data);
      if (data[0]) setCredentialId(data[0].id);
    });
  }, []);

  const loadStaff = async (id = credentialId, query = search) => {
    if (!id) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ credentialId: id });
      if (query.trim()) params.set("search", query.trim());
      if (periodRange[0] && periodRange[1]) {
        params.set("periodStart", dateOnly(periodRange[0]));
        params.set("periodEnd", dateOnly(periodRange[1]));
      }
      const response = await fetch(`/api/pos/allowance/users?${params}`);
      const data = await response.json();
      setStaff(response.ok ? data : []);
      if (!response.ok) setMessage(data.error || t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (credentialId) void loadStaff(credentialId, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialId]);

  const openDetail = async (entry: Allowance) => {
    if (!credentialId) return;
    setMessage("");
    const params = new URLSearchParams({ credentialId });
    if (periodRange[0] && periodRange[1]) {
      params.set("periodStart", dateOnly(periodRange[0]));
      params.set("periodEnd", dateOnly(periodRange[1]));
    }
    const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(entry.staffEmail)}?${params}`);
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || t.common.error);
    setDetail(data);
    setSelectedDates([]);
    setReason("");
    setAdjustment(data.manualAdjustment);
    const current = data.adjustments.find((item: Adjustment) => dateOnly(item.periodStartsAt) === dateOnly(data.period.startsAt) && dateOnly(item.periodEndsAt) === dateOnly(data.period.endsAt));
    setNote(current?.note || "");
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const email = detail.staffEmail;
    const current = staff.find((entry) => entry.staffEmail === email) || detail;
    await loadStaff();
    await openDetail(current);
  };

  const addDaysOff = async () => {
    if (!credentialId || !detail || !selectedDates.length) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(detail.staffEmail)}/days-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, dates: selectedDates.map(dateOnly), reason: reason.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) setMessage(data.error || t.common.error);
      else await refreshDetail();
    } finally {
      setSaving(false);
    }
  };

  const removeDayOff = async (date: string) => {
    if (!credentialId || !detail || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(detail.staffEmail)}/days-off`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, date: dateOnly(date) }),
      });
      const data = await response.json();
      if (!response.ok) setMessage(data.error || t.common.error);
      else await refreshDetail();
    } finally {
      setSaving(false);
    }
  };

  const saveAdjustment = async () => {
    if (!credentialId || !detail || adjustment === "") return;
    setSaving(true);
    try {
      const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(detail.staffEmail)}/adjustment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          periodStartsAt: dateOnly(detail.period.startsAt),
          periodEndsAt: dateOnly(detail.period.endsAt),
          amount: adjustment,
          note: note.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) setMessage(data.error || t.common.error);
      else await refreshDetail();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Title>{t.dashboard.pos.staffAllowanceTitle}</Title>
      <Paper withBorder p="md">
        <Group align="end">
          <Select
            label={t.dashboard.pos.credential}
            data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))}
            value={credentialId}
            onChange={setCredentialId}
            style={{ flex: 1 }}
          />
          <DatePickerInput
            type="range"
            label={t.dashboard.pos.allowancePeriod}
            value={periodRange}
            onChange={setPeriodRange}
            clearable
            style={{ flex: 1 }}
          />
          <TextInput
            label={t.dashboard.pos.searchStaff}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => event.key === "Enter" && void loadStaff()}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 2 }}
          />
          <Button onClick={() => void loadStaff()} loading={loading}>{t.dashboard.pos.searchButton}</Button>
        </Group>
      </Paper>
      {message && <Alert color="red">{message}</Alert>}
      <Paper withBorder>
        <ScrollArea>
          <Table striped highlightOnHover miw={1100}>
            <Table.Thead><Table.Tr>
              <Table.Th>{t.dashboard.pos.staffEmail}</Table.Th><Table.Th>{t.dashboard.pos.baseDays}</Table.Th>
              <Table.Th>{t.dashboard.pos.daysOff}</Table.Th><Table.Th>{t.dashboard.pos.standardAllowance}</Table.Th>
              <Table.Th>{t.dashboard.pos.manualAdjustment}</Table.Th><Table.Th>{t.dashboard.pos.totalAllowance}</Table.Th>
              <Table.Th>{t.dashboard.pos.allowanceUsed}</Table.Th><Table.Th>{t.dashboard.pos.allowanceRemaining}</Table.Th><Table.Th />
            </Table.Tr></Table.Thead>
            <Table.Tbody>{staff.map((entry) => <Table.Tr key={entry.staffEmail}>
              <Table.Td><Text fw={500}>{entry.staffName || entry.staffEmail}</Text>{entry.staffName && <Text size="xs" c="dimmed">{entry.staffEmail}</Text>}</Table.Td>
              <Table.Td>{entry.baseWorkingDays}</Table.Td><Table.Td>{entry.daysOffCount}</Table.Td>
              <Table.Td>{formatMoney(entry.standardAllowance)}</Table.Td><Table.Td>{formatMoney(entry.manualAdjustment)}</Table.Td>
              <Table.Td>{formatMoney(entry.totalAllowance)}</Table.Td><Table.Td>{formatMoney(entry.allowanceSpent)}</Table.Td>
              <Table.Td><Text fw={700} c="green">{formatMoney(entry.remainingAllowance)}</Text></Table.Td>
              <Table.Td><Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => void openDetail(entry)}>{t.dashboard.pos.details}</Button></Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </ScrollArea>
        {!loading && !staff.length && <Text c="dimmed" ta="center" p="xl">{t.dashboard.pos.noStaff}</Text>}
      </Paper>

      <Modal opened={!!detail} onClose={() => setDetail(null)} title={detail?.staffName || detail?.staffEmail} size="xl">
        {detail && <Stack>
          <Text c="dimmed">{detail.staffEmail} · {formatDate(detail.period.startsAt)} – {formatDate(detail.period.endsAt)}</Text>
          <Card withBorder><Text c="dimmed">{t.dashboard.pos.allowanceRemaining}</Text><Text size="2rem" fw={800} c="green">{formatMoney(detail.remainingAllowance)}</Text><Text size="sm">{detail.effectiveWorkingDays} × {formatMoney(detail.dailyRate)} + {formatMoney(detail.manualAdjustment)} − {formatMoney(detail.allowanceSpent)}</Text></Card>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.baseDays}</Text><Text size="xl" fw={700}>{detail.baseWorkingDays}</Text></Card>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.daysOff}</Text><Text size="xl" fw={700}>{detail.daysOffCount}</Text></Card>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.totalAllowance}</Text><Text size="xl" fw={700}>{formatMoney(detail.totalAllowance)}</Text></Card>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.allowanceUsed}</Text><Text size="xl" fw={700}>{formatMoney(detail.allowanceSpent)}</Text></Card>
          </SimpleGrid>

          <Title order={3}>{t.dashboard.pos.daysOffManager}</Title>
          {isAdmin && <Grid>
            <Grid.Col span={{ base: 12, md: 7 }}><DatePicker type="multiple" value={selectedDates} onChange={setSelectedDates} minDate={new Date(detail.period.startsAt)} maxDate={new Date(detail.period.endsAt)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 5 }}><Stack><TextInput label={t.dashboard.pos.reason} value={reason} onChange={(event) => setReason(event.currentTarget.value)} /><Button leftSection={<IconCalendarOff size={16} />} onClick={() => void addDaysOff()} disabled={!selectedDates.length} loading={saving}>{t.dashboard.pos.addDaysOff}</Button></Stack></Grid.Col>
          </Grid>}
          <Table withTableBorder><Table.Thead><Table.Tr><Table.Th>{t.dashboard.pos.date}</Table.Th><Table.Th>{t.dashboard.pos.reason}</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{detail.daysOff.map((entry) => <Table.Tr key={entry.id}><Table.Td>{formatDate(entry.date)}</Table.Td><Table.Td>{entry.reason || "–"}</Table.Td><Table.Td>{isAdmin && <Button color="red" size="xs" variant="subtle" leftSection={<IconTrash size={14} />} onClick={() => void removeDayOff(entry.date)} disabled={saving}>{t.dashboard.pos.remove}</Button>}</Table.Td></Table.Tr>)}</Table.Tbody></Table>

          <Title order={3}>{t.dashboard.pos.periodAdjustment}</Title>
          <Alert color="blue">{t.dashboard.pos.adjustmentResetNotice.replace("{period}", `${formatDate(detail.period.startsAt)} – ${formatDate(detail.period.endsAt)}`)}</Alert>
          <NumberInput label={t.dashboard.pos.manualAdjustmentRp} value={adjustment} onChange={(value) => setAdjustment(typeof value === "number" ? value : "")} thousandSeparator="," disabled={!isAdmin} />
          <TextInput label={t.dashboard.pos.adjustmentNote} value={note} onChange={(event) => setNote(event.currentTarget.value)} disabled={!isAdmin} />
          {isAdmin && <Button onClick={() => void saveAdjustment()} loading={saving}>{t.common.save}</Button>}

          <Title order={3}>{t.dashboard.pos.salesHistory}</Title>
          <Table withTableBorder><Table.Thead><Table.Tr><Table.Th>{t.dashboard.pos.date}</Table.Th><Table.Th>{t.dashboard.pos.item}</Table.Th><Table.Th>{t.dashboard.pos.allowanceUsed}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{detail.sales.map((sale) => <Table.Tr key={sale.id}><Table.Td>{formatDate(sale.createdAt)}</Table.Td><Table.Td>{sale.items.map((item) => `${item.itemName} × ${item.quantity}`).join(", ")}</Table.Td><Table.Td>{formatMoney(Number(sale.allowanceUsed))}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
        </Stack>}
      </Modal>
    </Stack>
  );
}
