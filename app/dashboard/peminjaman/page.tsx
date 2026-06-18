"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Stack,
    Title,
    Text,
    Group,
    SimpleGrid,
    Card,
    Badge,
    Button,
    TextInput,
    NumberInput,
    Table,
    Tabs,
    ActionIcon,
    Loader,
    Center,
    Box,
    rem,
    Select,
    ScrollArea,
    Tooltip,
    Modal,
    Divider,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
    IconClipboardList,
    IconPackage,
    IconHistory,
    IconSearch,
    IconPlus,
    IconTrash,
    IconRefresh,
    IconUser,
    IconCalendar,
    IconCalendarEvent,
} from "@tabler/icons-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ActivityTimeline, ActivityItem } from "@/components/ui/ActivityTimeline";
import { useLanguage } from "@/lib/language";

interface Credential {
    id: string;
    appKey: string;
    host: string | null;
}

interface BorrowableItem {
    id: string;
    itemCode: string;
    itemName: string;
    totalStock: number;
    currentlyOut: number;
    available: number;
    createdAt: string;
}

interface BorrowingSession {
    id: string;
    borrowerEmail: string;
    borrowerName: string | null;
    borrowerDept: string | null;
    type: string;
    status: string;
    startsAt: string;
    dueAt: string | null;
    borrowedAt: string;
    returnedAt: string | null;
    items: {
        id: string;
        itemCode: string;
        itemName: string;
        quantity: number;
        returnedQty: number;
    }[];
}

interface ItemActivityResponse {
    id: string;
    itemCode: string;
    itemName: string;
    borrowerEmail: string;
    borrowerName: string | null;
    borrowerDept: string | null;
    activityType: "borrow" | "booking" | "return";
    quantity: number;
    occurredAt: string;
    scheduleStart: string | null;
    scheduleEnd: string | null;
    details: string | null;
}

interface ItemCalendarEvent {
    id: string;
    sessionId: string;
    type: string;
    status: string;
    borrowerEmail: string;
    borrowerName: string | null;
    borrowerDept: string | null;
    itemCode: string;
    itemName: string;
    quantity: number;
    returnedQty: number;
    startDate: string;
    endDate: string;
}

