"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCash,
  IconQrcode,
  IconScan,
  IconShoppingCart,
  IconTrash,
  IconUser,
  IconUserOff,
  IconWallet,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { kioskNotificationsStore } from "../kiosk/kiosk-notifications";
import { PersistentScanner } from "@/components/PersistentScanner";
import { createIdempotencyKey } from "@/lib/browser-id";
import { useLanguage } from "@/lib/language";

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

type PaymentMethod = "allowance" | "cash" | "qris";
type Step = "identify" | "shop" | "pay" | "done";

function parseStaffInfo(email: string) {
  const localPart = email.split("@")[0] || "";
  const parts = localPart.split(".");
  const capitalize = (str: string) => (str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : str);
  if (parts.length >= 2) return capitalize(parts[0]) + " " + capitalize(parts.slice(1).join(" "));
  return capitalize(parts[0]);
}

export default function PosCashierPage() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("identify");

  const [buyerType, setBuyerType] = useState<"staff" | "guest" | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [allowance, setAllowance] = useState<Allowance | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [itemLookup, setItemLookup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [adjustmentNumber, setAdjustmentNumber] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);

  const badgeInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

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
  }, [step]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );

  const notify = (opts: Parameters<typeof notifications.show>[0]) =>
    notifications.show(opts, kioskNotificationsStore);

  const identifyStaff = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !credentialId) return;
    setStaffEmail(trimmed);
    setStaffName(parseStaffInfo(trimmed));
    setBuyerType("staff");
    const response = await fetch(`/api/pos/allowance?credentialId=${credentialId}&email=${encodeURIComponent(trimmed)}`);
    if (response.ok) setAllowance(await response.json());
    setStep("shop");
  };

  const startGuestCheckout = () => {
    setBuyerType("guest");
    setStaffEmail("");
    setStaffName("");
    setAllowance(null);
    setStep("shop");
  };

  const scanItem = async (code: string) => {
    if (!credentialId || !code.trim()) return;
    setItemLookup("");
    const response = await fetch(`/api/pos/products?credentialId=${credentialId}&q=${encodeURIComponent(code.trim())}`);
    const data = await response.json();
    const products: CatalogProduct[] = data.products || [];
    const match = products.find((product) => product.itemCode.toLowerCase() === code.trim().toLowerCase()) || products[0];
    if (!match) {
      notify({ title: t.common.error, message: code, color: "red", autoClose: 2000 });
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.itemCode === match.itemCode);
      if (existing) {
        return current.map((line) =>
          line.itemCode === match.itemCode ? { ...line, quantity: Math.min(line.quantity + 1, match.stock) } : line,
        );
      }
      return [...current, { ...match, quantity: 1 }];
    });
  };

  const updateQuantity = (itemCode: string, delta: number) =>
    setCart((current) =>
      current
        .map((line) =>
          line.itemCode === itemCode
            ? { ...line, quantity: Math.max(0, Math.min(line.quantity + delta, line.stock)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );

  const removeItem = (itemCode: string) => setCart((current) => current.filter((line) => line.itemCode !== itemCode));

  const canPayWithAllowance = buyerType === "staff" && !!allowance && allowance.remaining >= total;

  const submitSale = async () => {
    if (!credentialId || !paymentMethod || cart.length === 0 || submitting) return;
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
        notify({ title: t.dashboard.pos.saleCompleted, message: data.adjustmentNumber || "", color: "green", autoClose: 3000 });
      } else {
        notify({ title: t.common.error, message: data.error || t.common.error, color: "red", autoClose: 4000 });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startNewTransaction = () => {
    setStep("identify");
    setBuyerType(null);
    setStaffEmail("");
    setStaffName("");
    setAllowance(null);
    setCart([]);
    setPaymentMethod(null);
    setAdjustmentNumber(null);
    setIdempotencyKey(createIdempotencyKey());
  };

  if (!credentialId) {
    return (
      <Center style={{ flex: 1 }} p="xl">
        <Stack align="center" gap="md" maw={400}>
          <Title order={2}>{t.dashboard.pos.cashierTitle}</Title>
          <Select
            label={t.dashboard.pos.credential}
            data={credentials.map((credential) => ({ value: credential.id, label: credential.appKey }))}
            value={credentialId}
            onChange={setCredentialId}
            w="100%"
          />
        </Stack>
      </Center>
    );
  }

  return (
    <Stack style={{ flex: 1 }} p="lg" gap="lg">
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon size={40} radius="md" variant="light">
            <IconShoppingCart size={22} />
          </ThemeIcon>
          <Title order={2}>{t.dashboard.pos.cashierTitle}</Title>
        </Group>
        {step !== "identify" && (
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={startNewTransaction}>
            {t.dashboard.pos.newTransaction}
          </Button>
        )}
      </Group>

      {step === "identify" && (
        <Stack maw={520} mx="auto" style={{ width: "100%" }} gap="lg">
          <Text ta="center" c="dimmed">
            {t.dashboard.pos.identifyBuyer}
          </Text>
          <PersistentScanner onScan={(code) => void identifyStaff(code)} scannerHeight={260} />
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
          />
          <Group grow>
            <Button leftSection={<IconUser size={16} />} onClick={() => void identifyStaff(staffEmail)} disabled={!staffEmail.includes("@")}>
              {t.dashboard.pos.staffIdentified}
            </Button>
            <Button variant="outline" leftSection={<IconUserOff size={16} />} onClick={startGuestCheckout}>
              {t.dashboard.pos.guestCheckout}
            </Button>
          </Group>
        </Stack>
      )}

      {step === "shop" && (
        <Group align="flex-start" grow style={{ flex: 1 }}>
          <Stack style={{ flex: 1 }}>
            <TextInput
              ref={itemInputRef}
              label={t.dashboard.pos.scanItem}
              placeholder={t.dashboard.pos.search}
              value={itemLookup}
              onChange={(event) => setItemLookup(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void scanItem(itemLookup);
              }}
              leftSection={<IconScan size={16} />}
            />
            <PersistentScanner onScan={(code) => void scanItem(code)} scannerHeight={260} />
          </Stack>

          <Stack style={{ flex: 1 }}>
            <Card withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>{t.dashboard.pos.cart}</Text>
                {buyerType === "staff" && <Badge color="blue">{staffName || staffEmail}</Badge>}
                {buyerType === "guest" && <Badge color="gray">{t.dashboard.pos.guestCheckout}</Badge>}
              </Group>
              <Stack gap="xs">
                {cart.map((line) => (
                  <Group key={line.itemCode} justify="space-between" wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                      <Text size="sm">{line.itemName}</Text>
                      <Text size="xs" c="dimmed">
                        {line.unitPrice.toLocaleString()} x {line.quantity}
                      </Text>
                    </Box>
                    <Group gap={4}>
                      <ActionIcon variant="light" onClick={() => updateQuantity(line.itemCode, -1)}>
                        -
                      </ActionIcon>
                      <Text w={24} ta="center">
                        {line.quantity}
                      </Text>
                      <ActionIcon variant="light" onClick={() => updateQuantity(line.itemCode, 1)}>
                        +
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => removeItem(line.itemCode)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
                {cart.length === 0 && (
                  <Text c="dimmed" size="sm">
                    {t.dashboard.pos.scanItem}
                  </Text>
                )}
              </Stack>
              <Group justify="space-between" mt="md">
                <Text fw={700}>{t.dashboard.pos.total}</Text>
                <Text fw={700} size="lg">
                  {total.toLocaleString()}
                </Text>
              </Group>
              <Button mt="md" fullWidth disabled={cart.length === 0} onClick={() => setStep("pay")}>
                {t.dashboard.pos.checkout}
              </Button>
            </Card>

            {buyerType === "staff" && allowance && (
              <Card withBorder>
                <Text fw={600} mb={4}>
                  {t.dashboard.pos.allowanceBalance}
                </Text>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t.dashboard.pos.allowanceRemaining}
                  </Text>
                  <Text fw={600}>{allowance.remaining.toLocaleString()}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t.dashboard.pos.allowanceUsed}
                  </Text>
                  <Text>{allowance.used.toLocaleString()}</Text>
                </Group>
                <Text size="xs" c="dimmed" mt="sm">
                  {t.dashboard.pos.allowancePeriod}: {allowance.period.startsAt.slice(0, 10)} – {allowance.period.endsAt.slice(0, 10)}
                  {allowance.period.isCustom ? ` (${t.dashboard.pos.customPeriod})` : ""}
                </Text>
              </Card>
            )}
          </Stack>
        </Group>
      )}

      {step === "pay" && (
        <Stack maw={480} mx="auto" style={{ width: "100%" }} gap="lg">
          <Card withBorder>
            <Text fw={700} ta="center" size="xl">
              {total.toLocaleString()}
            </Text>
          </Card>
          <SimpleGrid cols={1}>
            {buyerType === "staff" && (
              <Button
                size="lg"
                leftSection={<IconWallet size={18} />}
                variant={paymentMethod === "allowance" ? "filled" : "outline"}
                disabled={!canPayWithAllowance}
                onClick={() => setPaymentMethod("allowance")}
              >
                {t.dashboard.pos.payWithAllowance}
                {!canPayWithAllowance && ` (${t.dashboard.pos.insufficientAllowance})`}
              </Button>
            )}
            <Button
              size="lg"
              leftSection={<IconCash size={18} />}
              variant={paymentMethod === "cash" ? "filled" : "outline"}
              onClick={() => setPaymentMethod("cash")}
            >
              {t.dashboard.pos.payWithCash}
            </Button>
            <Button
              size="lg"
              leftSection={<IconQrcode size={18} />}
              variant={paymentMethod === "qris" ? "filled" : "outline"}
              onClick={() => setPaymentMethod("qris")}
            >
              {t.dashboard.pos.payWithQris}
            </Button>
          </SimpleGrid>
          <Group grow>
            <Button variant="subtle" onClick={() => setStep("shop")}>
              {t.common.back}
            </Button>
            <Button loading={submitting} disabled={!paymentMethod} onClick={() => void submitSale()}>
              {t.dashboard.pos.checkout}
            </Button>
          </Group>
        </Stack>
      )}

      {step === "done" && (
        <Center style={{ flex: 1 }}>
          <Stack align="center" gap="md">
            <ThemeIcon size={72} radius="xl" color="green">
              <IconShoppingCart size={36} />
            </ThemeIcon>
            <Title order={2}>{t.dashboard.pos.saleCompleted}</Title>
            {adjustmentNumber && <Text c="dimmed">{adjustmentNumber}</Text>}
            <Button onClick={startNewTransaction}>{t.dashboard.pos.newTransaction}</Button>
          </Stack>
        </Center>
      )}
    </Stack>
  );
}
