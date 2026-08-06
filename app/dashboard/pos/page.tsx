"use client";

import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
}

interface CatalogProduct {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string | null;
  buyPrice: string;
  sellPrice: string;
  stock: number;
  isActive: boolean;
  syncStatus: "pending" | "synced" | "error";
  syncError: string | null;
}

export default function PosStockManagementPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [stock, setStock] = useState<number | "">(0);
  const [buyPrice, setBuyPrice] = useState<number | "">(0);
  const [sellPrice, setSellPrice] = useState<number | "">(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/credentials")
      .then((response) => response.json())
      .then(setCredentials);
  }, []);

  const loadCatalog = async (id: string) => {
    setCredentialId(id);
    setMessage("");
    const response = await fetch(`/api/pos/products/manage?credentialId=${id}`);
    const data = await response.json();
    setCatalog(response.ok ? data : []);
    setMessage(response.ok ? "" : data.error || t.common.error);
  };

  const resetForm = () => {
    setItemCode("");
    setItemName("");
    setUnit("PCS");
    setStock(0);
    setBuyPrice(0);
    setSellPrice(0);
  };

  const saveProduct = async () => {
    if (!credentialId || !itemCode.trim() || !itemName.trim() || !unit.trim() || stock === "" || buyPrice === "" || sellPrice === "") return;
    setSaving(true);
    try {
      const response = await fetch("/api/pos/products/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          itemCode: itemCode.trim(),
          itemName: itemName.trim(),
          unit: unit.trim(),
          stock,
          buyPrice,
          sellPrice,
          isActive: true,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setModalOpen(false);
        resetForm();
        await loadCatalog(credentialId);
      } else {
        setMessage(data.error || t.common.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = async (
    id: string,
    updates: { itemName?: string; unit?: string; stock?: number; buyPrice?: number; sellPrice?: number; isActive?: boolean },
  ) => {
    const response = await fetch("/api/pos/products/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const data = await response.json();
    if (response.ok && credentialId) await loadCatalog(credentialId);
    else setMessage(data.error || t.common.error);
  };

  const removeProduct = async (id: string) => {
    const response = await fetch(`/api/pos/products/manage?id=${id}`, { method: "DELETE" });
    if (response.ok && credentialId) await loadCatalog(credentialId);
  };

  const syncProducts = async () => {
    if (!credentialId) return;
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/pos/products/manage/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const data = await response.json();
      await loadCatalog(credentialId);
      if (!response.ok || data.failed) {
        setMessage(data.error || `${data.failed || 0} ${t.dashboard.pos.syncFailed}`);
      } else {
        setMessage(t.dashboard.pos.syncComplete);
      }
    } finally {
      setSyncing(false);
    }
  };

  const statusBadge = (product: CatalogProduct) => {
    const color = product.syncStatus === "synced" ? "green" : product.syncStatus === "error" ? "red" : "yellow";
    return (
      <Badge color={color} variant="light" title={product.syncError || undefined}>
        {t.dashboard.pos[product.syncStatus]}
      </Badge>
    );
  };

  return (
    <Stack>
      <Title>{t.dashboard.pos.stockManagementTitle}</Title>
      <Select
        label={t.dashboard.pos.credential}
        data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))}
        value={credentialId}
        onChange={(value) => value && void loadCatalog(value)}
      />

      {credentialId && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="md">
            <Title order={3}>{t.dashboard.pos.catalog}</Title>
            <Group>
              <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void syncProducts()} loading={syncing}>
                {t.dashboard.pos.syncStock}
              </Button>
              <Button onClick={() => { resetForm(); setModalOpen(true); }}>
                {t.dashboard.pos.addProduct}
              </Button>
            </Group>
          </Group>
          <Table.ScrollContainer minWidth={900}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.dashboard.pos.productCode}</Table.Th>
                  <Table.Th>{t.dashboard.pos.productName}</Table.Th>
                  <Table.Th>{t.dashboard.pos.unit}</Table.Th>
                  <Table.Th>{t.dashboard.pos.stock}</Table.Th>
                  <Table.Th>{t.dashboard.pos.buyPrice}</Table.Th>
                  <Table.Th>{t.dashboard.pos.sellPrice}</Table.Th>
                  <Table.Th>{t.dashboard.pos.syncStatus}</Table.Th>
                  <Table.Th>{t.dashboard.pos.active}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {catalog.map((product) => (
                  <Table.Tr key={product.id}>
                    <Table.Td>{product.itemCode}</Table.Td>
                    <Table.Td>{product.itemName}</Table.Td>
                    <Table.Td>{product.unit || "-"}</Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" defaultValue={product.stock} min={0} allowDecimal={false} onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isInteger(value) && value >= 0 && value !== product.stock) void updateProduct(product.id, { stock: value });
                      }} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" defaultValue={Number(product.buyPrice)} min={0} onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value) && value !== Number(product.buyPrice)) void updateProduct(product.id, { buyPrice: value });
                      }} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" defaultValue={Number(product.sellPrice)} min={0} onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value) && value !== Number(product.sellPrice)) void updateProduct(product.id, { sellPrice: value });
                      }} />
                    </Table.Td>
                    <Table.Td>{statusBadge(product)}</Table.Td>
                    <Table.Td>
                      <Switch checked={product.isActive} onChange={(event) => void updateProduct(product.id, { isActive: event.currentTarget.checked })} />
                    </Table.Td>
                    <Table.Td>
                      <Button size="xs" color="red" variant="subtle" onClick={() => void removeProduct(product.id)}>
                        {t.dashboard.pos.remove}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {message && <Text c={message === t.dashboard.pos.syncComplete ? "green" : "red"}>{message}</Text>}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={t.dashboard.pos.addProduct}>
        <Stack>
          <TextInput label={t.dashboard.pos.productCode} value={itemCode} onChange={(event) => setItemCode(event.currentTarget.value)} required />
          <TextInput label={t.dashboard.pos.productName} value={itemName} onChange={(event) => setItemName(event.currentTarget.value)} required />
          <TextInput label={t.dashboard.pos.unit} value={unit} onChange={(event) => setUnit(event.currentTarget.value)} required />
          <NumberInput label={t.dashboard.pos.stock} value={stock} onChange={(value) => setStock(typeof value === "number" ? value : "")} min={0} allowDecimal={false} required />
          <NumberInput label={t.dashboard.pos.buyPrice} value={buyPrice} onChange={(value) => setBuyPrice(typeof value === "number" ? value : "")} min={0} required />
          <NumberInput label={t.dashboard.pos.sellPrice} value={sellPrice} onChange={(value) => setSellPrice(typeof value === "number" ? value : "")} min={0} required />
          <Button onClick={() => void saveProduct()} loading={saving} disabled={!itemCode.trim() || !itemName.trim() || !unit.trim() || stock === "" || buyPrice === "" || sellPrice === ""}>
            {t.common.save}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
