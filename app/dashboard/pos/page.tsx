"use client";

import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBarcode,
  IconCamera,
  IconHistory,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";

import { PersistentScanner } from "@/components/PersistentScanner";
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

interface StockChange {
  id: string;
  previousStock: number;
  newStock: number;
  quantityChange: number;
  source: string;
  note: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
  sale: { id: string; paymentMethod: string } | null;
}

export default function PosStockManagementPage() {
  const { t, language } = useLanguage();
  const isId = language === "id";
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState<"red" | "green">("red");
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [stock, setStock] = useState<number | "">(0);
  const [buyPrice, setBuyPrice] = useState<number | "">(0);
  const [sellPrice, setSellPrice] = useState<number | "">(0);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [stockProduct, setStockProduct] = useState<CatalogProduct | null>(null);
  const [stockValue, setStockValue] = useState<number | "">(0);
  const [stockSaving, setStockSaving] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<CatalogProduct | null>(null);
  const [history, setHistory] = useState<StockChange[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTruncated, setHistoryTruncated] = useState(false);

  const loadCatalog = useCallback(async (id: string) => {
    setCredentialId(id);
    setMessage("");
    const response = await fetch(`/api/pos/products/manage?credentialId=${id}`, { cache: "no-store" });
    const data = await response.json();
    setCatalog(response.ok ? data : []);
    if (!response.ok) {
      setMessage(data.error || t.common.error);
      setMessageColor("red");
    }
  }, [t.common.error]);

  useEffect(() => {
    void fetch("/api/credentials")
      .then((response) => response.json())
      .then((data: Credential[]) => {
        setCredentials(data);
        if (data.length === 1) void loadCatalog(data[0].id);
      });
  }, [loadCatalog]);

  useEffect(() => {
    if (scannerOpen && !cameraOpen) {
      window.setTimeout(() => scannerInputRef.current?.focus(), 100);
    }
  }, [cameraOpen, scannerOpen]);


  const resetForm = () => {
    setItemCode("");
    setItemName("");
    setUnit("PCS");
    setStock(0);
    setBuyPrice(0);
    setSellPrice(0);
  };

  const openAddProduct = (code = "") => {
    resetForm();
    setItemCode(code);
    setModalOpen(true);
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
        setMessage(t.dashboard.pos.productSaved);
        setMessageColor("green");
      } else {
        setMessage(data.error || t.common.error);
        setMessageColor("red");
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
    else {
      setMessage(data.error || t.common.error);
      setMessageColor("red");
    }
    return response.ok;
  };

  const saveScannedStock = async () => {
    if (!stockProduct || stockValue === "") return;
    setStockSaving(true);
    try {
      if (await updateProduct(stockProduct.id, { stock: stockValue })) {
        setStockProduct(null);
        setMessage(t.dashboard.pos.stockUpdated);
        setMessageColor("green");
      }
    } finally {
      setStockSaving(false);
    }
  };

  const handleScan = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const product = catalog.find((entry) => entry.itemCode === code);
    setScanCode("");
    setCameraOpen(false);
    setScannerOpen(false);
    if (product) {
      setStockProduct(product);
      setStockValue(product.stock);
      return;
    }
    const shouldAdd = window.confirm(t.dashboard.pos.barcodeNotFound.replace("{code}", code));
    if (shouldAdd) openAddProduct(code);
  };

  const openHistory = async (product: CatalogProduct) => {
    setHistoryProduct(product);
    setHistory([]);
    setHistoryTruncated(false);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/pos/products/manage/history?productId=${product.id}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setHistory(data.changes);
        setHistoryTruncated(Boolean(data.truncated));
      }
      else {
        setMessage(data.error || t.common.error);
        setMessageColor("red");
      }
    } finally {
      setHistoryLoading(false);
    }
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
        setMessage(data.error === "POS is not configured"
          ? "Configure the POS warehouse in POS Settings before synchronizing products."
          : data.error || `${data.failed || 0} ${t.dashboard.pos.syncFailed}`);
        setMessageColor("red");
      } else {
        setMessage(t.dashboard.pos.syncComplete);
        setMessageColor("green");
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

  const sourceLabel = (change: StockChange) => {
    if (change.source === "sale") {
      const payment = change.sale?.paymentMethod === "qris" ? "QRIS" : change.sale?.paymentMethod;
      return `${t.dashboard.pos.sale}${payment ? ` · ${payment}` : ""}`;
    }
    return t.dashboard.pos.manualChange;
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
              <Button
                variant="light"
                leftSection={<IconBarcode size={16} />}
                onClick={() => setScannerOpen(true)}
              >
                {t.dashboard.pos.scanProduct}
              </Button>
              <Button component="a" href="/dashboard/pos/settings" variant="subtle" leftSection={<IconSettings size={16} />}>
                POS Settings
              </Button>
              <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void syncProducts()} loading={syncing}>
                {t.dashboard.pos.syncStock}
              </Button>
              <Button onClick={() => openAddProduct()}>
                {t.dashboard.pos.addProduct}
              </Button>
            </Group>
          </Group>
          <Table.ScrollContainer minWidth={1000}>
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
                      <Group gap={4} wrap="nowrap">
                        <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => void openHistory(product)}>
                          {t.dashboard.pos.history}
                        </Button>
                        <Button size="xs" color="red" variant="subtle" onClick={() => void removeProduct(product.id)}>
                          {t.dashboard.pos.remove}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {message && <Text c={messageColor}>{message}</Text>}

      <Modal
        opened={scannerOpen}
        onClose={() => { setScannerOpen(false); setCameraOpen(false); setScanCode(""); }}
        title={t.dashboard.pos.scanProduct}
        size="lg"
      >
        <Stack>
          <Text size="sm" c="dimmed">{t.dashboard.pos.scannerInstructions}</Text>
          <TextInput
            ref={scannerInputRef}
            label={t.dashboard.pos.barcodeProductCode}
            value={scanCode}
            onChange={(event) => setScanCode(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleScan(scanCode);
            }}
            leftSection={<IconBarcode size={16} />}
          />
          <Group>
            <Button onClick={() => handleScan(scanCode)} disabled={!scanCode.trim()}>
              {t.dashboard.pos.findProduct}
            </Button>
            <Button variant="light" leftSection={<IconCamera size={16} />} onClick={() => setCameraOpen((current) => !current)}>
              {cameraOpen ? t.dashboard.pos.closeCamera : t.dashboard.pos.useCamera}
            </Button>
          </Group>
          {cameraOpen ? <PersistentScanner onScan={handleScan} scannerHeight={300} /> : null}
        </Stack>
      </Modal>

      <Modal
        opened={!!stockProduct}
        onClose={() => setStockProduct(null)}
        title={t.dashboard.pos.updateStock}
      >
        <Stack>
          <div>
            <Text fw={700}>{stockProduct?.itemName}</Text>
            <Text size="sm" c="dimmed">{stockProduct?.itemCode}</Text>
          </div>
          <NumberInput
            label={t.dashboard.pos.newStockQuantity}
            value={stockValue}
            onChange={(value) => setStockValue(typeof value === "number" ? value : "")}
            min={0}
            allowDecimal={false}
            required
          />
          <Text size="sm" c="dimmed">
            {t.dashboard.pos.currentStock.replace("{stock}", String(stockProduct?.stock ?? 0))}
          </Text>
          <Button onClick={() => void saveScannedStock()} loading={stockSaving} disabled={stockValue === "" || stockValue === stockProduct?.stock}>
            {t.dashboard.pos.saveStock}
          </Button>
        </Stack>
      </Modal>

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

      <Modal
        opened={!!historyProduct}
        onClose={() => setHistoryProduct(null)}
        title={`${t.dashboard.pos.stockHistory}: ${historyProduct?.itemName ?? ""}`}
        size="xl"
      >
        {historyLoading ? (
          <Text c="dimmed">{t.dashboard.pos.loadingHistory}</Text>
        ) : history.length === 0 ? (
          <Text c="dimmed">{t.dashboard.pos.noStockChanges}</Text>
        ) : (
          <Stack gap="sm">
            {historyTruncated ? <Text size="sm" c="orange">{t.dashboard.pos.stockHistoryTruncated}</Text> : null}
            <ScrollArea>
              <Table miw={760} striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.dashboard.pos.time}</Table.Th>
                  <Table.Th>{t.dashboard.pos.source}</Table.Th>
                  <Table.Th ta="right">{t.dashboard.pos.before}</Table.Th>
                  <Table.Th ta="right">{t.dashboard.pos.change}</Table.Th>
                  <Table.Th ta="right">{t.dashboard.pos.after}</Table.Th>
                  <Table.Th>{t.dashboard.pos.userNote}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((change) => (
                  <Table.Tr key={change.id}>
                    <Table.Td>{new Date(change.createdAt).toLocaleString(isId ? "id-ID" : "en-US")}</Table.Td>
                    <Table.Td><Badge variant="light" color={change.source === "sale" ? "blue" : "orange"}>{sourceLabel(change)}</Badge></Table.Td>
                    <Table.Td ta="right">{change.previousStock}</Table.Td>
                    <Table.Td ta="right">
                      <Text c={change.quantityChange < 0 ? "red" : "green"} fw={700}>
                        {change.quantityChange > 0 ? "+" : ""}{change.quantityChange}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" fw={700}>{change.newStock}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{change.user?.name || change.user?.email || t.dashboard.pos.system}</Text>
                      {change.note ? <Text size="xs" c="dimmed">{change.note}</Text> : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
