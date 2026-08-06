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
  Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import { toDateOnlyValue, toggleHolidayDate } from "@/lib/pos";

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
  allowancePerWorkingDay: string;
  workingDays: number[];
  holidayDates: string[];
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
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/credentials")
      .then((r) => r.json())
      .then(setCredentials);
  }, []);

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
      } else {
        setWarehouseId(null);
        setWarehouseName("");
        setAllowancePerWorkingDay(0);
        setWorkingDays([1, 2, 3, 4, 5]);
        setHolidayDates([]);
      }
    }
  };

  const toggleHoliday = (date: Date) => {
    if (!workingDays.includes(date.getDay())) return;
    setHolidayDates((current) => toggleHolidayDate(current, toDateOnlyValue(date)));
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
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t.dashboard.pos.workingDays}
            </Text>
            <Text size="xs" c="dimmed">
              {t.dashboard.pos.workingDaysDescription}
            </Text>
            <DatePicker
              defaultDate={new Date()}
              onChange={(date) => date && toggleHoliday(date)}
              getDayProps={(date) => {
                const dateValue = toDateOnlyValue(date);
                const isWorkingDay = workingDays.includes(date.getDay());
                const isHoliday = holidayDates.includes(dateValue);
                return {
                  disabled: !credentialId || !isWorkingDay,
                  "aria-label": `${dateValue}: ${isHoliday ? t.dashboard.pos.holiday : t.dashboard.pos.workingDay}`,
                  style: isHoliday
                    ? {
                        backgroundColor: "var(--mantine-color-red-6)",
                        color: "var(--mantine-color-white)",
                        fontWeight: 700,
                      }
                    : isWorkingDay
                      ? {
                          backgroundColor: "var(--mantine-color-blue-light)",
                          color: "var(--mantine-color-blue-light-color)",
                          fontWeight: 600,
                        }
                      : undefined,
                };
              }}
            />
            <Group gap="xs">
              <Badge color="blue" variant="light">
                {t.dashboard.pos.workingDay}
              </Badge>
              <Badge color="red" variant="filled">
                {t.dashboard.pos.holiday}
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
