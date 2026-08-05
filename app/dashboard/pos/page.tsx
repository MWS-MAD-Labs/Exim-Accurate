"use client";

import { Button, Group, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";

interface Credential { id: string; appKey: string; }
interface Product { itemCode: string; itemName: string; stock: number; unitPrice: number; unitCost: number; }
interface Cart extends Product { quantity: number; }

export default function PosPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    void fetch("/api/credentials").then((response) => response.json()).then(setCredentials);
  }, []);

  const changeCredential = (value: string | null) => {
    setCredentialId(value);
    setCart([]);
    setProducts([]);
    setMessage("");
    setIdempotencyKey(crypto.randomUUID());
  };

  const search = async () => {
    if (!credentialId) return;
    const response = await fetch(`/api/pos/products?credentialId=${credentialId}&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setProducts(data.products || []);
    setMessage(response.ok ? "" : data.error || t.dashboard.pos.setupRequired);
  };

  const add = (product: Product) => setCart((current) => {
    const existing = current.find((item) => item.itemCode === product.itemCode);
    return existing
      ? current.map((item) => item.itemCode === product.itemCode ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item)
      : [...current, { ...product, quantity: 1 }];
  });

  const checkout = async () => {
    if (!credentialId || submitting || !cart.length) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          paymentMethod: "cash",
          idempotencyKey,
          items: cart.map(({ itemCode, quantity }) => ({ itemCode, quantity })),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.adjustmentNumber ? `${t.dashboard.pos.saleCompleted}: ${data.adjustmentNumber}` : t.dashboard.pos.saleCompleted);
        setCart([]);
        setIdempotencyKey(crypto.randomUUID());
      } else {
        setMessage(data.error || t.common.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return <Stack>
    <Title>{t.dashboard.pos.cashierTitle}</Title>
    <Select label={t.dashboard.pos.credential} data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))} value={credentialId} onChange={changeCredential} />
    <Group>
      <TextInput placeholder={t.dashboard.pos.search} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      <Button onClick={() => void search()} disabled={!credentialId}>{t.dashboard.pos.searchButton}</Button>
    </Group>
    <Paper withBorder p="md">
      <Table><Table.Tbody>{products.map((product) => <Table.Tr key={product.itemCode}>
        <Table.Td>{product.itemCode}</Table.Td><Table.Td>{product.itemName}</Table.Td><Table.Td>{product.stock}</Table.Td>
        <Table.Td><Button size="xs" onClick={() => add(product)} disabled={product.stock < 1}>{t.dashboard.pos.add}</Button></Table.Td>
      </Table.Tr>)}</Table.Tbody></Table>
    </Paper>
    <Paper withBorder p="md">
      <Title order={3}>{t.dashboard.pos.cart}</Title>
      {cart.map((item) => <Group key={item.itemCode} justify="space-between">
        <Text>{item.itemName}</Text>
        <NumberInput min={1} max={item.stock} step={1} value={item.quantity} onChange={(value) => setCart((current) => current.map((currentItem) => currentItem.itemCode === item.itemCode ? { ...currentItem, quantity: typeof value === "number" && Number.isInteger(value) ? value : currentItem.quantity } : currentItem))} />
      </Group>)}
      <Button mt="md" onClick={() => void checkout()} loading={submitting} disabled={!cart.length || !credentialId || submitting}>{t.dashboard.pos.checkout}</Button>
      {message && <Text mt="sm">{message}</Text>}
    </Paper>
  </Stack>;
}
