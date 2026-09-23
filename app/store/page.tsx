"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Accordion,
  ActionIcon,
  Select,
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
  Radio,
  Checkbox,
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
  IconCash,
  IconLogout,
  IconMinus,
  IconPlus,
  IconQrcode,
  IconSearch,
  IconShoppingBag,
  IconTrash,
  IconWallet,
  IconHistory,
  IconRefresh,
} from "@tabler/icons-react";
import { signOut, useSession } from "next-auth/react";
import { createIdempotencyKey } from "@/lib/browser-id";
import { createReservationQrPayload } from "@/lib/reservation-qr";
import { useLanguage } from "@/lib/language";

interface StoreInfo {
  warehouseName: string;
  holdHours: number;
}

interface Allowance {
  total: number;
  used: number;
  remaining: number;
  period: { startsAt: string; endsAt: string; isCustom: boolean };
  previousDebt: {
    hasOutstanding: boolean;
    blocked: boolean;
    overdue: boolean;
    outstanding: number;
    payday: string;
  };
}

type PaymentMethod = "allowance" | "cash" | "qris";
type PaymentChoice = "cash" | "qris" | "allowance_first_cash" | "allowance_first_qris" | "allowance_full" | "allowance_debt";

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
  preferredPaymentMethod: PaymentMethod;
  paymentStrategy: "external_only" | "allowance_then_external" | "allowance_debt";
  externalPaymentMethod: "cash" | "qris" | null;
  approvedResultingDebt: string | null;
  items: ReservationItem[];
}

interface Transaction {
  id: string;
  createdAt: string;
  warehouseName: string;
  reservationReference: string | null;
  total: string;
  allowanceUsed: string;
  allowanceBalanceAfter: string | null;
  paymentMethod: string;
  payments: { method: string; amount: string }[];
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
  const { t } = useLanguage();
  const [cartOpened, cartHandlers] = useDisclosure(false);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyGeneration = useRef(0);
  const historyPending = useRef(false);
  const failedHistoryCursor = useRef<string | undefined>(undefined);
  const [ordersError, setOrdersError] = useState("");
  const [orderFilter, setOrderFilter] = useState<string | null>("active");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [view, setView] = useState("catalog");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice | null>(null);
  const [debtConfirmed, setDebtConfirmed] = useState(false);

  const [message, setMessage] = useState<{ color: string; text: string } | null>(null);

  const loadReservations = useCallback(async () => {
    setOrdersError("");
    try {
      const response = await fetch("/api/pos/reservations?mine=true", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load pickup tickets");
      setReservations(data);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Unable to load pickup tickets");
    }
  }, []);

  const loadHistory = useCallback(async (cursor?: string) => {
    if (cursor && historyPending.current) return;
    const generation = ++historyGeneration.current;
    historyPending.current = true;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/pos/my-transactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load transactions");
      if (generation !== historyGeneration.current) return;
      setTransactions((current) => cursor ? [...current, ...data.transactions] : data.transactions);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if (generation !== historyGeneration.current) return;
      failedHistoryCursor.current = cursor;
      setHistoryError(error instanceof Error ? error.message : "Unable to load transactions");
    } finally {
      if (generation === historyGeneration.current) {
        historyPending.current = false;
        setHistoryLoading(false);
      }
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/pos/products");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load available stock");
      setStore(data.store);
      setAllowance(data.allowance || null);
      setProducts(data.products || []);
    } catch (error) {
      setStore(null);
      setAllowance(null);
      setProducts([]);
      setMessage({ color: "red", text: error instanceof Error ? error.message : "Unable to load available stock" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadProducts(), loadReservations(), loadHistory()]);
  }, [loadProducts, loadReservations, loadHistory]);

