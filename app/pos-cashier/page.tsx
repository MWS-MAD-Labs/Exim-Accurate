"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  rem,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCash,
  IconQrcode,
  IconScan,
  IconShoppingCart,
  IconTrash,
  IconKeyboard,
  IconUser,
  IconUserOff,
  IconWallet,
  IconPackageExport,
  IconClock,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { kioskNotificationsStore } from "../kiosk/kiosk-notifications";

import { createIdempotencyKey } from "@/lib/browser-id";
import { useLanguage } from "@/lib/language";
import { CameraScanner } from "@/components/CameraScanner";
import { parseReservationQrPayload } from "@/lib/reservation-qr";

interface Credential {
  id: string;
  appKey: string;
}

interface CatalogProduct {
  itemCode: string;
  itemName: string;
  stock: number;
  unitPrice: number;
  unitCost: number;
}

interface CartLine extends CatalogProduct {
  quantity: number;
}

interface Allowance {
  total: number;
  used: number;
  remaining: number;
  period: { startsAt: string; endsAt: string; isCustom: boolean };
}

interface PickupReservation {
  id: string;
  reference: string;
  staffEmail: string;
  staffName: string | null;
  warehouseName: string;
  status: "active" | "picked_up" | "cancelled" | "expired";
  expiresAt: string;
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    quantity: number;
    unitPrice: string;
  }>;
}

type PaymentMethod = "allowance" | "cash" | "qris";
type Step = "identify" | "shop" | "pay" | "done";

function parseStaffInfo(email: string) {
  const localPart = email.split("@")[0] || "";
  const parts = localPart.split(".");
  const capitalize = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : str;
  if (parts.length >= 2)
    return capitalize(parts[0]) + " " + capitalize(parts.slice(1).join(" "));
  return capitalize(parts[0]);
}