function formatDateValue(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatHumanDate(value: string | Date, language: "id" | "en") {
    return new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}

function formatHumanDateRange(
    start: string | Date,
    end: string | Date,
    language: "id" | "en"
) {
    return `${formatHumanDate(start, language)} ${language === "id" ? "s/d" : "to"} ${formatHumanDate(
        end,
        language
    )}`;
}

export default function PeminjamanDashboardPage() {
    const { language } = useLanguage();
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [selectedCredentialId, setSelectedCredentialId] = useState<
        string | null
    >(null);
    const [loading, setLoading] = useState(true);

    // Items tab
    const [items, setItems] = useState<BorrowableItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [newItemCode, setNewItemCode] = useState("");
    const [newItemStock, setNewItemStock] = useState<number>(1);
    const [lookingUp, setLookingUp] = useState(false);
    const [addingItem, setAddingItem] = useState(false);
    const [deletingItemIds, setDeletingItemIds] = useState<string[]>([]);

    // Sessions tab
    const [sessions, setSessions] = useState<BorrowingSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("active");
    const [searchQuery, setSearchQuery] = useState("");
    const [totalSessions, setTotalSessions] = useState(0);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<BorrowableItem | null>(null);
    const [itemDetailOpen, setItemDetailOpen] = useState(false);
    const [itemActivities, setItemActivities] = useState<ActivityItem[]>([]);
    const [itemCalendarEvents, setItemCalendarEvents] = useState<ItemCalendarEvent[]>([]);
    const [itemDetailLoading, setItemDetailLoading] = useState(false);
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(
        new Date()
    );

    // Fetch credentials
    useEffect(() => {
        const fetchCreds = async () => {
            try {
                const res = await fetch("/api/credentials");
                if (res.ok) {
                    const data = await res.json();
                    setCredentials(data);
                    if (data.length > 0) {
                        setSelectedCredentialId(data[0].id);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch credentials", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCreds();
    }, []);

    // Fetch borrowable items
    const fetchItems = useCallback(async () => {
        if (!selectedCredentialId) return;
        setItemsLoading(true);
        try {
            const res = await fetch(
                `/api/peminjaman/items?credentialId=${selectedCredentialId}`
            );
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (err) {
            console.error("Failed to fetch items", err);
        } finally {
            setItemsLoading(false);
        }
    }, [selectedCredentialId]);

    // Fetch sessions
    const fetchSessions = useCallback(async () => {
        if (!selectedCredentialId) return;
        setSessionsLoading(true);
        try {
            const res = await fetch(
                `/api/peminjaman/sessions?credentialId=${selectedCredentialId}&status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`
            );
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sessions);
                setTotalSessions(data.total);
            }
        } catch (err) {
            console.error("Failed to fetch sessions", err);
        } finally {
            setSessionsLoading(false);
        }
    }, [selectedCredentialId, statusFilter, searchQuery]);

    const mapActivityToTimeline = useCallback(
        (activity: ItemActivityResponse): ActivityItem => {
            const borrowerLabel = activity.borrowerName || activity.borrowerEmail;
            const itemLabel = `${activity.itemName} ×${activity.quantity}`;

            return {
                id: activity.id,
                type: activity.activityType,
                title:
                    activity.activityType === "booking"
                        ? language === "id"
                            ? `Booking oleh ${borrowerLabel}`
                            : `Booking by ${borrowerLabel}`
                        : activity.activityType === "return"
                            ? language === "id"
                                ? `Pengembalian oleh ${borrowerLabel}`
                                : `Return by ${borrowerLabel}`
                            : language === "id"
                                ? `Peminjaman oleh ${borrowerLabel}`
                                : `Borrowing by ${borrowerLabel}`,
                description:
                    activity.activityType === "return"
                        ? itemLabel
                        : `${itemLabel}${activity.scheduleStart && activity.scheduleEnd
                            ? language === "id"
                                ? ` • ${formatHumanDateRange(
                                    activity.scheduleStart,
                                    activity.scheduleEnd,
                                    language
                                )}`
                                : ` • ${formatHumanDateRange(
                                    activity.scheduleStart,
                                    activity.scheduleEnd,
                                    language
                                )}`
                            : ""}`,
                timestamp: activity.occurredAt,
                status:
                    activity.activityType === "return"
                        ? "success"
                        : activity.activityType === "booking"
                            ? "pending"
                            : "warning",
                metadata: {
                    count: activity.quantity,
                },
            };
        },
        [language]
    );

    const fetchActivities = useCallback(async () => {
        if (!selectedCredentialId) return;
        setActivitiesLoading(true);
        try {
            const res = await fetch(
                `/api/peminjaman/activity?credentialId=${selectedCredentialId}&limit=40`
            );
            if (!res.ok) {
                throw new Error("Failed to fetch activities");
            }

            const data = await res.json();
            setActivities((data.activities as ItemActivityResponse[]).map(mapActivityToTimeline));
        } catch (err) {
            console.error("Failed to fetch borrowing activities", err);
            setActivities([]);
        } finally {
            setActivitiesLoading(false);
        }
    }, [mapActivityToTimeline, selectedCredentialId]);

    const openItemDetails = useCallback(
        async (item: BorrowableItem) => {
            if (!selectedCredentialId) return;

            setSelectedItem(item);
            setSelectedCalendarDate(new Date());
            setItemDetailOpen(true);
            setItemDetailLoading(true);

            try {
                const res = await fetch(
                    `/api/peminjaman/activity?credentialId=${selectedCredentialId}&itemCode=${encodeURIComponent(item.itemCode)}&limit=50`
                );
                if (!res.ok) {
                    throw new Error("Failed to fetch item activity");
                }

                const data = await res.json();
                setItemActivities(
                    (data.activities as ItemActivityResponse[]).map(mapActivityToTimeline)
                );
                setItemCalendarEvents(data.calendarEvents || []);
            } catch (err) {
                console.error("Failed to fetch item details", err);
                setItemActivities([]);
                setItemCalendarEvents([]);
            } finally {
                setItemDetailLoading(false);
            }
        },
        [mapActivityToTimeline, selectedCredentialId]
    );

    useEffect(() => {
        fetchItems();
        fetchSessions();
        fetchActivities();
    }, [fetchActivities, fetchItems, fetchSessions]);

    // Add borrowable item
    const handleAddItem = async () => {
        if (!selectedCredentialId || !newItemCode) return;

        setAddingItem(true);
        setLookingUp(true);

        try {
            // First lookup the item from Accurate
            const lookupRes = await fetch(
                `/api/self-checkout/lookup?code=${encodeURIComponent(newItemCode)}&credentialId=${selectedCredentialId}`
            );

            if (!lookupRes.ok) {
                const err = await lookupRes.json();
                notifications.show({
                    title: language === "id" ? "Barang Tidak Ditemukan" : "Item Not Found",
                    message: err.error || newItemCode,
                    color: "red",
                });
                return;
            }

            const lookupData = await lookupRes.json();

            // Add to borrowable items
            const res = await fetch("/api/peminjaman/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    credentialId: selectedCredentialId,
                    itemCode: lookupData.itemCode,
                    itemName: lookupData.itemName,
                    totalStock: newItemStock,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }

            notifications.show({
                title: language === "id" ? "Berhasil" : "Success",
                message: `${lookupData.itemName} ${language === "id" ? "ditambahkan" : "added"}`,
                color: "green",
            });

            setNewItemCode("");
            setNewItemStock(1);
            fetchItems();
        } catch (err: any) {
            notifications.show({
                title: language === "id" ? "Gagal" : "Failed",
                message: err.message,
                color: "red",
            });
        } finally {
            setAddingItem(false);
            setLookingUp(false);
        }
    };

    // Delete borrowable item
    const handleDeleteItem = async (id: string) => {
        setDeletingItemIds((prev) => [...prev, id]);
        try {
            const res = await fetch(`/api/peminjaman/items?id=${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete");
            notifications.show({
                title: language === "id" ? "Berhasil" : "Success",
                message: language === "id" ? "Barang dihapus" : "Item deleted",
                color: "green",
            });
            fetchItems();
        } catch {
            notifications.show({
                title: language === "id" ? "Gagal" : "Failed",
                message: language === "id" ? "Gagal menghapus" : "Failed to delete",
                color: "red",
            });
        } finally {
            setDeletingItemIds((prev) => prev.filter((itemId) => itemId !== id));
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active":
                return "orange";
            case "returned":
                return "green";
            case "partial":
                return "yellow";
            case "booked":
                return "cyan";
            default:
                return "gray";
        }
    };

    const getStatusLabel = (status: string) => {
        if (language === "id") {
            switch (status) {
                case "active":
                    return "Dipinjam";
                case "returned":
                    return "Dikembalikan";
                case "partial":
                    return "Sebagian";
                case "booked":
                    return "Booking";
                default:
                    return status;
            }
        }
        switch (status) {
            case "active":
                return "Active";
            case "returned":
                return "Returned";
            case "partial":
                return "Partial";
            case "booked":
                return "Booked";
            default:
                return status;
        }
    };

    const getTypeLabel = (type: string) => {
        if (type === "booking") {
            return language === "id" ? "Booking" : "Booking";
        }

        return language === "id" ? "Peminjaman" : "Borrowing";
    };

    const calendarEventsForSelectedDate = useMemo(() => {
        if (!selectedCalendarDate) {
            return itemCalendarEvents;
        }

        const selectedDate = formatDateValue(selectedCalendarDate);
        return itemCalendarEvents.filter(
            (event) => selectedDate >= event.startDate && selectedDate <= event.endDate
        );
    }, [itemCalendarEvents, selectedCalendarDate]);

    const itemAvailabilityByDate = useMemo(() => {
        const reservedByDate = new Map<string, number>();
        const totalStock = selectedItem?.totalStock || 0;

        for (const event of itemCalendarEvents) {
            const reservedQty =
                event.type === "booking"
                    ? event.quantity
                    : Math.max(0, event.quantity - event.returnedQty);

            if (reservedQty <= 0) {
                continue;
            }

            let cursor = new Date(`${event.startDate}T00:00:00`);
            const end = new Date(`${event.endDate}T00:00:00`);

            while (cursor <= end) {
                const dateKey = formatDateValue(cursor);
                reservedByDate.set(dateKey, (reservedByDate.get(dateKey) || 0) + reservedQty);

                cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
            }
        }

        return reservedByDate;
    }, [itemCalendarEvents, selectedItem]);

    const selectedDateLabel = selectedCalendarDate
        ? formatHumanDate(selectedCalendarDate, language)
        : language === "id"
            ? "tanggal terpilih"
            : "selected date";

    const getAvailabilityMeta = useCallback(
        (date: Date) => {
            const dateKey = formatDateValue(date);
            const reservedQty = itemAvailabilityByDate.get(dateKey) || 0;
            const totalStock = selectedItem?.totalStock || 0;
            const status =
                totalStock <= 0 || reservedQty >= totalStock
                    ? "unavailable"
                    : reservedQty > 0
                        ? "partial"
                        : "available";

            if (status === "unavailable") {
                return {
                    color: "rgba(250, 82, 82, 0.16)",
                    textColor: "#c92a2a",
                    label:
                        language === "id"
                            ? "Tidak tersedia pada tanggal ini"
                            : "Not available on this date",
                };
            }

            if (status === "partial") {
                return {
                    color: "rgba(253, 126, 20, 0.18)",
                    textColor: "#d9480f",
                    label:
                        language === "id"
                            ? "Sebagian stok masih tersedia"
                            : "Partially available on this date",
                };
            }

            return {
                color: "rgba(64, 192, 87, 0.16)",
                textColor: "#2b8a3e",
                label:
                    language === "id"
                        ? "Tersedia pada tanggal ini"
                        : "Available on this date",
            };
        },
        [itemAvailabilityByDate, language, selectedItem?.totalStock]
    );

    if (loading) {
        return (
            <DashboardLayout>
                <Center h={400}>
                    <Loader />
                </Center>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <Stack gap="lg">
                {/* Header */}
                <Group justify="space-between" align="flex-start">
                    <Stack gap="xs">
                        <Title order={2}>
                            {language === "id" ? "Peminjaman" : "Borrowing"}
                        </Title>
                        <Text c="dimmed" size="sm">
                            {language === "id"
                                ? "Kelola barang pinjaman, lihat status peminjaman, dan riwayat"
                                : "Manage borrowable items, view loan status, and history"}
                        </Text>
                    </Stack>
                    {credentials.length > 1 && (
                        <Select
                            value={selectedCredentialId}
                            onChange={setSelectedCredentialId}
                            data={credentials.map((c) => ({
                                value: c.id,
                                label: c.appKey + (c.host ? ` (${c.host})` : ""),
                            }))}
                            w={250}
                        />
                    )}
                </Group>

                <Tabs defaultValue="items">
                    <Tabs.List>
                        <Tabs.Tab value="items" leftSection={<IconPackage size={16} />}>
                            {language === "id" ? "Barang" : "Items"}
                            {items.length > 0 && (
                                <Badge size="xs" variant="light" ml="xs">
                                    {items.length}
                                </Badge>
                            )}
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="active"
                            leftSection={<IconClipboardList size={16} />}
                        >
                            {language === "id" ? "Pinjaman Aktif" : "Active Loans"}
                        </Tabs.Tab>
                        <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
                            {language === "id" ? "Riwayat" : "History"}
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="activity"
                            leftSection={<IconCalendarEvent size={16} />}
                        >
                            {language === "id" ? "Aktivitas Terbaru" : "Recent Activity"}
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* Items Tab */}
                    <Tabs.Panel value="items" pt="md">
                        <Stack gap="md">
                            {/* Add Item Form */}
                            <Card withBorder radius="md" p="md">
                                <Stack gap="sm">
                                    <Text fw={600} size="sm">
                                        {language === "id"
                                            ? "Tambah Barang Peminjaman"
                                            : "Add Borrowable Item"}
                                    </Text>
                                    <Group gap="sm" align="flex-end">
                                        <TextInput
                                            label={
                                                language === "id" ? "Kode Barang" : "Item Code"
                                            }
                                            placeholder={
                                                language === "id"
                                                    ? "Masukkan kode barang Accurate..."
                                                    : "Enter Accurate item code..."
                                            }
                                            value={newItemCode}
                                            onChange={(e) => setNewItemCode(e.currentTarget.value)}
                                            style={{ flex: 1 }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleAddItem();
                                            }}
                                        />
                                        <NumberInput
                                            label={
                                                language === "id"
                                                    ? "Total Stok"
                                                    : "Total Stock"
                                            }
                                            value={newItemStock}
                                            onChange={(val) =>
                                                setNewItemStock(typeof val === "number" ? val : 1)
                                            }
                                            min={1}
                                            w={120}
                                        />
                                        <Button
                                            leftSection={<IconPlus size={16} />}
                                            onClick={handleAddItem}
                                            loading={addingItem}
                                            disabled={!newItemCode}
                                        >
                                            {language === "id" ? "Tambah" : "Add"}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Card>

                            {/* Items Table */}
                            {itemsLoading ? (
                                <Center h={200}>
                                    <Loader />
                                </Center>
                            ) : items.length === 0 ? (
                                <Card withBorder radius="md" p="xl">
                                    <Center>
                                        <Stack align="center" gap="sm">
                                            <IconPackage
                                                size={48}
                                                style={{ opacity: 0.3 }}
                                            />
                                            <Text c="dimmed" size="sm">
                                                {language === "id"
                                                    ? "Belum ada barang. Tambahkan barang dari Accurate untuk memulai."
                                                    : "No items yet. Add items from Accurate to get started."}
                                            </Text>
                                        </Stack>
                                    </Center>
                                </Card>
                            ) : (
                                <Card withBorder radius="md" p={0}>
                                    <Table.ScrollContainer minWidth={600}>
                                        <Table striped highlightOnHover>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>
                                                        {language === "id" ? "Kode" : "Code"}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {language === "id" ? "Nama Barang" : "Item Name"}
                                                    </Table.Th>
                                                    <Table.Th ta="center">
                                                        {language === "id"
                                                            ? "Total Stok"
                                                            : "Total Stock"}
                                                    </Table.Th>
                                                    <Table.Th ta="center">
                                                        {language === "id"
                                                            ? "Dipinjam"
                                                            : "Borrowed"}
                                                    </Table.Th>
                                                    <Table.Th ta="center">
                                                        {language === "id"
                                                            ? "Tersedia"
                                                            : "Available"}
                                                    </Table.Th>
                                                    <Table.Th ta="center">
                                                        {language === "id" ? "Aksi" : "Action"}
                                                    </Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {items.map((item) => (
                                                    <Table.Tr key={item.id}>
                                                        <Table.Td>
                                                            <Text size="sm" ff="monospace">
                                                                {item.itemCode}
                                                            </Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Button
                                                                variant="subtle"
                                                                size="compact-sm"
                                                                px={0}
                                                                onClick={() => void openItemDetails(item)}
                                                            >
                                                                {item.itemName}
                                                            </Button>
                                                        </Table.Td>
                                                        <Table.Td ta="center">
                                                            <Badge color="blue" variant="light">
                                                                {item.totalStock}
                                                            </Badge>
                                                        </Table.Td>
                                                        <Table.Td ta="center">
                                                            <Badge
                                                                color={
                                                                    item.currentlyOut > 0
                                                                        ? "orange"
                                                                        : "gray"
                                                                }
                                                                variant="light"
                                                            >
                                                                {item.currentlyOut}
                                                            </Badge>
                                                        </Table.Td>
                                                        <Table.Td ta="center">
                                                            <Badge
                                                                color={
                                                                    item.available > 0 ? "green" : "red"
                                                                }
                                                                variant="light"
                                                            >
                                                                {item.available}
                                                            </Badge>
                                                        </Table.Td>
                                                        <Table.Td ta="center">
                                                            <Tooltip
                                                                label={
                                                                    language === "id" ? "Hapus" : "Delete"
                                                                }
                                                            >
                                                                <ActionIcon
                                                                    color="red"
                                                                    variant="subtle"
                                                                    onClick={() =>
                                                                        handleDeleteItem(item.id)
                                                                    }
                                                                    loading={deletingItemIds.includes(item.id)}
                                                                    aria-label={language === "id" ? "Hapus" : "Delete"}
                                                                >
                                                                    <IconTrash size={16} />
                                                                </ActionIcon>
                                                            </Tooltip>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                </Card>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {/* Active Loans Tab */}
                    <Tabs.Panel value="active" pt="md">
                        <Stack gap="md">
                            <Group gap="sm">
                                <TextInput
                                    placeholder={
                                        language === "id"
                                            ? "Cari peminjam atau barang..."
                                            : "Search borrower or item..."
                                    }
                                    leftSection={<IconSearch size={16} />}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                    style={{ flex: 1 }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") fetchSessions();
                                    }}
                                />
                                <Button
                                    variant="light"
                                    leftSection={<IconRefresh size={16} />}
                                    onClick={() => {
                                        setStatusFilter("active");
                                        setSearchQuery("");
                                        fetchSessions();
                                    }}
                                >
                                    {language === "id" ? "Segarkan" : "Refresh"}
                                </Button>
                            </Group>

                            {sessionsLoading ? (
                                <Center h={200}>
                                    <Loader />
                                </Center>
                            ) : sessions.filter((s) => s.status !== "returned").length ===
                                0 ? (
                                <Card withBorder radius="md" p="xl">
                                    <Center>
                                        <Stack align="center" gap="sm">
                                            <IconClipboardList
                                                size={48}
                                                style={{ opacity: 0.3 }}
                                            />
                                            <Text c="dimmed" size="sm">
                                                {language === "id"
                                                    ? "Tidak ada pinjaman aktif"
                                                    : "No active loans"}
                                            </Text>
                                        </Stack>
                                    </Center>
                                </Card>
                            ) : (
                                <Stack gap="sm">
                                    {sessions
                                        .filter((s) => s.status !== "returned")
                                        .map((session) => (
                                            <Card
                                                key={session.id}
                                                withBorder
                                                radius="md"
                                                p="md"
                                            >
                                                <Group
                                                    justify="space-between"
                                                    mb="sm"
                                                >
                                                    <Group gap="sm">
                                                        <IconUser size={18} />
                                                        <Stack gap={0}>
                                                            <Text size="sm" fw={600}>
                                                                {session.borrowerName ||
                                                                    session.borrowerEmail}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                {session.borrowerEmail}
                                                                {session.borrowerDept
                                                                    ? ` • ${session.borrowerDept}`
                                                                    : ""}
                                                            </Text>
                                                        </Stack>
                                                    </Group>
                                                    <Group gap="sm">
                                                        <Badge
                                                            color={getStatusColor(session.status)}
                                                            variant="light"
                                                        >
                                                            {getStatusLabel(session.status)}
                                                        </Badge>
                                                        <Text size="xs" c="dimmed">
                                                            {new Date(
                                                                session.borrowedAt
                                                            ).toLocaleDateString()}
                                                        </Text>
                                                    </Group>
                                                </Group>
                                                <Group gap="xs" wrap="wrap">
                                                    {session.items.map((item) => (
                                                        <Badge
                                                            key={item.id}
                                                            variant="dot"
                                                            color={
                                                                item.returnedQty >= item.quantity
                                                                    ? "green"
                                                                    : "orange"
                                                            }
                                                            size="lg"
                                                        >
                                                            {item.itemName} ×{item.quantity}
                                                            {item.returnedQty > 0 &&
                                                                item.returnedQty < item.quantity &&
                                                                ` (${item.returnedQty} ${language === "id" ? "kembali" : "returned"})`}
                                                        </Badge>
                                                    ))}
                                                </Group>
                                            </Card>
                                        ))}
                                </Stack>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {/* History Tab */}
                    <Tabs.Panel value="history" pt="md">
                        <Stack gap="md">
                            <Group gap="sm">
                                <TextInput
                                    placeholder={
                                        language === "id"
                                            ? "Cari peminjam atau barang..."
                                            : "Search borrower or item..."
                                    }
                                    leftSection={<IconSearch size={16} />}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                    style={{ flex: 1 }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            setStatusFilter("all");
                                            fetchSessions();
                                        }
                                    }}
                                />
                                <Select
                                    value={statusFilter}
                                    onChange={(val) => setStatusFilter(val || "all")}
                                    data={[
                                        {
                                            value: "all",
                                            label: language === "id" ? "Semua" : "All",
                                        },
                                        {
                                            value: "active",
                                            label:
                                                language === "id" ? "Dipinjam" : "Active",
                                        },
                                        {
                                            value: "returned",
                                            label:
                                                language === "id"
                                                    ? "Dikembalikan"
                                                    : "Returned",
                                        },
                                        {
                                            value: "partial",
                                            label:
                                                language === "id" ? "Sebagian" : "Partial",
                                        },
                                        {
                                            value: "booked",
                                            label:
                                                language === "id" ? "Booking" : "Booked",
                                        },
                                    ]}
                                    w={150}
                                />
                            </Group>

                            {sessionsLoading ? (
                                <Center h={200}>
                                    <Loader />
                                </Center>
                            ) : sessions.length === 0 ? (
                                <Card withBorder radius="md" p="xl">
                                    <Center>
                                        <Stack align="center" gap="sm">
                                            <IconHistory size={48} style={{ opacity: 0.3 }} />
                                            <Text c="dimmed" size="sm">
                                                {language === "id"
                                                    ? "Belum ada riwayat peminjaman"
                                                    : "No borrowing history yet"}
                                            </Text>
                                        </Stack>
                                    </Center>
                                </Card>
                            ) : (
                                <Card withBorder radius="md" p={0}>
                                    <Table.ScrollContainer minWidth={700}>
                                        <Table striped highlightOnHover>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>
                                                        {language === "id" ? "Tipe" : "Type"}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {language === "id" ? "Peminjam" : "Borrower"}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {language === "id" ? "Barang" : "Items"}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {language === "id"
                                                            ? "Mulai"
                                                            : "Start"}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {language === "id"
                                                            ? "Kembali / Selesai"
                                                            : "Return / End"}
                                                    </Table.Th>
                                                    <Table.Th>Status</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {sessions.map((session) => (
                                                    <Table.Tr key={session.id}>
                                                        <Table.Td>
                                                            <Badge
                                                                color={
                                                                    session.type === "booking"
                                                                        ? "cyan"
                                                                        : "violet"
                                                                }
                                                                variant="light"
                                                            >
                                                                {getTypeLabel(session.type)}
                                                            </Badge>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Stack gap={0}>
                                                                <Text size="sm" fw={500}>
                                                                    {session.borrowerName ||
                                                                        session.borrowerEmail}
                                                                </Text>
                                                                <Text size="xs" c="dimmed">
                                                                    {session.borrowerDept || ""}
                                                                </Text>
                                                            </Stack>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Group gap="xs" wrap="wrap">
                                                                {session.items.map((item) => (
                                                                    <Badge
                                                                        key={item.id}
                                                                        variant="light"
                                                                        size="sm"
                                                                    >
                                                                        {item.itemName} ×{item.quantity}
                                                                    </Badge>
                                                                ))}
                                                            </Group>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm">
                                                                {new Date(
                                                                    session.startsAt
                                                                ).toLocaleDateString()}
                                                            </Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm">
                                                                {(session.returnedAt || session.dueAt)
                                                                    ? new Date(
                                                                        session.returnedAt || session.dueAt || session.borrowedAt
                                                                    ).toLocaleDateString()
                                                                    : "-"}
                                                            </Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Badge
                                                                color={getStatusColor(session.status)}
                                                                variant="light"
                                                            >
                                                                {getStatusLabel(session.status)}
                                                            </Badge>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                </Card>
                            )}

                            {totalSessions > 20 && (
                                <Text c="dimmed" size="sm" ta="center">
                                    {language === "id"
                                        ? `Menampilkan 20 dari ${totalSessions} sesi`
                                        : `Showing 20 of ${totalSessions} sessions`}
                                </Text>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="activity" pt="md">
                        <Card withBorder radius="md" p="lg">
                            {activitiesLoading ? (
                                <Center h={240}>
                                    <Loader />
                                </Center>
                            ) : (
                                <ActivityTimeline
                                    activities={activities}
                                    maxItems={40}
                                    showViewAll={false}
                                    emptyMessage={
                                        language === "id"
                                            ? "Belum ada aktivitas peminjaman, booking, atau pengembalian."
                                            : "No borrowing, booking, or return activity yet."
                                    }
                                />
                            )}
                        </Card>
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            <Modal
                opened={itemDetailOpen}
                onClose={() => setItemDetailOpen(false)}
                title={selectedItem?.itemName || (language === "id" ? "Detail Barang" : "Item Details")}
                size="xl"
            >
                <Stack gap="lg">
                    {selectedItem && (
                        <Group justify="space-between" align="flex-start">
                            <Stack gap={2}>
                                <Text fw={600}>{selectedItem.itemName}</Text>
                                <Text c="dimmed" size="sm">
                                    {selectedItem.itemCode}
                                </Text>
                            </Stack>
                            <Group gap="xs">
                                <Badge color="green" variant="light">
                                    {language === "id"
                                        ? `${selectedItem.available} tersedia`
                                        : `${selectedItem.available} available`}
                                </Badge>
                                <Badge color="orange" variant="light">
                                    {language === "id"
                                        ? `${selectedItem.currentlyOut} dipinjam`
                                        : `${selectedItem.currentlyOut} borrowed`}
                                </Badge>
                            </Group>
                        </Group>
                    )}

                    {itemDetailLoading ? (
                        <Center h={280}>
                            <Loader />
                        </Center>
                    ) : (
                        <>
                            <Card withBorder radius="md" p="md">
                                <Stack gap="md">
                                    <Group gap="xs">
                                        <IconCalendar size={18} />
                                        <Text fw={600}>
                                            {language === "id"
                                                ? "Kalender Penggunaan"
                                                : "Usage Calendar"}
                                        </Text>
                                    </Group>
                                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
                                        <Stack gap="md">
                                            <DatePicker
                                                value={selectedCalendarDate}
                                                onChange={setSelectedCalendarDate}
                                                getDayProps={(date) => {
                                                    const meta = getAvailabilityMeta(date);
                                                    const isSelected =
                                                        !!selectedCalendarDate &&
                                                        formatDateValue(date) ===
                                                            formatDateValue(selectedCalendarDate);

                                                    return {
                                                        title: meta.label,
                                                        style: {
                                                            backgroundColor: meta.color,
                                                            color: meta.textColor,
                                                            fontWeight: isSelected ? 700 : 500,
                                                            border: isSelected
                                                                ? "2px solid var(--mantine-color-blue-6)"
                                                                : "1px solid transparent",
                                                        },
                                                    };
                                                }}
                                            />
                                            <Group gap="sm">
                                                <Badge color="green" variant="light">
                                                    {language === "id" ? "Tersedia" : "Available"}
                                                </Badge>
                                                <Badge color="orange" variant="light">
                                                    {language === "id"
                                                        ? "Sebagian tersedia"
                                                        : "Partially available"}
                                                </Badge>
                                                <Badge color="red" variant="light">
                                                    {language === "id"
                                                        ? "Tidak tersedia"
                                                        : "Unavailable"}
                                                </Badge>
                                            </Group>
                                        </Stack>

                                        <Stack gap="xs">
                                            <Text size="sm" fw={600}>
                                                {language === "id"
                                                    ? `Pengguna pada ${selectedDateLabel}`
                                                    : `Users on ${selectedDateLabel}`}
                                            </Text>
                                            {calendarEventsForSelectedDate.length === 0 ? (
                                                <Card withBorder radius="md" p="sm">
                                                    <Text c="dimmed" size="sm">
                                                        {language === "id"
                                                            ? "Tidak ada booking atau peminjaman pada tanggal ini."
                                                            : "No booking or borrowing on this date."}
                                                    </Text>
                                                </Card>
                                            ) : (
                                                calendarEventsForSelectedDate.map((event) => (
                                                    <Card key={event.id} withBorder radius="md" p="sm">
                                                        <Group justify="space-between" align="flex-start">
                                                            <Stack gap={2}>
                                                                <Text size="sm" fw={600}>
                                                                    {event.borrowerName || event.borrowerEmail}
                                                                </Text>
                                                                <Text size="xs" c="dimmed">
                                                                    {event.borrowerDept
                                                                        ? `${event.borrowerEmail} • ${event.borrowerDept}`
                                                                        : event.borrowerEmail}
                                                                </Text>
                                                                <Text size="xs" c="dimmed">
                                                                    {formatHumanDate(event.startDate, language)} -{" "}
                                                                    {formatHumanDate(event.endDate, language)}
                                                                </Text>
                                                            </Stack>
                                                            <Group gap="xs">
                                                                <Badge
                                                                    color={
                                                                        event.type === "booking"
                                                                            ? "cyan"
                                                                            : "violet"
                                                                    }
                                                                    variant="light"
                                                                >
                                                                    {getTypeLabel(event.type)}
                                                                </Badge>
                                                                <Badge
                                                                    color={getStatusColor(event.status)}
                                                                    variant="light"
                                                                >
                                                                    {event.quantity}x
                                                                </Badge>
                                                            </Group>
                                                        </Group>
                                                    </Card>
                                                ))
                                            )}
                                        </Stack>
                                    </SimpleGrid>
                                </Stack>
                            </Card>

                            <Card withBorder radius="md" p="md">
                                <Stack gap="md">
                                    <Group gap="xs">
                                        <IconClipboardList size={18} />
                                        <Text fw={600}>
                                            {language === "id"
                                                ? "Log Aktivitas Barang"
                                                : "Item Activity Log"}
                                        </Text>
                                    </Group>
                                    <ActivityTimeline
                                        activities={itemActivities}
                                        maxItems={50}
                                        showViewAll={false}
                                        emptyMessage={
                                            language === "id"
                                                ? "Belum ada aktivitas untuk barang ini."
                                                : "No activity for this item yet."
                                        }
                                    />
                                </Stack>
                            </Card>
                        </>
                    )}
                </Stack>
            </Modal>
        </DashboardLayout>
    );
}
