"use client";

import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";

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
}

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export default function PosSettingsPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState("");
  const [allowancePerWorkingDay, setAllowancePerWorkingDay] = useState<number | "">(0);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
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
      } else {
        setWarehouseId(null);
        setWarehouseName("");
        setAllowancePerWorkingDay(0);
        setWorkingDays([1, 2, 3, 4, 5]);
      }
    }
  };

  const toggleDay = (day: number) =>
    setWorkingDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );

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
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t.dashboard.pos.workingDays}
            </Text>
            <Group gap="sm">
              {DAY_KEYS.map((key, day) => (
                <Checkbox
                  key={key}
                  label={t.dashboard.pos[key]}
                  checked={workingDays.includes(day)}
                  onChange={() => toggleDay(day)}
                  disabled={!credentialId}
                />
              ))}
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