export default function PosCashierPage() {
  const { t, language } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("identify");

  const [buyerType, setBuyerType] = useState<"staff" | "guest" | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [allowance, setAllowance] = useState<Allowance | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [itemLookup, setItemLookup] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogProduct[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [suggestionNavigated, setSuggestionNavigated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [adjustmentNumber, setAdjustmentNumber] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [pickupOpened, setPickupOpened] = useState(false);
  const [pickupReservation, setPickupReservation] = useState<PickupReservation | null>(null);
  const [pickupPaymentMethod, setPickupPaymentMethod] = useState<PaymentMethod | null>(null);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupError, setPickupError] = useState("");
  const [scannerKey, setScannerKey] = useState(0);

  const badgeInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const checkoutButtonRef = useRef<HTMLButtonElement>(null);
  const cashButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const newTransactionButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void fetch("/api/credentials")
      .then((r) => r.json())
      .then((data) => {
        setCredentials(data);
        if (data.length === 1) setCredentialId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (step === "identify") badgeInputRef.current?.focus();
    if (step === "shop") itemInputRef.current?.focus();
    if (step === "pay") cashButtonRef.current?.focus();
    if (step === "done") newTransactionButtonRef.current?.focus();
  }, [step]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );

  const glassStyle = {
    background: "var(--cashier-panel)",
    backdropFilter: "blur(24px)",
    border: "1px solid var(--cashier-stroke)",
    borderRadius: rem(22),
    boxShadow: "0 24px 60px rgba(3, 8, 20, 0.5)",
  };
  const softPanelStyle = {
    background: "var(--cashier-panel-soft)",
    border: "1px solid var(--cashier-stroke)",
    borderRadius: rem(12),
  };
  const inputStyles = {
    label: { color: "rgba(255,255,255,0.78)", fontWeight: 600 },
    input: {
      background: "rgba(7, 12, 23, 0.82)",
      border: "1px solid var(--cashier-stroke)",
      color: "white",
    },
  };

  const notify = (opts: Parameters<typeof notifications.show>[0]) =>
    notifications.show(opts, kioskNotificationsStore);

  const identifyStaff = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !credentialId) return;
    setStaffEmail(trimmed);
    setStaffName(parseStaffInfo(trimmed));
    setBuyerType("staff");
    const response = await fetch(
      `/api/pos/allowance?credentialId=${credentialId}&email=${encodeURIComponent(trimmed)}`,
    );
    if (response.ok) setAllowance(await response.json());
    setStep("shop");
  };

  const startGuestCheckout = useCallback(() => {
    setBuyerType("guest");
    setStaffEmail("");
    setStaffName("");
    setAllowance(null);
    setStep("shop");
  }, []);

  const addProduct = useCallback((product: CatalogProduct) => {
    setItemLookup("");
    setSuggestions([]);
    setHighlightedSuggestion(0);
    setSuggestionNavigated(false);
    setCart((current) => {
      const existing = current.find(
        (line) => line.itemCode === product.itemCode,
      );
      if (existing) {
        return current.map((line) =>
          line.itemCode === product.itemCode
            ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) }
            : line,
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
    requestAnimationFrame(() => itemInputRef.current?.focus());
  }, []);

  const scanItem = useCallback(
    async (code: string) => {
      if (!credentialId || !code.trim()) return;
      const query = code.trim();
      const response = await fetch(
        `/api/pos/products?credentialId=${credentialId}&q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      const products: CatalogProduct[] = data.products || [];
      const exactMatch = products.find(
        (product) => product.itemCode.toLowerCase() === query.toLowerCase(),
      );
      const match =
        exactMatch || (products.length === 1 ? products[0] : undefined);
      if (!match) {
        notify({
          title: t.common.error,
          message: query,
          color: "red",
          autoClose: 2000,
        });
        return;
      }
      addProduct(match);
    },
    [addProduct, credentialId, t.common.error],
  );

  useEffect(() => {
    if (step !== "shop" || !credentialId || itemLookup.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const response = await fetch(
          `/api/pos/products?credentialId=${credentialId}&q=${encodeURIComponent(itemLookup.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions((data.products || []).slice(0, 8));
        setHighlightedSuggestion(0);
        setSuggestionNavigated(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [credentialId, itemLookup, step]);

  const updateQuantity = (itemCode: string, delta: number) =>
    setCart((current) =>
      current
        .map((line) =>
          line.itemCode === itemCode
            ? {
                ...line,
                quantity: Math.max(
                  0,
                  Math.min(line.quantity + delta, line.stock),
                ),
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );

  const removeItem = (itemCode: string) =>
    setCart((current) => current.filter((line) => line.itemCode !== itemCode));

  const canPayWithAllowance =
    buyerType === "staff" && !!allowance && allowance.remaining >= total;

  const submitSale = async () => {
    if (!credentialId || !paymentMethod || cart.length === 0 || submitting)
      return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          paymentMethod,
          idempotencyKey,
          buyerType: buyerType || "guest",
          staffEmail: buyerType === "staff" ? staffEmail : undefined,
          staffName: buyerType === "staff" ? staffName : undefined,
          items: cart.map(({ itemCode, quantity }) => ({ itemCode, quantity })),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setAdjustmentNumber(data.adjustmentNumber || null);
        setStep("done");
        notify({
          title: t.dashboard.pos.saleCompleted,
          message: data.adjustmentNumber || "",
          color: "green",
          autoClose: 3000,
        });
      } else {
        notify({
          title: t.common.error,
          message: data.error || t.common.error,
          color: "red",
          autoClose: 4000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openPickup = () => {
    setPickupReservation(null);
    setPickupPaymentMethod(null);
    setPickupError("");
    setScannerKey((current) => current + 1);
    setPickupOpened(true);
  };

  const lookupReservation = async (payload: string) => {
    const reservationId = parseReservationQrPayload(payload);
    if (!reservationId) {
      setPickupError("This code is not a staff preorder QR code.");
      setScannerKey((current) => current + 1);
      return;
    }
    setPickupLoading(true);
    setPickupError("");
    try {
      const response = await fetch(`/api/pos/reservations/${encodeURIComponent(reservationId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reservation not found");
      setPickupReservation(data);
      if (data.status !== "active") setPickupError(`This preorder is ${String(data.status).replace("_", " ")}.`);
    } catch (error) {
      setPickupReservation(null);
      setPickupError(error instanceof Error ? error.message : "Unable to load preorder");
      setScannerKey((current) => current + 1);
    } finally {
      setPickupLoading(false);
    }
  };

  const confirmPickup = async () => {
    if (!pickupReservation || !pickupPaymentMethod || pickupLoading) return;
    setPickupLoading(true);
    setPickupError("");
    try {
      const response = await fetch(`/api/pos/reservations/${pickupReservation.id}/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: pickupPaymentMethod }),
      });
      const data = await response.json();
      if (!response.ok && !data.sale) throw new Error(data.error || "Unable to confirm pickup");
      notify({
        title: "Preorder picked up",
        message: data.adjustmentNumber || pickupReservation.reference,
        color: data.error ? "orange" : "green",
        autoClose: 4000,
      });
      setPickupOpened(false);
      setPickupReservation(null);
      setPickupPaymentMethod(null);
    } catch (error) {
      setPickupError(error instanceof Error ? error.message : "Unable to confirm pickup");
    } finally {
      setPickupLoading(false);
    }
  };

  const startNewTransaction = useCallback(() => {
    setStep("identify");
    setBuyerType(null);
    setStaffEmail("");
    setStaffName("");
    setAllowance(null);
    setCart([]);
    setItemLookup("");
    setSuggestions([]);
    setPaymentMethod(null);
    setAdjustmentNumber(null);
    setIdempotencyKey(createIdempotencyKey());
  }, []);

  useEffect(() => {
    if (paymentMethod) submitButtonRef.current?.focus();
  }, [paymentMethod]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "F2" && step === "shop") {
        event.preventDefault();
        itemInputRef.current?.focus();
      } else if (event.key === "F4" && step === "shop" && cart.length > 0) {
        event.preventDefault();
        setStep("pay");
      } else if (
        event.altKey &&
        event.key.toLowerCase() === "g" &&
        step === "identify"
      ) {
        event.preventDefault();
        startGuestCheckout();
      } else if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNewTransaction();
      } else if (event.key === "F8" && step === "pay") {
        event.preventDefault();
        setPaymentMethod("cash");
      } else if (event.key === "F9" && step === "pay") {
        event.preventDefault();
        setPaymentMethod("qris");
      } else if (event.key === "F10" && step === "pay" && canPayWithAllowance) {
        event.preventDefault();
        setPaymentMethod("allowance");
      } else if (
        event.ctrlKey &&
        event.key === "Enter" &&
        step === "pay" &&
        paymentMethod
      ) {
        event.preventDefault();
        submitButtonRef.current?.click();
      } else if (event.key === "Escape" && step === "pay") {
        event.preventDefault();
        setStep("shop");
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    canPayWithAllowance,
    cart.length,
    paymentMethod,
    startGuestCheckout,
    startNewTransaction,
    step,
  ]);

  if (!credentialId) {
    return (
      <Center style={{ flex: 1 }} p="xl">
        <Stack align="center" gap="lg" maw={440} w="100%" p="xl" style={glassStyle}>
          <ThemeIcon
            size={72}
            radius="xl"
            variant="gradient"
            gradient={{ from: "cyan.4", to: "indigo.6", deg: 135 }}
            style={{ boxShadow: "0 0 28px rgba(56, 189, 248, 0.4)" }}
          >
            <IconShoppingCart size={34} />
          </ThemeIcon>
          <Title order={2} c="white" ta="center" className="pos-cashier-heading">
            {t.dashboard.pos.cashierTitle}
          </Title>
          <Select
            label={t.dashboard.pos.credential}
            data={credentials.map((credential) => ({
              value: credential.id,
              label: credential.appKey,
            }))}
            value={credentialId}
            onChange={setCredentialId}
            w="100%"
            styles={inputStyles}
          />
        </Stack>
      </Center>
    );
  }

  return (
    <Stack style={{ flex: 1, minHeight: "100vh" }} p={{ base: "md", md: "lg" }} gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ThemeIcon
            size={44}
            radius="md"
            variant="gradient"
            gradient={{ from: "cyan.4", to: "indigo.6", deg: 135 }}
            style={{ boxShadow: "0 0 22px rgba(56, 189, 248, 0.35)" }}
          >
            <IconShoppingCart size={24} />
          </ThemeIcon>
          <Title order={2} c="white" className="pos-cashier-heading">
            {t.dashboard.pos.cashierTitle}
          </Title>
        </Group>
        <Group gap="xs">
          <Badge
            variant="light"
            leftSection={<IconKeyboard size={13} />}
            style={{
              background: "rgba(56, 189, 248, 0.14)",
              color: "#bae6fd",
              border: "1px solid rgba(56, 189, 248, 0.28)",
            }}
          >
            F2 {language === "id" ? "Cari" : "Search"} · F4 Checkout · Alt+N{" "}
            {language === "id" ? "Baru" : "New"}
          </Badge>
          <Button
            variant="light"
            leftSection={<IconPackageExport size={17} />}
            onClick={openPickup}
          >
            Preorder pickup
          </Button>
          {step !== "identify" && (
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={startNewTransaction}
            >
              {t.dashboard.pos.newTransaction} (Alt+N)
            </Button>
          )}
        </Group>
      </Group>

      <Modal
        opened={pickupOpened}
        onClose={() => setPickupOpened(false)}
        title="Preorder pickup"
        size="lg"
        centered
      >
        <Stack gap="md">
          {!pickupReservation && !pickupLoading && (
            <>
              <Text size="sm" c="dimmed">Scan the QR code shown on the staff member&apos;s preorder page.</Text>
              <CameraScanner
                key={scannerKey}
                onScanSuccess={(value) => void lookupReservation(value)}
                qrbox={250}
              />
            </>
          )}
          {pickupLoading && !pickupReservation && <Center py="xl"><Loader /></Center>}
          {pickupError && <Text c="red" fw={600}>{pickupError}</Text>}
          {pickupReservation && (
            <Stack>
              <Card withBorder p="md">
                <Group justify="space-between" align="flex-start">
                  <Box>
                    <Text fw={800} size="lg">{pickupReservation.reference}</Text>
                    <Text size="sm" c="dimmed">{pickupReservation.staffName || pickupReservation.staffEmail}</Text>
                    <Text size="xs" c="dimmed">{pickupReservation.warehouseName}</Text>
                  </Box>
                  <Badge color={pickupReservation.status === "active" ? "green" : "gray"}>{pickupReservation.status.replace("_", " ")}</Badge>
                </Group>
                <Group gap="xs" mt="md"><IconClock size={16} /><Text size="sm">Expires {new Date(pickupReservation.expiresAt).toLocaleString()}</Text></Group>
                <Stack gap="xs" mt="md">
                  {pickupReservation.items.map((item) => (
                    <Group key={item.id} justify="space-between">
                      <Box><Text size="sm" fw={600}>{item.itemName}</Text><Text size="xs" c="dimmed">{item.itemCode}</Text></Box>
                      <Text size="sm">{item.quantity} × {Number(item.unitPrice).toLocaleString()}</Text>
                    </Group>
                  ))}
                </Stack>
                <Group justify="space-between" mt="md">
                  <Text fw={700}>Total</Text>
                  <Text fw={800} size="lg">{pickupReservation.items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0).toLocaleString()}</Text>
                </Group>
              </Card>
              {pickupReservation.status === "active" && (
                <>
                  <Text fw={600}>Payment method</Text>
                  <SimpleGrid cols={3}>
                    <Button variant={pickupPaymentMethod === "allowance" ? "filled" : "outline"} onClick={() => setPickupPaymentMethod("allowance")}>Allowance</Button>
                    <Button variant={pickupPaymentMethod === "cash" ? "filled" : "outline"} onClick={() => setPickupPaymentMethod("cash")}>Cash</Button>
                    <Button variant={pickupPaymentMethod === "qris" ? "filled" : "outline"} onClick={() => setPickupPaymentMethod("qris")}>QRIS</Button>
                  </SimpleGrid>
                  <Group grow>
                    <Button variant="subtle" onClick={() => { setPickupReservation(null); setPickupPaymentMethod(null); setPickupError(""); setScannerKey((current) => current + 1); }}>Scan another</Button>
                    <Button loading={pickupLoading} disabled={!pickupPaymentMethod} onClick={() => void confirmPickup()}>Confirm pickup</Button>
                  </Group>
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Modal>

      {step === "identify" && (
        <Stack
          maw={560}
          mx="auto"
          p="xl"
          style={{ ...glassStyle, width: "100%" }}
          gap="lg"
        >
          <Text ta="center" c="rgba(255,255,255,0.68)" size="lg">
            {t.dashboard.pos.identifyBuyer}
          </Text>
          <TextInput
            ref={badgeInputRef}
            label={t.dashboard.pos.staffEmail}
            placeholder="staff@company.com"
            value={staffEmail}
            onChange={(event) => setStaffEmail(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void identifyStaff(staffEmail);
            }}
            leftSection={<IconUser size={16} />}
            size="lg"
            styles={inputStyles}
          />
          <Group grow>
            <Button
              leftSection={<IconUser size={16} />}
              onClick={() => void identifyStaff(staffEmail)}
              disabled={!staffEmail.includes("@")}
            >
              {t.dashboard.pos.staffIdentified}
            </Button>
            <Button
              variant="outline"
              leftSection={<IconUserOff size={16} />}
              onClick={startGuestCheckout}
            >
              {t.dashboard.pos.guestCheckout} (Alt+G)
            </Button>
          </Group>
        </Stack>
      )}

      {step === "shop" && (
        <Group align="flex-start" grow style={{ flex: 1 }}>
          <Stack style={{ ...glassStyle, flex: 1, padding: rem(22) }}>
            <Box pos="relative">
              <TextInput
                ref={itemInputRef}
                label={`${t.dashboard.pos.scanItem} (F2)`}
                placeholder={
                  language === "id"
                    ? "Scan barcode atau ketik nama/kode produk..."
                    : "Scan a barcode or type a product name/code..."
                }
                value={itemLookup}
                onChange={(event) => setItemLookup(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && suggestions.length > 0) {
                    event.preventDefault();
                    setSuggestionNavigated(true);
                    setHighlightedSuggestion(
                      (current) => (current + 1) % suggestions.length,
                    );
                  } else if (
                    event.key === "ArrowUp" &&
                    suggestions.length > 0
                  ) {
                    event.preventDefault();
                    setSuggestionNavigated(true);
                    setHighlightedSuggestion(
                      (current) =>
                        (current - 1 + suggestions.length) % suggestions.length,
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const normalizedLookup = itemLookup.trim().toLowerCase();
                    const exactBarcodeMatch = suggestions.find(
                      (product) =>
                        product.itemCode.toLowerCase() === normalizedLookup,
                    );
                    const navigatedSuggestion = suggestionNavigated
                      ? suggestions[highlightedSuggestion]
                      : undefined;

                    if (exactBarcodeMatch) addProduct(exactBarcodeMatch);
                    else if (navigatedSuggestion)
                      addProduct(navigatedSuggestion);
                    else void scanItem(itemLookup);
                  } else if (event.key === "Escape") {
                    setSuggestions([]);
                  }
                }}
                leftSection={<IconScan size={16} />}
                rightSection={
                  suggestionsLoading ? <Text size="xs">...</Text> : null
                }
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="pos-product-suggestions"
                aria-activedescendant={
                  suggestions[highlightedSuggestion]
                    ? `pos-product-${highlightedSuggestion}`
                    : undefined
                }
                autoComplete="off"
                size="lg"
                styles={inputStyles}
              />
              {suggestions.length > 0 && (
                <Card
                  id="pos-product-suggestions"
                  role="listbox"
                  withBorder
                  p={4}
                  shadow="lg"
                  pos="absolute"
                  top="100%"
                  left={0}
                  right={0}
                  mt={4}
                  style={{ ...glassStyle, zIndex: 20, borderRadius: rem(12) }}
                >
                  <Stack gap={2}>
                    {suggestions.map((product, index) => (
                      <Box
                        id={`pos-product-${index}`}
                        key={product.itemCode}
                        role="option"
                        aria-selected={index === highlightedSuggestion}
                        px="sm"
                        py="xs"
                        style={{
                          borderRadius: 6,
                          cursor: "pointer",
                          background:
                            index === highlightedSuggestion
                              ? "rgba(56, 189, 248, 0.16)"
                              : "rgba(7, 12, 23, 0.5)",
                          border:
                            index === highlightedSuggestion
                              ? "1px solid rgba(56, 189, 248, 0.3)"
                              : "1px solid transparent",
                        }}
                        onMouseEnter={() => {
                          setHighlightedSuggestion(index);
                          setSuggestionNavigated(true);
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          addProduct(product);
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Box>
                            <Text size="sm" fw={600} c="white">
                              {product.itemName}
                            </Text>
                            <Text size="xs" c="rgba(255,255,255,0.55)">
                              {product.itemCode}
                            </Text>
                          </Box>
                          <Stack gap={0} align="flex-end">
                            <Text size="sm" c="white">
                              {product.unitPrice.toLocaleString()}
                            </Text>
                            <Text size="xs" c="rgba(255,255,255,0.55)">
                              Stock: {product.stock}
                            </Text>
                          </Stack>
                        </Group>
                      </Box>
                    ))}
                  </Stack>
                </Card>
              )}
            </Box>
            <Text size="xs" c="rgba(255,255,255,0.58)">
              {language === "id"
                ? "Gunakan ↑/↓ untuk memilih saran, Enter untuk menambahkan, dan F4 untuk checkout. Barcode scanner dapat langsung mengetik ke kolom ini."
                : "Use ↑/↓ to choose a suggestion, Enter to add it, and F4 to checkout. A barcode scanner can type directly into this field."}
            </Text>
          </Stack>

          <Stack style={{ flex: 1 }}>
            <Card p="lg" style={glassStyle}>
              <Group justify="space-between" mb="md">
                <Text fw={600} c="white" size="lg" className="pos-cashier-heading">
                  {t.dashboard.pos.cart}
                </Text>
                {buyerType === "staff" && (
                  <Badge color="blue">{staffName || staffEmail}</Badge>
                )}
                {buyerType === "guest" && (
                  <Badge color="gray">{t.dashboard.pos.guestCheckout}</Badge>
                )}
              </Group>
              <Stack gap="xs">
                {cart.map((line) => (
                  <Group
                    key={line.itemCode}
                    justify="space-between"
                    wrap="nowrap"
                    p="sm"
                    style={softPanelStyle}
                  >
                    <Box style={{ flex: 1 }}>
                      <Text size="sm" c="white" fw={500}>
                        {line.itemName}
                      </Text>
                      <Text size="xs" c="rgba(255,255,255,0.55)">
                        {line.unitPrice.toLocaleString()} x {line.quantity}
                      </Text>
                    </Box>
                    <Group gap={4}>
                      <ActionIcon
                        variant="subtle"
                        style={softPanelStyle}
                        onClick={() => updateQuantity(line.itemCode, -1)}
                      >
                        -
                      </ActionIcon>
                      <Text w={24} ta="center" c="white" fw={600}>
                        {line.quantity}
                      </Text>
                      <ActionIcon
                        variant="subtle"
                        style={softPanelStyle}
                        onClick={() => updateQuantity(line.itemCode, 1)}
                      >
                        +
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                        }}
                        onClick={() => removeItem(line.itemCode)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
                {cart.length === 0 && (
                  <Center mih={150}>
                    <Stack align="center" gap="sm">
                      <ThemeIcon
                        size={56}
                        radius="xl"
                        variant="light"
                        color="gray"
                        style={softPanelStyle}
                      >
                        <IconShoppingCart size={28} />
                      </ThemeIcon>
                      <Text c="rgba(255,255,255,0.55)" size="sm" ta="center">
                        {t.dashboard.pos.scanItem}
                      </Text>
                    </Stack>
                  </Center>
                )}
              </Stack>
              <Group justify="space-between" mt="md">
                <Text fw={700} c="rgba(255,255,255,0.75)">
                  {t.dashboard.pos.total}
                </Text>
                <Text fw={700} size="xl" c="white">
                  {total.toLocaleString()}
                </Text>
              </Group>
              <Button
                ref={checkoutButtonRef}
                mt="md"
                fullWidth
                disabled={cart.length === 0}
                onClick={() => setStep("pay")}
              >
                {t.dashboard.pos.checkout} (F4)
              </Button>
            </Card>

            {buyerType === "staff" && allowance && (
              <Card p="lg" style={glassStyle}>
                <Text fw={600} mb={8} c="white" className="pos-cashier-heading">
                  {t.dashboard.pos.allowanceBalance}
                </Text>
                <Group justify="space-between">
                  <Text size="sm" c="rgba(255,255,255,0.6)">
                    {t.dashboard.pos.allowanceRemaining}
                  </Text>
                  <Text fw={700} c="#7dd3fc">
                    {allowance.remaining.toLocaleString()}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="rgba(255,255,255,0.6)">
                    {t.dashboard.pos.allowanceUsed}
                  </Text>
                  <Text c="white">{allowance.used.toLocaleString()}</Text>
                </Group>
                <Text size="xs" c="rgba(255,255,255,0.5)" mt="sm">
                  {t.dashboard.pos.allowancePeriod}:{" "}
                  {allowance.period.startsAt.slice(0, 10)} –{" "}
                  {allowance.period.endsAt.slice(0, 10)}
                  {allowance.period.isCustom
                    ? ` (${t.dashboard.pos.customPeriod})`
                    : ""}
                </Text>
              </Card>
            )}
          </Stack>
        </Group>
      )}

      {step === "pay" && (
        <Stack
          maw={520}
          mx="auto"
          p="xl"
          style={{ ...glassStyle, width: "100%" }}
          gap="lg"
        >
          <Card
            p="lg"
            style={{
              ...softPanelStyle,
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
            }}
          >
            <Text fw={700} ta="center" size="32px" c="white">
              {total.toLocaleString()}
            </Text>
          </Card>
          <SimpleGrid cols={1} spacing="md">
            {buyerType === "staff" && (
              <Button
                size="lg"
                leftSection={<IconWallet size={18} />}
                variant={paymentMethod === "allowance" ? "filled" : "outline"}
                disabled={!canPayWithAllowance}
                onClick={() => setPaymentMethod("allowance")}
              >
                {t.dashboard.pos.payWithAllowance} (F10)
                {!canPayWithAllowance &&
                  ` (${t.dashboard.pos.insufficientAllowance})`}
              </Button>
            )}
            <Button
              ref={cashButtonRef}
              size="lg"
              leftSection={<IconCash size={18} />}
              variant={paymentMethod === "cash" ? "filled" : "outline"}
              onClick={() => setPaymentMethod("cash")}
            >
              {t.dashboard.pos.payWithCash} (F8)
            </Button>
            <Button
              size="lg"
              leftSection={<IconQrcode size={18} />}
              variant={paymentMethod === "qris" ? "filled" : "outline"}
              onClick={() => setPaymentMethod("qris")}
            >
              {t.dashboard.pos.payWithQris} (F9)
            </Button>
          </SimpleGrid>
          <Group grow>
            <Button variant="subtle" onClick={() => setStep("shop")}>
              {t.common.back}
            </Button>
            <Button
              ref={submitButtonRef}
              loading={submitting}
              disabled={!paymentMethod}
              onClick={() => void submitSale()}
            >
              {t.dashboard.pos.checkout} (Ctrl+Enter)
            </Button>
          </Group>
        </Stack>
      )}

      {step === "done" && (
        <Center style={{ flex: 1 }}>
          <Stack align="center" gap="lg" p="xl" maw={520} w="100%" style={glassStyle}>
            <ThemeIcon
              size={88}
              radius="xl"
              variant="gradient"
              gradient={{ from: "teal.4", to: "green.6", deg: 135 }}
              style={{ boxShadow: "0 0 30px rgba(52, 211, 153, 0.4)" }}
            >
              <IconShoppingCart size={36} />
            </ThemeIcon>
            <Title order={2} c="white" ta="center" className="pos-cashier-heading">
              {t.dashboard.pos.saleCompleted}
            </Title>
            {adjustmentNumber && (
              <Text c="rgba(255,255,255,0.65)" size="lg">
                {adjustmentNumber}
              </Text>
            )}
            <Button ref={newTransactionButtonRef} onClick={startNewTransaction}>
              {t.dashboard.pos.newTransaction} (Alt+N)
            </Button>
          </Stack>
        </Center>
      )}
    </Stack>
  );
}
