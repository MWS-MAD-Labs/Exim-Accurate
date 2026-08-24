"use client";

import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import { getRecurringAllowancePeriod, toDateOnlyValue, toggleHolidayDate } from "@/lib/pos";

interface Credential {
  id: string;
  appKey: string;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Settings {
  credentialId: string;
  warehouseId: number;
  warehouseName: string;
  isActive: boolean;
  allowancePerWorkingDay: string;
  workingDays: number[];
  holidayDates: string[];
  allowanceCutoffDay: number;
  staffPaydayDay: number;
  preorderHoldHours: number;
  allowancePeriodOverrides: Array<{ id: string; startsAt: string; endsAt: string }>;
}

interface AllowancePeriodOverride {
  startsAt: string;
  endsAt: string;
}

export default function PosSettingsPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState("");
  const [allowancePerWorkingDay, setAllowancePerWorkingDay] = useState<number | "">(0);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [allowanceCutoffDay, setAllowanceCutoffDay] = useState<number | "">(22);
  const [staffPaydayDay, setStaffPaydayDay] = useState<number | "">(28);
  const [preorderHoldHours, setPreorderHoldHours] = useState<number | "">(4);
  const [allowancePeriodOverrides, setAllowancePeriodOverrides] = useState<AllowancePeriodOverride[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadForCredential = async (id: string) => {
    setCredentialId(id);
    setMessage("");
    const [warehousesResponse, settingsResponse] = await Promise.all([
      fetch(`/api/pos/settings/warehouses?credentialId=${id}`),
      fetch("/api/pos/settings"),
    ]);
    if (warehousesResponse.ok) setWarehouses(await warehousesResponse.json());
    if (settingsResponse.ok) {
      const all: Settings[] = await settingsResponse.json();
      const existing = all.find((entry) => entry.credentialId === id);
      if (existing) {
        setWarehouseId(existing.warehouseId);
        setWarehouseName(existing.warehouseName);
        setAllowancePerWorkingDay(Number(existing.allowancePerWorkingDay));
        setWorkingDays(existing.workingDays);
        setHolidayDates(existing.holidayDates);
        setAllowanceCutoffDay(existing.allowanceCutoffDay);
        setStaffPaydayDay(existing.staffPaydayDay);
        setPreorderHoldHours(existing.preorderHoldHours);
        setAllowancePeriodOverrides(existing.allowancePeriodOverrides.map(({ startsAt, endsAt }) => ({
          startsAt: startsAt.slice(0, 10),
          endsAt: endsAt.slice(0, 10),
        })));
      } else {
        setWarehouseId(null);
        setWarehouseName("");
        setAllowancePerWorkingDay(0);
        setWorkingDays([1, 2, 3, 4, 5]);
        setHolidayDates([]);
        setAllowanceCutoffDay(22);
        setStaffPaydayDay(28);
        setPreorderHoldHours(4);
        setAllowancePeriodOverrides([]);
      }
    }
  };

  useEffect(() => {
    void fetch("/api/credentials")
      .then((response) => response.json())
      .then((data: Credential[]) => {
        setCredentials(data);
        if (data.length === 1) void loadForCredential(data[0].id);
      });
  }, []);

  const toggleNoAllowance = (date: Date) => {
    if (!workingDays.includes(date.getDay())) return;
    setHolidayDates((current) => toggleHolidayDate(current, toDateOnlyValue(date)));
  };

  const getPeriodStyle = (date: Date) => {
    const dateValue = toDateOnlyValue(date);
    const customPeriod = allowancePeriodOverrides.find((period) => (
      period.startsAt && period.endsAt && period.startsAt <= dateValue && dateValue <= period.endsAt
    ));
    if (customPeriod) {
      return {
        backgroundColor: "var(--mantine-color-violet-light)",
        color: "var(--mantine-color-violet-light-color)",
      };
    }
    const period = getRecurringAllowancePeriod(typeof allowanceCutoffDay === "number" ? allowanceCutoffDay : 22, date);
    const cycleIndex = period.endsAt.getFullYear() * 12 + period.endsAt.getMonth();
    return cycleIndex % 2 === 0
      ? { backgroundColor: "var(--mantine-color-blue-light)", color: "var(--mantine-color-blue-light-color)" }
      : { backgroundColor: "var(--mantine-color-teal-light)", color: "var(--mantine-color-teal-light-color)" };
  };

  const save = async () => {
    if (!credentialId || !warehouseId || !warehouseName) return;
    setSaving(true);
    try {
      const response = await fetch("/api/pos/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          warehouseId,
          warehouseName,
          allowancePerWorkingDay: allowancePerWorkingDay || 0,
          workingDays,
          holidayDates,
          allowanceCutoffDay: allowanceCutoffDay || 22,
          staffPaydayDay: staffPaydayDay || 28,
          preorderHoldHours: preorderHoldHours || 4,
          allowancePeriodOverrides,
        }),
      });
      const data = await response.json();
      setMessage(response.ok ? t.common.success : data.error || t.common.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Title>{t.dashboard.pos.warehouseTitle}</Title>
      <Paper p="md" withBorder>
        <Stack>
          <Text size="sm" c="dimmed">
            Saving this page makes the selected credential the only active POS store for staff preorders and cashier operations.
          </Text>
          <Select
            label={t.dashboard.pos.credential}
            data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))}
            value={credentialId}
            onChange={(id) => id && void loadForCredential(id)}
          />
          <Select
            label={t.dashboard.pos.warehouse}
            data={warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))}
            value={warehouseId ? String(warehouseId) : null}
            onChange={(id) => {
              const selected = warehouses.find((warehouse) => String(warehouse.id) === id);
              if (selected) {
                setWarehouseId(selected.id);
                setWarehouseName(selected.name);
              }
            }}
            disabled={!credentialId}
          />
          <NumberInput
            label={t.dashboard.pos.allowancePerWorkingDay}
            value={allowancePerWorkingDay}
            onChange={(value) => setAllowancePerWorkingDay(typeof value === "number" ? value : "")}
            min={0}
            disabled={!credentialId}
          />
          <NumberInput
            label="Preorder stock hold (hours)"
            description="Available stock is locked for this many hours after a staff preorder is placed."
            value={preorderHoldHours}
            onChange={(value) => setPreorderHoldHours(typeof value === "number" ? value : "")}
            min={1}
            max={168}
            disabled={!credentialId}
          />
          <NumberInput
            label={t.dashboard.pos.allowanceCutoffDay}
            description={t.dashboard.pos.allowanceCutoffDayDescription}
            value={allowanceCutoffDay}
            onChange={(value) => setAllowanceCutoffDay(typeof value === "number" ? value : "")}
            min={1}
            max={28}
            disabled={!credentialId}
          />
          <NumberInput
            label={t.dashboard.pos.staffSalaryPayday}
            description={t.dashboard.pos.staffSalaryPaydayDescription}
            value={staffPaydayDay}
            onChange={(value) => setStaffPaydayDay(typeof value === "number" ? value : "")}
            min={1}
            max={28}
            disabled={!credentialId}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t.dashboard.pos.customAllowancePeriods}
            </Text>
            <Text size="xs" c="dimmed">
              {t.dashboard.pos.customAllowancePeriodsDescription}
            </Text>
            {allowancePeriodOverrides.map((period, index) => (
              <Group key={index} align="end" wrap="nowrap">
                <TextInput
                  type="date"
                  label={t.dashboard.pos.periodStart}
                  value={period.startsAt}
                  onChange={(event) => setAllowancePeriodOverrides((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, startsAt: event.currentTarget.value } : entry))}
                  disabled={!credentialId}
                />
                <TextInput
                  type="date"
                  label={t.dashboard.pos.periodCutoff}
                  value={period.endsAt}
                  onChange={(event) => setAllowancePeriodOverrides((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, endsAt: event.currentTarget.value } : entry))}
                  disabled={!credentialId}
                />
                <Button color="red" variant="subtle" onClick={() => setAllowancePeriodOverrides((current) => current.filter((_, entryIndex) => entryIndex !== index))} disabled={!credentialId}>
                  {t.dashboard.pos.remove}
                </Button>
              </Group>
            ))}
            <Button variant="light" onClick={() => setAllowancePeriodOverrides((current) => [...current, { startsAt: "", endsAt: "" }])} disabled={!credentialId}>
              {t.dashboard.pos.addCustomAllowancePeriod}
            </Button>
          </Stack>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t.dashboard.pos.workingDays}
            </Text>
            <Text size="xs" c="dimmed">
              {t.dashboard.pos.workingDaysDescription}
            </Text>
            <DatePicker
              defaultDate={new Date()}
              numberOfColumns={2}
              onChange={(date) => date && toggleNoAllowance(date)}
              getDayProps={(date) => {
                const dateValue = toDateOnlyValue(date);
                const isWorkingDay = workingDays.includes(date.getDay());
                const hasNoAllowance = holidayDates.includes(dateValue);
                return {
                  disabled: !credentialId || !isWorkingDay,
                  "aria-label": `${dateValue}: ${hasNoAllowance ? t.dashboard.pos.noAllowance : t.dashboard.pos.workingDay}`,
                  style: hasNoAllowance
                    ? {
                        backgroundColor: "var(--mantine-color-red-6)",
                        color: "var(--mantine-color-white)",
                        fontWeight: 700,
                      }
                    : isWorkingDay
                      ? { ...getPeriodStyle(date), fontWeight: 600 }
                      : undefined,
                };
              }}
            />
            <Group gap="xs">
              <Badge color="blue" variant="light">
                {t.dashboard.pos.allowancePeriodA}
              </Badge>
              <Badge color="teal" variant="light">
                {t.dashboard.pos.allowancePeriodB}
              </Badge>
              <Badge color="violet" variant="light">
                {t.dashboard.pos.customPeriod}
              </Badge>
              <Badge color="red" variant="filled">
                {t.dashboard.pos.noAllowance}
              </Badge>
            </Group>
          </Stack>
          <Button onClick={() => void save()} loading={saving} disabled={!credentialId || !warehouseId || !warehouseName}>
            {t.dashboard.pos.save}
          </Button>
          {message && <Text>{message}</Text>}
        </Stack>
      </Paper>
    </Stack>
  );
}
