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

interface AccurateProduct {
  itemCode: string;
  itemName: string;
  stock: number;
}

interface CatalogProduct {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string | null;
  buyPrice: string;
  sellPrice: string;
  stockCache: number;
  isActive: boolean;
}

export default function PosStockManagementPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AccurateProduct[]>([]);
  const [selectedItem, setSelectedItem] = useState<AccurateProduct | null>(null);
  const [buyPrice, setBuyPrice] = useState<number | "">("");
  const [sellPrice, setSellPrice] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/credentials")
      .then((r) => r.json())
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

  const search = async () => {
    if (!credentialId) return;
    const response = await fetch(`/api/pos/products/manage/search?credentialId=${credentialId}&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setSearchResults(response.ok ? data.products || [] : []);
    setMessage(response.ok ? "" : data.error || t.dashboard.pos.noWarehouseConfigured);
  };

  const openAddModal = (item: AccurateProduct) => {
    setSelectedItem(item);
    setBuyPrice("");
    setSellPrice("");
    setModalOpen(true);
  };

  const saveProduct = async () => {
    if (!credentialId || !selectedItem || buyPrice === "" || sellPrice === "") return;
    setSaving(true);
    try {
      const response = await fetch("/api/pos/products/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          itemCode: selectedItem.itemCode,
          itemName: selectedItem.itemName,
          buyPrice,
          sellPrice,
          isActive: true,
        }),
      });
      if (response.ok) {
        setModalOpen(false);
        await loadCatalog(credentialId);
      } else {
        setMessage((await response.json()).error || t.common.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = async (id: string, updates: { buyPrice?: number; sellPrice?: number; isActive?: boolean }) => {
    const response = await fetch("/api/pos/products/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (response.ok && credentialId) await loadCatalog(credentialId);
  };

  const removeProduct = async (id: string) => {
    const response = await fetch(`/api/pos/products/manage?id=${id}`, { method: "DELETE" });
    if (response.ok && credentialId) await loadCatalog(credentialId);
  };

  const syncStock = async () => {
    if (!credentialId) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/pos/products/manage/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      if (response.ok) await loadCatalog(credentialId);
      else setMessage((await response.json()).error || t.common.error);
    } finally {
      setSyncing(false);
    }
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
                leftSection={<IconRefresh size={16} />}
                onClick={() => void syncStock()}
                loading={syncing}
              >
                {t.dashboard.pos.syncStock}
              </Button>
              <Button
                onClick={() => {
                  setModalOpen(true);
                  setSelectedItem(null);
                  setSearchResults([]);
                  setQuery("");
                }}
              >
                {t.dashboard.pos.addProduct}
              </Button>
            </Group>
          </Group>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.dashboard.pos.productCode}</Table.Th>
                <Table.Th>{t.dashboard.pos.productName}</Table.Th>
                <Table.Th>{t.dashboard.pos.stock}</Table.Th>
                <Table.Th>{t.dashboard.pos.buyPrice}</Table.Th>
                <Table.Th>{t.dashboard.pos.sellPrice}</Table.Th>
                <Table.Th>{t.dashboard.pos.active}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {catalog.map((product) => (
                <Table.Tr key={product.id}>
                  <Table.Td>{product.itemCode}</Table.Td>
                  <Table.Td>{product.itemName}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{product.stockCache}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={Number(product.buyPrice)}
                      min={0}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value)) void updateProduct(product.id, { buyPrice: value });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={Number(product.sellPrice)}
                      min={0}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value)) void updateProduct(product.id, { sellPrice: value });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={product.isActive}
                      onChange={(event) => void updateProduct(product.id, { isActive: event.currentTarget.checked })}
                    />
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
        </Paper>
      )}

      {message && <Text c="red">{message}</Text>}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={t.dashboard.pos.addProduct}>
        <Stack>
          {!selectedItem ? (
            <>
              <Group>
                <TextInput
                  placeholder={t.dashboard.pos.search}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button onClick={() => void search()}>{t.dashboard.pos.searchButton}</Button>
              </Group>
              <Table>
                <Table.Tbody>
                  {searchResults.map((item) => (
                    <Table.Tr key={item.itemCode}>
                      <Table.Td>{item.itemCode}</Table.Td>
                      <Table.Td>{item.itemName}</Table.Td>
                      <Table.Td>
                        <Button size="xs" onClick={() => openAddModal(item)}>
                          {t.dashboard.pos.add}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          ) : (
            <>
              <Text fw={600}>{selectedItem.itemName}</Text>
              <Text size="sm" c="dimmed">
                {selectedItem.itemCode}
              </Text>
              <NumberInput
                label={t.dashboard.pos.buyPrice}
                value={buyPrice}
                onChange={(value) => setBuyPrice(typeof value === "number" ? value : "")}
                min={0}
              />
              <NumberInput
                label={t.dashboard.pos.sellPrice}
                value={sellPrice}
                onChange={(value) => setSellPrice(typeof value === "number" ? value : "")}
                min={0}
              />
              <Button onClick={() => void saveProduct()} loading={saving} disabled={buyPrice === "" || sellPrice === ""}>
                {t.common.save}
              </Button>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
