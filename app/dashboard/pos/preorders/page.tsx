"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconClock,
  IconEye,
  IconRefresh,
  IconSearch,
  IconShoppingBag,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReservationStatus = "active" | "picked_up" | "cancelled" | "expired";
type PaymentMethod = "allowance" | "cash" | "qris";

interface ReservationItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
}

interface Reservation {
  id: string;
  reference: string;
  warehouseName: string;
  staffEmail: string;
  staffName: string | null;
  preferredPaymentMethod: PaymentMethod;
  status: ReservationStatus;
  expiresAt: string;
  pickupAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: ReservationItem[];
  sale: { adjustmentNumber: string | null } | null;
}

const statusOptions = [
  { label: "Active", value: "active" },
  { label: "All", value: "all" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reservationTotal(reservation: Reservation) {
  return reservation.items.reduce(
    (total, item) => total + item.quantity * Number(item.unitPrice),
    0,
  );
}

function statusMeta(status: ReservationStatus) {
  if (status === "active") return { label: "Active", color: "blue" };
  if (status === "picked_up") return { label: "Picked up", color: "green" };
  if (status === "cancelled") return { label: "Cancelled", color: "gray" };
  return { label: "Expired", color: "orange" };
}

function paymentLabel(method: PaymentMethod) {
  if (method === "qris") return "QRIS";
  if (method === "cash") return "Cash";
  return "Allowance";
}

export default function PreorderManagementPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadReservations = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pos/reservations?mine=false", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load preorders");
      setReservations(data);
      setSelected((current) => current ? data.find((item: Reservation) => item.id === current.id) || null : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load preorders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const filteredReservations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (statusFilter === "active" && reservation.status !== "active") return false;
      if (!normalized) return true;
      return [
        reservation.reference,
        reservation.staffName || "",
        reservation.staffEmail,
        reservation.warehouseName,
        ...reservation.items.flatMap((item) => [item.itemCode, item.itemName]),
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, reservations, statusFilter]);

  const activeCount = reservations.filter((reservation) => reservation.status === "active").length;
  const activeValue = reservations
    .filter((reservation) => reservation.status === "active")
    .reduce((total, reservation) => total + reservationTotal(reservation), 0);
  const activeItems = reservations
    .filter((reservation) => reservation.status === "active")
    .reduce((total, reservation) => total + reservation.items.reduce((sum, item) => sum + item.quantity, 0), 0);

  const cancelReservation = async () => {
    if (!cancelTarget) return;
    setCancelling(true);

    try {
      const response = await fetch("/api/pos/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelTarget.id, action: "cancel" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to cancel preorder");

      notifications.show({
        title: data.status === "cancelled" ? "Preorder cancelled" : "Preorder updated",
        message: data.status === "cancelled"
          ? `${cancelTarget.reference} was cancelled and its held stock was released.`
          : `${cancelTarget.reference} is now ${String(data.status).replace("_", " ")}.`,
        color: data.status === "cancelled" ? "green" : "orange",
      });
      setCancelTarget(null);
      await loadReservations(true);
    } catch (cancelError) {
      notifications.show({
        title: "Cancellation failed",
        message: cancelError instanceof Error ? cancelError.message : "Unable to cancel preorder",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Pre Order Management</Title>
          <Text c="dimmed" mt={4}>
            Review staff preorders, monitor active stock holds, and cancel orders when required.
          </Text>
        </div>
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={refreshing}
          onClick={() => void loadReservations(true)}
        >
          Refresh
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder padding="lg">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Active preorders</Text>
              <Text size="xl" fw={700}>{activeCount}</Text>
            </div>
            <IconClock color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>
        <Card withBorder padding="lg">
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Items currently held</Text>
              <Text size="xl" fw={700}>{activeItems}</Text>
            </div>
            <IconShoppingBag color="var(--mantine-color-violet-6)" />
          </Group>
        </Card>
        <Card withBorder padding="lg">
          <Text size="sm" c="dimmed">Active preorder value</Text>
          <Text size="xl" fw={700}>{formatMoney(activeValue)}</Text>
        </Card>
      </SimpleGrid>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={18} />} title="Unable to load preorders">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Group justify="space-between" mb="md" align="flex-end">
          <TextInput
            label="Search preorders"
            placeholder="Reference, staff, warehouse, or item"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            w={{ base: "100%", sm: 380 }}
          />
          <SegmentedControl data={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        </Group>

        {loading ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : filteredReservations.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            <IconShoppingBag size={36} color="var(--mantine-color-gray-5)" />
            <Text fw={600}>No preorders found</Text>
            <Text size="sm" c="dimmed">Try another search or switch the status filter.</Text>
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={980}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Reference</Table.Th>
                  <Table.Th>Staff</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Expires / completed</Table.Th>
                  <Table.Th>Items</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredReservations.map((reservation) => {
                  const meta = statusMeta(reservation.status);
                  const itemCount = reservation.items.reduce((sum, item) => sum + item.quantity, 0);
                  const lifecycleDate = reservation.status === "picked_up"
                    ? reservation.pickupAt
                    : reservation.status === "cancelled"
                      ? reservation.cancelledAt
                      : reservation.expiresAt;

                  return (
                    <Table.Tr key={reservation.id}>
                      <Table.Td>
                        <Text fw={600}>{reservation.reference}</Text>
                        <Text size="xs" c="dimmed">{reservation.warehouseName}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{reservation.staffName || reservation.staffEmail}</Text>
                        {reservation.staffName && <Text size="xs" c="dimmed">{reservation.staffEmail}</Text>}
                      </Table.Td>
                      <Table.Td>{formatDate(reservation.createdAt)}</Table.Td>
                      <Table.Td>{formatDate(lifecycleDate)}</Table.Td>
                      <Table.Td>{itemCount}</Table.Td>
                      <Table.Td>{formatMoney(reservationTotal(reservation))}</Table.Td>
                      <Table.Td><Badge color={meta.color} variant="light">{meta.label}</Badge></Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <ActionIcon variant="subtle" aria-label="View preorder" onClick={() => setSelected(reservation)}>
                            <IconEye size={18} />
                          </ActionIcon>
                          {reservation.status === "active" && (
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              leftSection={<IconX size={14} />}
                              onClick={() => setCancelTarget(reservation)}
                            >
                              Cancel
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal
        opened={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Preorder ${selected.reference}` : "Preorder details"}
        size="lg"
      >
        {selected && (
          <Stack>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>{selected.staffName || selected.staffEmail}</Text>
                {selected.staffName && <Text size="sm" c="dimmed">{selected.staffEmail}</Text>}
                <Text size="sm" c="dimmed">{selected.warehouseName}</Text>
              </div>
              <Badge color={statusMeta(selected.status).color} variant="light">
                {statusMeta(selected.status).label}
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <div><Text size="xs" c="dimmed">Created</Text><Text size="sm">{formatDate(selected.createdAt)}</Text></div>
              <div><Text size="xs" c="dimmed">Expires</Text><Text size="sm">{formatDate(selected.expiresAt)}</Text></div>
              <div><Text size="xs" c="dimmed">Payment</Text><Text size="sm">{paymentLabel(selected.preferredPaymentMethod)}</Text></div>
            </SimpleGrid>
            <Divider />
            <ScrollArea.Autosize mah={320}>
              <Table>
                <Table.Thead>
                  <Table.Tr><Table.Th>Item</Table.Th><Table.Th ta="right">Qty</Table.Th><Table.Th ta="right">Price</Table.Th><Table.Th ta="right">Subtotal</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {selected.items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td><Text size="sm" fw={500}>{item.itemName}</Text><Text size="xs" c="dimmed">{item.itemCode}</Text></Table.Td>
                      <Table.Td ta="right">{item.quantity}</Table.Td>
                      <Table.Td ta="right">{formatMoney(Number(item.unitPrice))}</Table.Td>
                      <Table.Td ta="right">{formatMoney(item.quantity * Number(item.unitPrice))}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
            <Divider />
            <Group justify="space-between">
              <Text fw={600}>Total</Text>
              <Text fw={700} size="lg">{formatMoney(reservationTotal(selected))}</Text>
            </Group>
            {selected.sale?.adjustmentNumber && <Text size="sm" c="dimmed">Accurate adjustment: {selected.sale.adjustmentNumber}</Text>}
            {selected.status === "active" && (
              <Button color="red" variant="light" onClick={() => { setSelected(null); setCancelTarget(selected); }}>
                Cancel preorder
              </Button>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        opened={!!cancelTarget}
        onClose={() => !cancelling && setCancelTarget(null)}
        title="Cancel preorder"
        centered
      >
        <Stack>
          <Text>
            Cancel <Text span fw={700}>{cancelTarget?.reference}</Text>? The held stock will be released immediately and the staff member will no longer be able to pick it up.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={cancelling} onClick={() => setCancelTarget(null)}>Keep preorder</Button>
            <Button color="red" loading={cancelling} onClick={() => void cancelReservation()}>Cancel preorder</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
