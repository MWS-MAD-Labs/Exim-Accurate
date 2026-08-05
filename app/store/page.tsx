"use client";

import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { createIdempotencyKey } from "@/lib/browser-id";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
}

interface Product {
  itemCode: string;
  itemName: string;
  stock: number;
  unitPrice: number;
  unitCost: number;
}

export default function StorePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const response = await fetch("/api/credentials");
        const data = await response.json();
        if (response.ok) {
          setCredentials(data);
        } else {
          setMessage(data.error || t.common.error);
        }
      } catch {
        setMessage(t.common.error);
      }
    };

    void loadCredentials();
  }, [t.common.error]);

  const search = async () => {
    if (!credentialId) return;

    try {
      const response = await fetch(
        `/api/pos/products?credentialId=${credentialId}&q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      setProducts(data.products || []);
      setMessage(response.ok ? "" : data.error || t.dashboard.pos.setupRequired);
    } catch {
      setProducts([]);
      setMessage(t.common.error);
    }
  };

  const reserve = async () => {
    if (!credentialId || !expiresAt || submitting) return;

    const items = products
      .filter(
        (product) =>
          Number.isInteger(selected[product.itemCode]) &&
          selected[product.itemCode] > 0,
      )
      .map((product) => ({
        itemCode: product.itemCode,
        quantity: selected[product.itemCode],
      }));

    if (!items.length) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/pos/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          idempotencyKey: createIdempotencyKey(),
          expiresAt,
          items,
        }),
      });
      const data = await response.json();
      setMessage(
        response.ok
          ? `${t.dashboard.pos.reservationCreated}: ${data.reference}`
          : data.error || t.common.error,
      );
    } catch {
      setMessage(t.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack>
      <Title>{t.dashboard.pos.storeTitle}</Title>
      <Select
        label={t.dashboard.pos.credential}
        data={credentials.map((credential) => ({
          value: credential.id,
          label: credential.appKey,
        }))}
        value={credentialId}
        onChange={(value) => {
          setCredentialId(value);
          setProducts([]);
          setSelected({});
        }}
      />
      <Group>
        <TextInput
          label={t.dashboard.pos.search}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Button
          mt="xl"
          onClick={() => void search()}
          disabled={!credentialId}
        >
          {t.dashboard.pos.searchButton}
        </Button>
      </Group>
      <Text>{session?.user?.email}</Text>
      <TextInput
        label={t.dashboard.pos.pickupExpiry}
        type="datetime-local"
        value={expiresAt ? expiresAt.slice(0, 16) : ""}
        onChange={(event) =>
          setExpiresAt(
            event.currentTarget.value
              ? new Date(event.currentTarget.value).toISOString()
              : "",
          )
        }
      />
      <Paper withBorder p="md">
        <Table>
          <Table.Tbody>
            {products.map((product) => (
              <Table.Tr key={product.itemCode}>
                <Table.Td>{product.itemName}</Table.Td>
                <Table.Td>{product.stock}</Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    max={product.stock}
                    step={1}
                    value={selected[product.itemCode] || 0}
                    onChange={(value) =>
                      setSelected((current) => ({
                        ...current,
                        [product.itemCode]:
                          typeof value === "number" && Number.isInteger(value)
                            ? value
                            : 0,
                      }))
                    }
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Button
          mt="md"
          onClick={() => void reserve()}
          loading={submitting}
          disabled={!expiresAt || !credentialId || submitting}
        >
          {t.dashboard.pos.reserve}
        </Button>
        {message && <Text mt="sm">{message}</Text>}
      </Paper>
    </Stack>
  );
}
