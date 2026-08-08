"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconBox,
  IconCheck,
  IconClock,
  IconLogout,
  IconMinus,
  IconPlus,
  IconQrcode,
  IconSearch,
  IconShoppingBag,
  IconTrash,
} from "@tabler/icons-react";
import { signOut, useSession } from "next-auth/react";
import { createIdempotencyKey } from "@/lib/browser-id";
import { createReservationQrPayload } from "@/lib/reservation-qr";

interface StoreInfo {
  warehouseName: string;
  holdHours: number;
}

interface Product {
  itemCode: string;
  itemName: string;
  stock: number;
  unitPrice: number;
  unitCost: number;
}

interface ReservationItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
}

interface Reservation {
  id: string;
  credentialId: string;
  reference: string;
  warehouseName: string;
  status: "active" | "picked_up" | "cancelled" | "expired";
  expiresAt: string;
  pickupAt: string | null;
  createdAt: string;
  items: ReservationItem[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function QrTicket({ reservationId }: { reservationId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, createReservationQrPayload(reservationId), {
      width: 220,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, [reservationId]);

  return <canvas ref={canvasRef} aria-label="Preorder pickup QR code" />;
}

function statusMeta(status: Reservation["status"]) {
  if (status === "active") return { label: "Ready for pickup", color: "blue" };
  if (status === "picked_up") return { label: "Picked up", color: "green" };
  if (status === "cancelled") return { label: "Cancelled", color: "gray" };
  return { label: "Expired", color: "orange" };
}

export default function StorePage() {
  const { data: session } = useSession();
  const [cartOpened, cartHandlers] = useDisclosure(false);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [view, setView] = useState("catalog");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ color: string; text: string } | null>(null);

  const loadReservations = useCallback(async () => {
    const response = await fetch("/api/pos/reservations?mine=true");
    const data = await response.json();
    if (response.ok) setReservations(data);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/pos/products");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load available stock");
      setStore(data.store);
      setProducts(data.products || []);
    } catch (error) {
      setStore(null);
      setProducts([]);
      setMessage({ color: "red", text: error instanceof Error ? error.message : "Unable to load available stock" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadProducts(), loadReservations()]);
  }, [loadProducts, loadReservations]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) =>
      `${product.itemName} ${product.itemCode}`.toLowerCase().includes(normalized),
    );
  }, [products, query]);

  const cartLines = useMemo(
    () => products
      .filter((product) => (cart[product.itemCode] || 0) > 0)
      .map((product) => ({ ...product, quantity: cart[product.itemCode] })),
    [cart, products],
  );
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  const setQuantity = (product: Product, quantity: number) => {
    const safeQuantity = Math.max(0, Math.min(product.stock, Math.floor(quantity || 0)));
    setCart((current) => ({ ...current, [product.itemCode]: safeQuantity }));
  };

  const reserve = async () => {
    if (!store || !cartLines.length || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: createIdempotencyKey(),
          items: cartLines.map(({ itemCode, quantity }) => ({ itemCode, quantity })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create preorder");
      setCart({});
      cartHandlers.close();
      setView("orders");
      setMessage({ color: "green", text: `Preorder ${data.reference} created. Show its QR code at the cashier.` });
      await Promise.all([loadReservations(), loadProducts()]);
    } catch (error) {
      setMessage({ color: "red", text: error instanceof Error ? error.message : "Unable to create preorder" });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async (id: string) => {
    const response = await fetch("/api/pos/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel" }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ color: "red", text: data.error || "Unable to cancel preorder" });
      return;
    }
    setMessage({ color: "green", text: "Preorder cancelled and stock released." });
    await Promise.all([loadReservations(), loadProducts()]);
  };

  if (loading && !store && products.length === 0) {
    return <Box mih="100vh" display="flex" style={{ alignItems: "center", justifyContent: "center" }}><Loader /></Box>;
  }

  return (
    <AppShell header={{ height: 72 }} padding={0}>
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="sm">
              <ThemeIcon size={42} radius="xl" variant="gradient" gradient={{ from: "blue", to: "cyan" }}>
                <IconShoppingBag size={22} />
              </ThemeIcon>
              <Box>
                <Text fw={800} lh={1.1}>Staff Store</Text>
                <Text size="xs" c="dimmed">Preorder from available POS stock</Text>
              </Box>
            </Group>
            <Group gap="xs">
              <Text size="sm" c="dimmed" visibleFrom="sm">{session?.user?.email}</Text>
              <Button
                variant="light"
                leftSection={<IconShoppingBag size={17} />}
                onClick={cartHandlers.open}
              >
                Cart ({cartCount})
              </Button>
              <ActionIcon variant="subtle" size="lg" aria-label="Sign out" onClick={() => void signOut({ callbackUrl: "/login" })}>
                <IconLogout size={19} />
              </ActionIcon>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main bg="var(--mantine-color-gray-0)" mih="100vh">
        <Container size="xl" py={{ base: "md", sm: "xl" }}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Title order={1}>Preorder your items</Title>
                <Text c="dimmed">Select items, confirm your preorder, then show the QR code at pickup.</Text>
              </Box>
              {store && (
                <Badge variant="light" size="lg">
                  {store.warehouseName} · {store.holdHours}h hold
                </Badge>
              )}
            </Group>

            {message && (
              <Alert color={message.color} icon={message.color === "red" ? <IconAlertCircle size={18} /> : <IconCheck size={18} />} withCloseButton onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            )}

            <SegmentedControl
              value={view}
              onChange={setView}
              data={[
                { label: "Available stock", value: "catalog" },
                { label: `My preorders (${reservations.filter((order) => order.status === "active").length})`, value: "orders" },
              ]}
              fullWidth
            />

            {view === "catalog" && (
              <Stack gap="md">
                <Group align="end">
                  <TextInput
                    style={{ flex: 1 }}
                    leftSection={<IconSearch size={17} />}
                    placeholder="Search by item name or code"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                  />
                </Group>

                {loading ? <Loader mx="auto" my="xl" /> : filteredProducts.length === 0 ? (
                  <Paper withBorder p="xl" ta="center">
                    <ThemeIcon variant="light" color="gray" size={56} radius="xl" mb="sm"><IconBox size={28} /></ThemeIcon>
                    <Text fw={600}>No available items</Text>
                    <Text size="sm" c="dimmed">Try another search or check back after stock is replenished.</Text>
                  </Paper>
                ) : (
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
                    {filteredProducts.map((product) => {
                      const quantity = cart[product.itemCode] || 0;
                      return (
                        <Card key={product.itemCode} withBorder radius="lg" padding="lg">
                          <Stack h="100%" justify="space-between">
                            <Box>
                              <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <ThemeIcon variant="light" size={44} radius="md"><IconBox size={22} /></ThemeIcon>
                                <Badge color={product.stock > 5 ? "green" : "orange"} variant="light">{product.stock} available</Badge>
                              </Group>
                              <Text fw={700} size="lg" mt="md">{product.itemName}</Text>
                              <Text size="xs" c="dimmed">{product.itemCode}</Text>
                              <Text fw={700} c="blue" mt="sm">{formatMoney(product.unitPrice)}</Text>
                            </Box>
                            {quantity === 0 ? (
                              <Button fullWidth leftSection={<IconPlus size={17} />} onClick={() => setQuantity(product, 1)} disabled={product.stock === 0}>Add to preorder</Button>
                            ) : (
                              <Group justify="space-between">
                                <ActionIcon variant="light" size="lg" onClick={() => setQuantity(product, quantity - 1)}><IconMinus size={17} /></ActionIcon>
                                <Text fw={700}>{quantity}</Text>
                                <ActionIcon variant="light" size="lg" onClick={() => setQuantity(product, quantity + 1)} disabled={quantity >= product.stock}><IconPlus size={17} /></ActionIcon>
                              </Group>
                            )}
                          </Stack>
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                )}
              </Stack>
            )}

            {view === "orders" && (
              <Stack gap="md">
                {reservations.length === 0 ? (
                  <Paper withBorder p="xl" ta="center">
                    <IconQrcode size={42} color="var(--mantine-color-gray-5)" />
                    <Text fw={600} mt="sm">No preorders yet</Text>
                    <Button variant="light" mt="md" onClick={() => setView("catalog")}>Browse available stock</Button>
                  </Paper>
                ) : reservations.map((reservation) => {
                  const meta = statusMeta(reservation.status);
                  const total = reservation.items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
                  return (
                    <Card key={reservation.id} withBorder radius="lg" padding="lg">
                      <Group align="flex-start" justify="space-between">
                        <Box>
                          <Group gap="xs">
                            <Text fw={800}>{reservation.reference}</Text>
                            <Badge color={meta.color}>{meta.label}</Badge>
                          </Group>
                          <Text size="sm" c="dimmed">{reservation.warehouseName}</Text>
                        </Box>
                        <Text fw={700}>{formatMoney(total)}</Text>
                      </Group>
                      <Divider my="md" />
                      <SimpleGrid cols={{ base: 1, sm: reservation.status === "active" ? 2 : 1 }}>
                        <Stack gap="xs">
                          {reservation.items.map((item) => (
                            <Group key={item.id} justify="space-between" wrap="nowrap">
                              <Box><Text size="sm" fw={600}>{item.itemName}</Text><Text size="xs" c="dimmed">{item.itemCode}</Text></Box>
                              <Badge variant="light">× {item.quantity}</Badge>
                            </Group>
                          ))}
                          <Divider my="xs" />
                          <Group gap="xs"><IconClock size={16} /><Text size="sm">{reservation.status === "active" ? `Pickup before ${new Date(reservation.expiresAt).toLocaleString()}` : `Created ${new Date(reservation.createdAt).toLocaleString()}`}</Text></Group>
                          {reservation.status === "active" && (
                            <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={() => void cancelReservation(reservation.id)}>Cancel preorder</Button>
                          )}
                        </Stack>
                        {reservation.status === "active" && (
                          <Paper withBorder radius="md" p="md" ta="center" bg="white">
                            <QrTicket reservationId={reservation.id} />
                            <Text c="dark" fw={700}>Scan at POS cashier</Text>
                            <Text c="dimmed" size="xs">Keep this QR visible until pickup is confirmed.</Text>
                          </Paper>
                        )}
                      </SimpleGrid>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Container>
      </AppShell.Main>

      <Drawer opened={cartOpened} onClose={cartHandlers.close} title="Your preorder" position="right" size="md">
        <Stack h="calc(100vh - 90px)">
          <ScrollArea style={{ flex: 1 }}>
            <Stack>
              {cartLines.length === 0 ? <Text c="dimmed" ta="center" py="xl">Your preorder is empty.</Text> : cartLines.map((line) => (
                <Paper key={line.itemCode} withBorder p="sm" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ flex: 1 }}><Text fw={600} size="sm">{line.itemName}</Text><Text size="xs" c="dimmed">{formatMoney(line.unitPrice)} each</Text></Box>
                    <NumberInput w={82} min={0} max={line.stock} value={line.quantity} onChange={(value) => setQuantity(line, typeof value === "number" ? value : 0)} />
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
          <Divider />
          <Group justify="space-between"><Text fw={600}>Total</Text><Text fw={800} size="xl">{formatMoney(cartTotal)}</Text></Group>
          <Button size="lg" fullWidth loading={submitting} disabled={cartLines.length === 0} onClick={() => void reserve()}>Confirm preorder</Button>
          <Text size="xs" c="dimmed" ta="center">Confirming immediately locks the selected stock until the configured pickup deadline.</Text>
        </Stack>
      </Drawer>
    </AppShell>
  );
}
