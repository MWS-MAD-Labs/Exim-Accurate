"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArchive,
  IconBarcode,
  IconCamera,
  IconCheck,
  IconClipboardList,
  IconHistory,
  IconPrinter,
  IconRefresh,
  IconSearch,
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

interface RestockProposalItem {
  itemCode: string;
  itemName: string;
  unit: string | null;
  currentStock: number;
  heldQuantity: number;
  availableStock: number;
  soldUnits: number;
  proposedQuantity: number;
  buyPrice: number;
  lineTotal: number;
}

interface RestockProposal {
  lookbackDays: number;
  targetCoverDays: number;
  proposer: { name: string | null; email: string | null };
  generatedAt: string;
  items: RestockProposalItem[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
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
  const [search, setSearch] = useState("");
  const [restockOpened, setRestockOpened] = useState(false);
  const [restockProposal, setRestockProposal] = useState<RestockProposal | null>(null);
  const [restockSelected, setRestockSelected] = useState<Set<string>>(new Set());
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError] = useState("");
  const [restockExportError, setRestockExportError] = useState("");

  const selectedRestockItems = useMemo(
    () => restockProposal?.items.filter((item) => restockSelected.has(item.itemCode)) ?? [],
    [restockProposal, restockSelected],
  );
  const restockTotal = useMemo(
    () => selectedRestockItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [selectedRestockItems],
  );
  const restockUnits = useMemo(
    () => selectedRestockItems.reduce((sum, item) => sum + item.proposedQuantity, 0),
    [selectedRestockItems],
  );

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

  const archiveProduct = async (product: CatalogProduct) => {
    if (!window.confirm(`Archive ${product.itemName}? It will no longer be available for sale.`)) return;
    const response = await fetch(`/api/pos/products/manage?id=${product.id}`, { method: "DELETE" });
    const data = await response.json();
    if (response.ok && credentialId) {
      await loadCatalog(credentialId);
      setMessage("Product archived. You can restore it using the Active switch.");
      setMessageColor("green");
    } else {
      setMessage(data.error || t.common.error);
      setMessageColor("red");
    }
  };

  const filteredCatalog = catalog.filter((product) => {
    const query = search.trim().toLowerCase();
    return !query || product.itemCode.toLowerCase().includes(query) || product.itemName.toLowerCase().includes(query);
  });

