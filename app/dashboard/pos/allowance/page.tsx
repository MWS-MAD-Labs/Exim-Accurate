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
import { DatePicker } from "@mantine/dates";
import { IconCalendarOff, IconEdit, IconSearch, IconTrash } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

interface Credential { id: string; appKey: string }
interface Period { startsAt: string; endsAt: string; isCustom: boolean }
interface PeriodOption extends Period { isOngoing: boolean }
interface PreviousDebt {
  blocked: boolean;
  debt: number;
  paid: number;
  outstanding: number;
  period: { startsAt: string; endsAt: string };
}
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
  previousDebt: PreviousDebt;
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
interface DebtSettlement {
  id: string;
  periodStartsAt: string;
  periodEndsAt: string;
  amount: string;
  note: string | null;
  createdAt: string;
  createdBy: { email: string };
}
interface AllowanceDetail extends Allowance { daysOff: DayOff[]; sales: Sale[]; adjustments: Adjustment[]; debtSettlements: DebtSettlement[] }

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

function periodValue(period: Pick<Period, "startsAt" | "endsAt">) {
  return `${period.startsAt}:${period.endsAt}`;
}

function formatPeriod(period: Pick<Period, "startsAt" | "endsAt">) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${formatter.format(new Date(`${period.startsAt}T00:00:00`))} – ${formatter.format(new Date(`${period.endsAt}T00:00:00`))}`;
}

export default function StaffAllowancePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Allowance[]>([]);
  const [search, setSearch] = useState("");
  const [periodYear, setPeriodYear] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [periodsKey, setPeriodsKey] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<AllowanceDetail | null>(null);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");
  const [adjustment, setAdjustment] = useState<number | "">(0);
  const [note, setNote] = useState("");
  const [debtPayment, setDebtPayment] = useState<number | "">("");
  const [debtPaymentNote, setDebtPaymentNote] = useState("");
  const [saving, setSaving] = useState(false);
  const staffRequestController = useRef<AbortController | null>(null);
  const staffRequestSequence = useRef(0);

  useEffect(() => {
    void fetch("/api/credentials").then((response) => response.json()).then((data: Credential[]) => {
      setCredentials(data);
      if (data[0]) setCredentialId(data[0].id);
    });
  }, []);

  const activePeriodsKey = credentialId && periodYear ? `${credentialId}:${periodYear}` : "";
  const selectedPeriodOption = periodsKey === activePeriodsKey
    ? periods.find((period) => periodValue(period) === selectedPeriod) ?? null
    : null;
  const cancelStaffRequest = () => {
    staffRequestController.current?.abort();
    staffRequestSequence.current += 1;
    setLoading(false);
  };

  const latestYear = Math.max(new Date().getFullYear(), Number(periodYear) || 0);
  const yearOptions = Array.from(
    { length: Math.max(1, latestYear - 2019) },
    (_, index) => String(latestYear - index),
  );

  const loadPeriods = async (id: string, year: string | null, signal: AbortSignal) => {
    cancelStaffRequest();
    setLoadingPeriods(true);
    setPeriods([]);
    setPeriodsKey("");
    setSelectedPeriod(null);
    setStaff([]);
    setMessage("");
    try {
      const params = new URLSearchParams({ credentialId: id });
      if (year) params.set("year", year);
      const response = await fetch(`/api/pos/allowance/periods?${params}`, { signal });
      const data = await response.json();
      if (signal.aborted) return;
      if (!response.ok) {
        setMessage(data.error || t.common.error);
        return;
      }
      const resolvedYear = String(data.year);
      const nextPeriods = data.periods as PeriodOption[];
      setPeriodYear(resolvedYear);
      setPeriods(nextPeriods);
      setPeriodsKey(`${id}:${resolvedYear}`);
      const defaultPeriod = nextPeriods.find((period) => period.isOngoing) || nextPeriods[0];
      setSelectedPeriod(defaultPeriod ? periodValue(defaultPeriod) : null);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setMessage(t.common.error);
    } finally {
      if (!signal.aborted) setLoadingPeriods(false);
    }
  };

  const loadStaff = async (id = credentialId, query = search, period = selectedPeriodOption) => {
    if (!id || !period) return;
    staffRequestController.current?.abort();
    const controller = new AbortController();
    const requestSequence = staffRequestSequence.current + 1;
    staffRequestController.current = controller;
    staffRequestSequence.current = requestSequence;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ credentialId: id });
      if (query.trim()) params.set("search", query.trim());
      params.set("periodStart", period.startsAt);
      params.set("periodEnd", period.endsAt);
      const response = await fetch(`/api/pos/allowance/users?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted || requestSequence !== staffRequestSequence.current) return;
      setStaff(response.ok ? data : []);
      if (!response.ok) setMessage(data.error || t.common.error);
    } catch (error) {
      if (
        requestSequence === staffRequestSequence.current &&
        error instanceof Error &&
        error.name !== "AbortError"
      ) {
        setStaff([]);
        setMessage(t.common.error);
      }
    } finally {
      if (requestSequence === staffRequestSequence.current && !controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!credentialId || (periodYear && periodsKey === `${credentialId}:${periodYear}`)) return;
    const controller = new AbortController();
    void loadPeriods(credentialId, periodYear, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialId, periodYear]);

  useEffect(() => () => staffRequestController.current?.abort(), []);

  useEffect(() => {
    if (credentialId && selectedPeriodOption) void loadStaff(credentialId, search, selectedPeriodOption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialId, selectedPeriod]);

  const openDetail = async (entry: Allowance) => {
    if (!credentialId) return;
    setMessage("");
    if (!selectedPeriodOption) return;
    const params = new URLSearchParams({
      credentialId,
      periodStart: selectedPeriodOption.startsAt,
      periodEnd: selectedPeriodOption.endsAt,
    });
    const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(entry.staffEmail)}?${params}`);
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || t.common.error);
    setDetail(data);
    setSelectedDates([]);
    setReason("");
    setAdjustment(data.manualAdjustment);
    setDebtPayment(data.previousDebt.outstanding || "");
    setDebtPaymentNote("");
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

  const recordDebtPayment = async () => {
    if (!credentialId || !detail || debtPayment === "" || debtPayment <= 0 || !selectedPeriodOption?.isOngoing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/pos/allowance/users/${encodeURIComponent(detail.staffEmail)}/debt-settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          periodStartsAt: dateOnly(detail.previousDebt.period.startsAt),
          periodEndsAt: dateOnly(detail.previousDebt.period.endsAt),
          amount: debtPayment,
          note: debtPaymentNote.trim() || undefined,
        }),
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
        <Group align="end" wrap="wrap">
          <Select
            label={t.dashboard.pos.credential}
            data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))}
            value={credentialId}
            onChange={(value) => {
              cancelStaffRequest();
              setCredentialId(value);
              setPeriodYear(null);
              setPeriods([]);
              setPeriodsKey("");
              setSelectedPeriod(null);
              setStaff([]);
            }}
            style={{ flex: 1 }}
          />
          <Select
            label={t.dashboard.pos.allowanceYear}
            data={yearOptions}
            value={periodYear}
            onChange={(value) => {
              if (!value) return;
              cancelStaffRequest();
              setStaff([]);
              setPeriodYear(value);
            }}
            allowDeselect={false}
            w={120}
          />
          <Select
            label={t.dashboard.pos.allowancePeriod}
            data={periods.map((period) => ({
              value: periodValue(period),
              label: `${formatPeriod(period)}${period.isOngoing ? ` (${t.dashboard.pos.allowancePeriodOngoing})` : ""}`,
            }))}
            value={selectedPeriod}
            onChange={(value) => {
              cancelStaffRequest();
              setStaff([]);
              setSelectedPeriod(value);
            }}
            placeholder={loadingPeriods ? t.dashboard.pos.allowancePeriodLoading : t.dashboard.pos.allowancePeriodSelect}
            disabled={loadingPeriods || !periods.length}
            allowDeselect={false}
            style={{ flex: 2 }}
          />
          <TextInput
            label={t.dashboard.pos.searchStaff}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => event.key === "Enter" && void loadStaff()}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 2 }}
          />
          <Button onClick={() => void loadStaff()} loading={loading} disabled={!selectedPeriodOption}>{t.dashboard.pos.searchButton}</Button>
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
              <Table.Th>{t.dashboard.pos.allowanceUsed}</Table.Th><Table.Th>{t.dashboard.pos.allowanceRemaining}</Table.Th><Table.Th>{t.dashboard.pos.previousDebt}</Table.Th><Table.Th />
            </Table.Tr></Table.Thead>
            <Table.Tbody>{staff.map((entry) => <Table.Tr key={entry.staffEmail}>
              <Table.Td><Text fw={500}>{entry.staffName || entry.staffEmail}</Text>{entry.staffName && <Text size="xs" c="dimmed">{entry.staffEmail}</Text>}</Table.Td>
              <Table.Td>{entry.baseWorkingDays}</Table.Td><Table.Td>{entry.daysOffCount}</Table.Td>
              <Table.Td>{formatMoney(entry.standardAllowance)}</Table.Td><Table.Td>{formatMoney(entry.manualAdjustment)}</Table.Td>
              <Table.Td><Text c={entry.totalAllowance < 0 ? "red" : undefined}>{formatMoney(entry.totalAllowance)}</Text></Table.Td><Table.Td>{formatMoney(entry.allowanceSpent)}</Table.Td>
              <Table.Td><Text fw={700} c={entry.remainingAllowance < 0 ? "red" : "green"}>{formatMoney(entry.remainingAllowance)}</Text></Table.Td>
              <Table.Td><Text fw={700} c={entry.previousDebt.blocked ? "red" : "green"}>{entry.previousDebt.blocked ? formatMoney(entry.previousDebt.outstanding) : t.dashboard.pos.previousDebtPaidOrNone}</Text></Table.Td>
              <Table.Td><Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => void openDetail(entry)}>{t.dashboard.pos.details}</Button></Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </ScrollArea>
        {!loading && !staff.length && <Text c="dimmed" ta="center" p="xl">{t.dashboard.pos.noStaff}</Text>}
      </Paper>

      <Modal opened={!!detail} onClose={() => setDetail(null)} title={detail?.staffName || detail?.staffEmail} size="xl">
        {detail && <Stack>
          <Text c="dimmed">{detail.staffEmail} · {formatDate(detail.period.startsAt)} – {formatDate(detail.period.endsAt)}</Text>
          <Card withBorder><Text c="dimmed">{t.dashboard.pos.allowanceRemaining}</Text><Text size="2rem" fw={800} c={detail.remainingAllowance < 0 ? "red" : "green"}>{formatMoney(detail.remainingAllowance)}</Text><Text size="sm">{detail.effectiveWorkingDays} × {formatMoney(detail.dailyRate)} + {formatMoney(detail.manualAdjustment)} − {formatMoney(detail.allowanceSpent)}</Text></Card>
          {detail.previousDebt.blocked && <Alert color="red">{t.dashboard.pos.debtBlockedAlert.replace("{amount}", formatMoney(detail.previousDebt.outstanding))}</Alert>}
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.baseDays}</Text><Text size="xl" fw={700}>{detail.baseWorkingDays}</Text></Card>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.daysOff}</Text><Text size="xl" fw={700}>{detail.daysOffCount}</Text></Card>
            <Card withBorder><Text size="sm" c="dimmed">{t.dashboard.pos.totalAllowance}</Text><Text size="xl" fw={700} c={detail.totalAllowance < 0 ? "red" : undefined}>{formatMoney(detail.totalAllowance)}</Text></Card>
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

          <Title order={3}>{t.dashboard.pos.previousPeriodDebt}</Title>
          <Card withBorder>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <div><Text size="sm" c="dimmed">{t.dashboard.pos.originalDebt}</Text><Text fw={700}>{formatMoney(detail.previousDebt.debt)}</Text></div>
              <div><Text size="sm" c="dimmed">{t.dashboard.pos.debtPaid}</Text><Text fw={700}>{formatMoney(detail.previousDebt.paid)}</Text></div>
              <div><Text size="sm" c="dimmed">{t.dashboard.pos.debtOutstanding}</Text><Text fw={700} c={detail.previousDebt.blocked ? "red" : "green"}>{formatMoney(detail.previousDebt.outstanding)}</Text></div>
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="sm">{formatDate(detail.previousDebt.period.startsAt)} – {formatDate(detail.previousDebt.period.endsAt)}</Text>
          </Card>
          {isAdmin && selectedPeriodOption?.isOngoing && detail.previousDebt.blocked && <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}><NumberInput label={t.dashboard.pos.debtPaymentAmount} value={debtPayment} onChange={(value) => setDebtPayment(typeof value === "number" ? value : "")} min={1} max={detail.previousDebt.outstanding} thousandSeparator="," /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 5 }}><TextInput label={t.dashboard.pos.debtPaymentNote} value={debtPaymentNote} onChange={(event) => setDebtPaymentNote(event.currentTarget.value)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}><Button mt={25} fullWidth onClick={() => void recordDebtPayment()} loading={saving} disabled={debtPayment === "" || debtPayment <= 0 || debtPayment > detail.previousDebt.outstanding}>{t.dashboard.pos.recordDebtPayment}</Button></Grid.Col>
          </Grid>}
          {!!detail.debtSettlements.length && <Table withTableBorder><Table.Thead><Table.Tr><Table.Th>{t.dashboard.pos.date}</Table.Th><Table.Th>{t.dashboard.pos.amount}</Table.Th><Table.Th>{t.dashboard.pos.adjustmentNote}</Table.Th><Table.Th>{t.dashboard.pos.recordedBy}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{detail.debtSettlements.map((settlement) => <Table.Tr key={settlement.id}><Table.Td>{formatDate(settlement.createdAt)}</Table.Td><Table.Td>{formatMoney(Number(settlement.amount))}</Table.Td><Table.Td>{settlement.note || "–"}</Table.Td><Table.Td>{settlement.createdBy.email}</Table.Td></Table.Tr>)}</Table.Tbody></Table>}

          <Title order={3}>{t.dashboard.pos.salesHistory}</Title>
          <Table withTableBorder><Table.Thead><Table.Tr><Table.Th>{t.dashboard.pos.date}</Table.Th><Table.Th>{t.dashboard.pos.item}</Table.Th><Table.Th>{t.dashboard.pos.allowanceUsed}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{detail.sales.map((sale) => <Table.Tr key={sale.id}><Table.Td>{formatDate(sale.createdAt)}</Table.Td><Table.Td>{sale.items.map((item) => `${item.itemName} × ${item.quantity}`).join(", ")}</Table.Td><Table.Td>{formatMoney(Number(sale.allowanceUsed))}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
        </Stack>}
      </Modal>
    </Stack>
  );
}