  useEffect(() => {
    const refresh = () => { void Promise.all([loadProducts(), loadReservations(), loadHistory()]); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadProducts, loadReservations, loadHistory]);

  const filteredProducts = useMemo(() => {
    const inStockProducts = products.filter((product) => product.stock > 0);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return inStockProducts;
    return inStockProducts.filter((product) =>
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
  const allowanceAvailable = !!allowance && !allowance.previousDebt.blocked && allowance.remaining > 0 && cartTotal > 0;
  const allowanceCoversCart = allowanceAvailable && allowance.remaining >= cartTotal;
  const amountOverAllowance = Math.max(0, cartTotal - (allowance?.remaining ?? 0));
  const debtAvailable = !!allowance && !allowance.previousDebt.blocked && cartTotal > 0 && !allowanceCoversCart;
  const blockedDebtMessage = allowance?.previousDebt.blocked
    ? t.dashboard.pos.debtBlockedAlert.replace("{amount}", formatMoney(allowance.previousDebt.outstanding))
    : "";
  const activeOrders = reservations.filter((order) => order.status === "active");
  const visibleOrders = reservations.filter((order) => orderFilter === "all" || order.status === orderFilter);

  const availablePaymentMethods: PaymentChoice[] = allowanceCoversCart
    ? ["allowance_full", "cash", "qris"]
    : allowanceAvailable
      ? ["allowance_first_cash", "allowance_first_qris", "cash", "qris"]
      : ["cash", "qris"];
  if (debtAvailable) availablePaymentMethods.push("allowance_debt");
  const validPaymentMethod = paymentMethod && availablePaymentMethods.includes(paymentMethod) ? paymentMethod : null;

  useEffect(() => { setDebtConfirmed(false); }, [cartTotal, allowance?.remaining, paymentMethod, debtAvailable]);

  useEffect(() => {
    setPaymentMethod((current) => {
      if (current === "cash" || current === "qris") return current;
      if (current === "allowance_debt" && debtAvailable) return current;
      if (allowanceCoversCart) return "allowance_full";
      if (allowanceAvailable) return current === "allowance_first_qris" ? current : "allowance_first_cash";
      return null;
    });
  }, [allowanceAvailable, allowanceCoversCart, debtAvailable]);

  const setQuantity = (product: Product, quantity: number) => {
    const safeQuantity = Math.max(0, Math.min(product.stock, Math.floor(quantity || 0)));
    setCart((current) => ({ ...current, [product.itemCode]: safeQuantity }));
  };

  const reserve = async () => {
    if (!store || !cartLines.length || !validPaymentMethod || allowance?.previousDebt.blocked || (validPaymentMethod === "allowance_debt" && !debtConfirmed) || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: createIdempotencyKey(),
          payment: validPaymentMethod === "cash" || validPaymentMethod === "qris"
            ? { strategy: "external_only", method: validPaymentMethod }
            : validPaymentMethod === "allowance_full" || validPaymentMethod === "allowance_debt"
              // Full allowance authorizes no debt; debt checkout requires explicit approval.
              ? { strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt: validPaymentMethod === "allowance_full" ? "0.00" : amountOverAllowance.toFixed(2) }
              : { strategy: "allowance_then_external", remainderMethod: validPaymentMethod === "allowance_first_qris" ? "qris" : "cash", expectedAllowanceAmount: Math.min(cartTotal, Math.max(0, allowance?.remaining ?? 0)).toFixed(2) },
          items: cartLines.map(({ itemCode, quantity }) => ({ itemCode, quantity })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (["RESERVATION_PAYMENT_CHANGED", "ALLOWANCE_CHANGED", "ALLOWANCE_DEBT_CHANGED", "ALLOWANCE_UNAVAILABLE"].includes(data.code)) {
          setDebtConfirmed(false);
          await loadProducts();
        }
        throw new Error(data.error || "Unable to create preorder");
      }
      setCart({});
      setPaymentMethod(null);
      setDebtConfirmed(false);
      cartHandlers.close();
      setView("orders");
      setOrderFilter("active");
      setMessage({ color: "green", text: `Preorder ${data.reference} created. Show its QR code at the cashier.` });
      await Promise.all([loadReservations(), loadProducts()]);
    } catch (error) {
      setMessage({ color: "red", text: error instanceof Error ? error.message : "Unable to create preorder" });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async (id: string) => {
    if (cancellingId || !window.confirm("Cancel this preorder and release its reserved items?")) return;
    setCancellingId(id);
    try {
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
    } catch (error) {
      setMessage({ color: "red", text: error instanceof Error ? error.message : "Unable to cancel preorder" });
    } finally {
      setCancellingId(null);
    }
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

      <AppShell.Main bg="var(--mantine-color-body)" mih="100vh">
        <Container size="xl" py={{ base: "md", sm: "xl" }}>
          <Stack gap="lg">

            {message && (
              <Alert color={message.color} icon={message.color === "red" ? <IconAlertCircle size={18} /> : <IconCheck size={18} />} withCloseButton onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            )}

            <Paper withBorder radius="md" px="md" py="sm">
              <Group justify="space-between" gap="xs">
                <Group gap="xs"><IconWallet size={18} /><Text size="sm" fw={600}>Remaining allowance</Text></Group>
                <Text size="lg" fw={800} c={allowance && allowance.remaining < 0 ? "red" : "blue"}>{allowance ? formatMoney(allowance.remaining) : "Unavailable"}</Text>
              </Group>
            </Paper>

            {allowance?.previousDebt.hasOutstanding && <Alert color={allowance.previousDebt.blocked ? "red" : "orange"} icon={<IconAlertCircle size={18} />} title="Previous-period balance due">
              {formatMoney(allowance.previousDebt.outstanding)} · Due {new Date(allowance.previousDebt.payday).toLocaleDateString()}. {allowance.previousDebt.blocked ? blockedDebtMessage : "Please settle this balance at POS by payday."}
            </Alert>}

            <Group justify="space-between">
              <Text size="xs" c="dimmed">Balances are checked again at pickup.</Text>
              <Button size="xs" variant="subtle" leftSection={<IconRefresh size={15} />} loading={loading || historyLoading} onClick={() => void Promise.all([loadProducts(), loadReservations(), loadHistory()])}>Refresh account</Button>
            </Group>
            <SegmentedControl
              value={view}
              onChange={setView}
              data={[
                { label: "Shop", value: "catalog" },
                { label: `Pickup (${activeOrders.length})`, value: "orders" },
                { label: "History", value: "history" },
              ]}
              fullWidth
            />

            {view === "catalog" && (
              <Stack gap="md">
                <Group align="end">
                  <TextInput
                    style={{ flex: 1 }}
                    leftSection={<IconSearch size={17} />}
                    aria-label="Search products"
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
                                <ActionIcon aria-label={`Remove one ${product.itemName}`} variant="light" size="lg" onClick={() => setQuantity(product, quantity - 1)}><IconMinus size={17} /></ActionIcon>
                                <Text fw={700}>{quantity}</Text>
                                <ActionIcon aria-label={`Add one ${product.itemName}`} variant="light" size="lg" onClick={() => setQuantity(product, quantity + 1)} disabled={quantity >= product.stock}><IconPlus size={17} /></ActionIcon>
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
                <Group justify="space-between"><Box><Title order={2}>Pickup tickets</Title><Text size="sm" c="dimmed">Your selected payment is saved. The cashier only confirms or cancels pickup.</Text></Box><Select aria-label="Filter preorders by status" value={orderFilter} onChange={setOrderFilter} allowDeselect={false} data={[{ value: "active", label: "Ready for pickup" }, { value: "picked_up", label: "Picked up" }, { value: "cancelled", label: "Cancelled" }, { value: "expired", label: "Expired" }, { value: "all", label: "All preorders" }]} /></Group>
                {ordersError && <Alert color="red">{ordersError}<Button variant="subtle" onClick={() => void loadReservations()}>Retry</Button></Alert>}
                {!ordersError && visibleOrders.length === 0 ? (
                  <Paper withBorder p="xl" ta="center">
                    <IconQrcode size={42} color="var(--mantine-color-gray-5)" />
                    <Text fw={600} mt="sm">No preorders in this view</Text>
                    <Button variant="light" mt="md" onClick={() => setView("catalog")}>Browse available stock</Button>
                  </Paper>
                ) : visibleOrders.map((reservation) => {
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
                          <Text size="xs" c="dimmed">Payment: {reservation.paymentStrategy === "allowance_debt" ? (reservation.approvedResultingDebt !== null && Number(reservation.approvedResultingDebt) === 0 ? "Full Allowance" : "Allowance debt") : reservation.paymentStrategy === "allowance_then_external" ? `Allowance first + ${reservation.externalPaymentMethod === "qris" ? "QRIS" : "Cash"}` : reservation.externalPaymentMethod === "qris" ? "QRIS" : "Cash"}</Text>
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
                            <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} loading={cancellingId === reservation.id} disabled={!!cancellingId && cancellingId !== reservation.id} onClick={() => void cancelReservation(reservation.id)}>Cancel preorder</Button>
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

            {view === "history" && <Stack gap="md">
              <Box><Title order={2}>Transaction history</Title><Text c="dimmed" size="sm">Completed store pickups and purchases at POS, newest first. Cancelled and expired preorders are in Pickup.</Text></Box>
              {historyError && <Alert color="red" title="Could not load transactions">{historyError}<Button variant="subtle" onClick={() => void loadHistory(failedHistoryCursor.current)}>Retry</Button></Alert>}
              {!historyLoading && !historyError && transactions.length === 0 && <Paper withBorder radius="lg" p="xl" ta="center"><IconHistory size={40} /><Text fw={600} mt="sm">No purchases yet</Text><Text c="dimmed" size="sm">Your purchases will appear here after checkout at POS or confirmed pickup.</Text><Button mt="md" variant="light" onClick={() => setView("catalog")}>Start shopping</Button></Paper>}
              <Accordion variant="separated" radius="md">
                {transactions.map((transaction) => <Accordion.Item key={transaction.id} value={transaction.id}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="wrap" pr="sm">
                      <Box><Text fw={700}>{transaction.reservationReference || `POS purchase · ${transaction.id}`}</Text><Text size="xs" c="dimmed">{new Date(transaction.createdAt).toLocaleString()} · {transaction.warehouseName}</Text><Text size="sm" lineClamp={1}>{transaction.items.map((item) => `${item.quantity} × ${item.itemName}`).join(", ")}</Text></Box>
                      <Box><Text fw={800}>{formatMoney(Number(transaction.total))}</Text><Text size="xs" c="dimmed">View details</Text></Box>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel><Stack gap="xs">
                    {transaction.items.map((item) => <Group key={item.id} justify="space-between"><Box><Text size="sm" fw={600}>{item.itemName}</Text><Text size="xs" c="dimmed">{item.quantity} × {formatMoney(Number(item.unitPrice))}</Text></Box><Text size="sm">{formatMoney(item.quantity * Number(item.unitPrice))}</Text></Group>)}
                    <Divider my="xs" label="Payment details" />
                    {transaction.payments.length ? transaction.payments.map((payment, index) => <Group key={index} justify="space-between"><Text size="sm" tt="capitalize">{payment.method === "qris" ? "QRIS" : payment.method.replaceAll("_", " ")}</Text><Text size="sm">{formatMoney(Number(payment.amount))}</Text></Group>) : <Text size="sm">{transaction.paymentMethod.toUpperCase()}</Text>}
                    <Group justify="space-between"><Text size="sm">Allowance used</Text><Text size="sm">{formatMoney(Number(transaction.allowanceUsed))}</Text></Group>
                    {transaction.allowanceBalanceAfter !== null && <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)"><Group justify="space-between"><Text size="sm" fw={600}>Balance after this purchase</Text><Text fw={700}>{formatMoney(Number(transaction.allowanceBalanceAfter))}</Text></Group><Text size="xs" c="dimmed">Historical balance, not your current remaining allowance.</Text></Paper>}
                  </Stack></Accordion.Panel>
                </Accordion.Item>)}
              </Accordion>
              {historyLoading && <Loader mx="auto" aria-label="Loading transactions" />}
              {nextCursor && !historyError && <Button variant="light" loading={historyLoading} onClick={() => void loadHistory(nextCursor)}>Load older transactions</Button>}
            </Stack>}
            {cartCount > 0 && view === "catalog" && <Paper withBorder shadow="md" radius="lg" p="md" style={{ position: "sticky", bottom: 16, zIndex: 5 }}><Group justify="space-between"><Box><Text fw={700}>{cartCount} items · {formatMoney(cartTotal)}</Text><Text size="xs" c="dimmed">Choose your payment and reserve for pickup</Text></Box><Button onClick={cartHandlers.open}>Review cart</Button></Group></Paper>}
          </Stack>
        </Container>
      </AppShell.Main>

      <Drawer opened={cartOpened} onClose={cartHandlers.close} title="Your preorder" position="right" size="md">
        <Stack>
          {message?.color === "red" && <Alert color="red" role="alert" icon={<IconAlertCircle size={18} />}>{message.text}</Alert>}
          <ScrollArea.Autosize mah="35vh" type="auto">
            <Stack>
              {cartLines.length === 0 ? <Text c="dimmed" ta="center" py="xl">Your preorder is empty.</Text> : cartLines.map((line) => (
                <Paper key={line.itemCode} withBorder p="sm" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ flex: 1 }}><Text fw={600} size="sm">{line.itemName}</Text><Text size="xs" c="dimmed">{formatMoney(line.unitPrice)} each</Text></Box>
                    <NumberInput aria-label={`Quantity for ${line.itemName}`} w={82} min={0} max={line.stock} value={line.quantity} onChange={(value) => setQuantity(line, typeof value === "number" ? value : 0)} />
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          <Divider />
          <Group justify="space-between"><Text fw={600}>Total</Text><Text fw={800} size="xl">{formatMoney(cartTotal)}</Text></Group>
          {allowance?.previousDebt.hasOutstanding && (
            <Alert color={allowance.previousDebt.blocked ? "red" : "orange"} icon={<IconAlertCircle size={18} />}>
              {allowance.previousDebt.blocked
                ? blockedDebtMessage
                : t.dashboard.pos.debtDueByPaydayAlert
                    .replace("{amount}", formatMoney(allowance.previousDebt.outstanding))
                    .replace("{payday}", new Date(allowance.previousDebt.payday).toLocaleDateString())}
            </Alert>
          )}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <Group gap="sm">
                <ThemeIcon variant="light" color={allowanceCoversCart ? "green" : "orange"}><IconWallet size={18} /></ThemeIcon>
                <Box>
                  <Text fw={700}>Staff allowance balance</Text>
                  <Text size="xs" c="dimmed">
                    {allowance ? `${new Date(allowance.period.startsAt).toLocaleDateString()} – ${new Date(allowance.period.endsAt).toLocaleDateString()}` : "Balance unavailable"}
                  </Text>
                </Box>
              </Group>
              <Text fw={800} c={allowanceCoversCart ? "green" : "orange"}>{allowance ? formatMoney(allowance.remaining) : "—"}</Text>
            </Group>
            {allowance && (
              <Group justify="space-between" mt="sm">
                <Text size="xs" c="dimmed">Used {formatMoney(allowance.used)} of {formatMoney(allowance.total)}</Text>
                {allowanceCoversCart ? (
                  <Text size="xs" c="green" fw={600}>{formatMoney(allowance.remaining - cartTotal)} remaining after pickup</Text>
                ) : (
                  <Text size="xs" c="orange" fw={600}>Short by {formatMoney(amountOverAllowance)}</Text>
                )}
              </Group>
            )}
          </Paper>
          <Stack gap="xs">
            <Alert color="blue" icon={<IconWallet size={18} />}>Your payment choice is saved for pickup. Full Allowance requires enough balance at pickup; split payments recalculate the Cash/QRIS remainder using your available allowance. Debt payments cannot exceed the resulting debt you approve.</Alert>
            <Radio.Group value={validPaymentMethod || ""} onChange={(value) => setPaymentMethod(value as PaymentChoice)} label="How would you like to pay?">
              <Stack mt="xs" gap="xs">
                {allowanceCoversCart && <Radio value="allowance_full" label={<Group gap="xs"><IconWallet size={16} />Full Allowance</Group>} />}
                {allowanceAvailable && !allowanceCoversCart && <Radio value="allowance_first_cash" label={<Group gap="xs"><IconWallet size={16} />Allowance {formatMoney(Math.min(cartTotal, allowance?.remaining ?? 0))} + Cash {formatMoney(Math.max(0, cartTotal - (allowance?.remaining ?? 0)))}</Group>} />}
                {allowanceAvailable && !allowanceCoversCart && <Radio value="allowance_first_qris" label={<Group gap="xs"><IconWallet size={16} />Allowance {formatMoney(Math.min(cartTotal, allowance?.remaining ?? 0))} + QRIS {formatMoney(Math.max(0, cartTotal - (allowance?.remaining ?? 0)))}</Group>} />}
                <Radio value="cash" label={<Group gap="xs"><IconCash size={16} />Full Cash</Group>} />
                <Radio value="qris" label={<Group gap="xs"><IconQrcode size={16} />Full QRIS</Group>} />
                {debtAvailable && <Radio value="allowance_debt" label={<Group gap="xs"><IconAlertCircle size={16} />{allowanceAvailable ? `Allowance ${formatMoney(allowance!.remaining)} + Debt ${formatMoney(amountOverAllowance)}` : `Full Debt — resulting debt ${formatMoney(amountOverAllowance)}`}</Group>} />}
              </Stack>
            </Radio.Group>
            {validPaymentMethod === "allowance_debt" && allowance && (
              <Alert color="orange">
                <Stack gap="xs">
                  <Text size="sm">Estimated balance after pickup: {formatMoney(allowance.remaining - cartTotal)}. The resulting debt includes any existing current-period debt.</Text>
                  <Checkbox checked={debtConfirmed} onChange={(event) => setDebtConfirmed(event.currentTarget.checked)} label={`I approve a resulting allowance debt of up to ${formatMoney(amountOverAllowance)}`} />
                </Stack>
              </Alert>
            )}
          </Stack>
          <Button size="lg" fullWidth loading={submitting} disabled={cartLines.length === 0 || !validPaymentMethod || allowance?.previousDebt.blocked || (validPaymentMethod === "allowance_debt" && !debtConfirmed)} onClick={() => void reserve()}>Confirm preorder</Button>
          <Text size="xs" c="dimmed" ta="center">Confirming locks stock only. It does not reserve or consume allowance until pickup.</Text>
        </Stack>
      </Drawer>
    </AppShell>
  );
}