  const openRestockProposal = async () => {
    if (!credentialId) return;
    setRestockOpened(true);
    setRestockProposal(null);
    setRestockSelected(new Set());
    setRestockLoading(true);
    setRestockError("");
    setRestockExportError("");
    try {
      const response = await fetch(`/api/pos/restock-proposal?credentialId=${credentialId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setRestockError(data.error || "Unable to generate the restock proposal.");
        return;
      }
      setRestockProposal(data);
      setRestockSelected(new Set(data.items.map((item: RestockProposalItem) => item.itemCode)));
    } catch {
      setRestockError("Unable to generate the restock proposal.");
    } finally {
      setRestockLoading(false);
    }
  };

  const toggleAllRestockItems = (checked: boolean) => {
    setRestockSelected(new Set(checked ? restockProposal?.items.map((item) => item.itemCode) ?? [] : []));
  };

  const printRestockProposal = () => {
    if (!restockProposal || selectedRestockItems.length === 0) return;
    setRestockExportError("");
    const escapeHtml = (value: string | number | null) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[character] || character);
    const proposer = restockProposal.proposer.name || restockProposal.proposer.email || "Administrator";
    const rows = selectedRestockItems.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.itemCode)}</td><td>${escapeHtml(item.itemName)}</td><td>${item.soldUnits}</td><td>${item.currentStock}</td><td>${item.heldQuantity}</td><td>${item.availableStock}</td><td>${item.proposedQuantity} ${escapeHtml(item.unit || "pcs")}</td><td>Rp ${item.buyPrice.toLocaleString("id-ID")}</td><td>Rp ${item.lineTotal.toLocaleString("id-ID")}</td></tr>`).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setRestockExportError("Allow pop-ups for this site, then try exporting the proposal again.");
      return;
    }
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>Restock Proposal</title><style>@page{size:landscape;margin:16mm}body{font-family:Arial,sans-serif;color:#111;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}h1{font-size:24px;margin:0 0 6px}.meta{text-align:right}.meta p,p{margin:4px 0;color:#444;font-size:12px}.summary{display:flex;gap:28px;margin:18px 0}.summary strong{display:block;font-size:18px;color:#111}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #aaa;padding:7px;text-align:left}th{background:#eee;text-transform:uppercase;font-size:9px}.number{text-align:right}.total{margin-top:16px;text-align:right;font-size:16px;font-weight:700}.signatures{display:flex;justify-content:space-between;margin-top:64px;text-align:center}.signature{width:220px;border-top:1px solid #222;padding-top:8px}</style></head><body><header><div><h1>RESTOCK PROPOSAL</h1><p>Inventory replenishment recommendation</p></div><div class="meta"><p>Generated: ${new Date(restockProposal.generatedAt).toLocaleString("id-ID")}</p><p>30-day sales analysis · ${restockProposal.targetCoverDays}-day target coverage</p></div></header><div class="summary"><div><strong>${selectedRestockItems.length}</strong><p>Product lines</p></div><div><strong>${restockUnits}</strong><p>Units proposed</p></div><div><strong>Rp ${restockTotal.toLocaleString("id-ID")}</strong><p>Estimated value</p></div></div><table><thead><tr><th>No.</th><th>Item code</th><th>Item name</th><th>Sold</th><th>Physical</th><th>Held</th><th>Available</th><th>Proposed</th><th>Buy price</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total proposal value: Rp ${restockTotal.toLocaleString("id-ID")}</div><div class="signatures"><div class="signature">Proposed by<br/><strong>${escapeHtml(proposer)}</strong></div><div class="signature">Approved by</div></div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
              <TextInput
                placeholder="Quick search by item code or name"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                w={260}
              />
              <Button
                variant="light"
                leftSection={<IconBarcode size={16} />}
                onClick={() => setScannerOpen(true)}
              >
                {t.dashboard.pos.scanProduct}
              </Button>
              <Button
                variant="light"
                color="teal"
                leftSection={<IconClipboardList size={16} />}
                onClick={() => void openRestockProposal()}
                loading={restockLoading}
              >
                Restock proposal
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
                {filteredCatalog.map((product) => (
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
                      <Switch
                        checked={product.isActive}
                        onChange={(event) => void updateProduct(product.id, { isActive: event.currentTarget.checked })}
                        aria-label={product.isActive ? "Archive product" : "Restore product"}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => void openHistory(product)}>
                          {t.dashboard.pos.history}
                        </Button>
                        {product.isActive ? (
                          <Button size="xs" color="orange" variant="subtle" leftSection={<IconArchive size={14} />} onClick={() => void archiveProduct(product)}>
                            Archive
                          </Button>
                        ) : (
                          <Badge color="gray" variant="light">Archived</Badge>
                        )}
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
        opened={restockOpened}
        onClose={() => { setRestockOpened(false); setRestockProposal(null); setRestockError(""); setRestockExportError(""); }}
        title={null}
        size="calc(100vw - 48px)"
        centered
        padding={0}
        styles={{
          content: { overflowX: "hidden", overflowY: "auto" },
          body: { padding: 0 },
        }}
      >
        <Box p={{ base: "lg", md: "xl" }} bg="var(--mantine-color-gray-0)" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Group align="flex-start" gap="md">
              <ThemeIcon size={48} radius="md" color="teal" variant="light">
                <IconClipboardList size={26} />
              </ThemeIcon>
              <Box>
                <Title order={2}>Restock proposal</Title>
                <Text c="dimmed" size="sm" mt={4}>
                  Review demand, available inventory, and estimated purchase cost before exporting.
                </Text>
              </Box>
            </Group>
            {restockProposal ? (
              <Box ta={{ base: "left", sm: "right" }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Generated</Text>
                <Text size="sm" fw={600}>{new Date(restockProposal.generatedAt).toLocaleString(isId ? "id-ID" : "en-US")}</Text>
                <Text size="xs" c="dimmed">{restockProposal.lookbackDays}-day sales · {restockProposal.targetCoverDays}-day coverage target</Text>
              </Box>
            ) : null}
          </Group>
        </Box>

        <Box p={{ base: "lg", md: "xl" }}>
          {restockLoading ? (
            <Center py={80}>
              <Stack align="center" gap="sm">
                <Loader color="teal" />
                <Text c="dimmed">Analyzing recent sales and available stock…</Text>
              </Stack>
            </Center>
          ) : restockError ? (
            <Alert color="red" title="Could not generate proposal">{restockError}</Alert>
          ) : restockProposal ? (
            <Stack gap="lg">
              {restockExportError ? (
                <Alert color="orange" title="PDF export was blocked" withCloseButton onClose={() => setRestockExportError("")}>
                  {restockExportError}
                </Alert>
              ) : null}

              <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Recommended products</Text>
                  <Text fz={28} fw={700} mt={4}>{restockProposal.items.length}</Text>
                  <Text size="xs" c="dimmed">Products below target coverage</Text>
                </Paper>
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Selected lines</Text>
                  <Text fz={28} fw={700} mt={4}>{selectedRestockItems.length}</Text>
                  <Text size="xs" c="dimmed">Included in the exported proposal</Text>
                </Paper>
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Units to order</Text>
                  <Text fz={28} fw={700} mt={4}>{restockUnits}</Text>
                  <Text size="xs" c="dimmed">Across selected product lines</Text>
                </Paper>
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Estimated value</Text>
                  <Text fz={24} fw={700} mt={7} c="teal.8">{formatMoney(restockTotal)}</Text>
                  <Text size="xs" c="dimmed">Based on current buy prices</Text>
                </Paper>
              </SimpleGrid>

              {restockProposal.items.length === 0 ? (
                <Alert color="teal" icon={<IconCheck size={18} />} title="Stock coverage looks healthy">
                  No active products need restocking based on sales from the previous {restockProposal.lookbackDays} days.
                </Alert>
              ) : (
                <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                  <Group justify="space-between" p="md" bg="var(--mantine-color-gray-0)" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
                    <Box>
                      <Text fw={700}>Recommended order lines</Text>
                      <Text size="xs" c="dimmed">Reserved stock is excluded from available inventory.</Text>
                    </Box>
                    <Checkbox
                      label="Select all"
                      checked={restockSelected.size === restockProposal.items.length}
                      indeterminate={restockSelected.size > 0 && restockSelected.size < restockProposal.items.length}
                      onChange={(event) => toggleAllRestockItems(event.currentTarget.checked)}
                    />
                  </Group>
                  <Table.ScrollContainer minWidth={1050} maxHeight={460}>
                    <Table verticalSpacing="sm" highlightOnHover stickyHeader>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th w={48}></Table.Th>
                          <Table.Th>Product</Table.Th>
                          <Table.Th ta="right">30-day sales</Table.Th>
                          <Table.Th ta="right">Physical</Table.Th>
                          <Table.Th ta="right">Held</Table.Th>
                          <Table.Th ta="right">Available</Table.Th>
                          <Table.Th ta="right">Proposed</Table.Th>
                          <Table.Th ta="right">Buy price</Table.Th>
                          <Table.Th ta="right">Subtotal</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {restockProposal.items.map((item) => {
                          const selected = restockSelected.has(item.itemCode);
                          return (
                            <Table.Tr key={item.itemCode} bg={selected ? "var(--mantine-color-teal-0)" : undefined}>
                              <Table.Td>
                                <Checkbox
                                  aria-label={`Include ${item.itemName}`}
                                  checked={selected}
                                  onChange={(event) => setRestockSelected((current) => {
                                    const next = new Set(current);
                                    if (event.currentTarget.checked) next.add(item.itemCode);
                                    else next.delete(item.itemCode);
                                    return next;
                                  })}
                                />
                              </Table.Td>
                              <Table.Td>
                                <Text fw={600} size="sm">{item.itemName}</Text>
                                <Text size="xs" c="dimmed">{item.itemCode} · {item.unit || "PCS"}</Text>
                              </Table.Td>
                              <Table.Td ta="right" fw={600}>{item.soldUnits}</Table.Td>
                              <Table.Td ta="right">{item.currentStock}</Table.Td>
                              <Table.Td ta="right"><Text c={item.heldQuantity > 0 ? "orange.7" : "dimmed"}>{item.heldQuantity}</Text></Table.Td>
                              <Table.Td ta="right" fw={600}>{item.availableStock}</Table.Td>
                              <Table.Td ta="right"><Badge color="teal" variant="light" size="lg">+{item.proposedQuantity} {item.unit || "PCS"}</Badge></Table.Td>
                              <Table.Td ta="right">{formatMoney(item.buyPrice)}</Table.Td>
                              <Table.Td ta="right" fw={700}>{formatMoney(item.lineTotal)}</Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
              )}

              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" align="center" wrap="wrap" gap="md">
                  <Box>
                    <Text size="sm" c="dimmed">Selected proposal total</Text>
                    <Text fz={24} fw={700}>{formatMoney(restockTotal)}</Text>
                    <Text size="xs" c="dimmed">{selectedRestockItems.length} lines · {restockUnits} units</Text>
                  </Box>
                  <Group>
                    <Button variant="default" onClick={() => setRestockOpened(false)}>Close</Button>
                    <Button
                      color="teal"
                      leftSection={<IconPrinter size={17} />}
                      onClick={printRestockProposal}
                      disabled={selectedRestockItems.length === 0}
                    >
                      Export / Print PDF
                    </Button>
                  </Group>
                </Group>
              </Paper>
            </Stack>
          ) : null}
        </Box>
      </Modal>

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
