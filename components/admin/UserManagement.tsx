"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCash,
  IconCheck,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUser,
  IconUsers,
  IconTool,
} from "@tabler/icons-react";
import { roleTone } from "@/lib/user-roles";
import { syncDotState, syncTooltipLines } from "@/lib/sync-label";
import type { UserStatus } from "@/lib/user-directory";

interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
  status: UserStatus;
  entitlementSyncedAt: string | null;
  _count: {
    accurateCredentials: number;
    exportJobs: number;
    importJobs: number;
  };
}

interface Paging {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

interface SyncStatus {
  synced_at: string | null;
  checked_at: string | null;
  last_error: string | null;
}

const PAGE_SIZE = 20;

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "no_access", label: "No Access In Central" },
  { value: "unknown", label: "Unknown In Central" },
];

const statusBadge: Record<UserStatus, { label: string; color: string; hint?: string } | null> = {
  active: null,
  no_access: { label: "No Access In Central", color: "red", hint: "Central knows this person but gives them no access to Exima now. Central does not keep the history of removals." },
  unknown: { label: "Unknown In Central", color: "yellow", hint: "Central does not know this person, or this is an older local account without a Central identity." },
};

const iconOf = {
  shield: <IconShield size={20} />,
  cash: <IconCash size={20} />,
  tool: <IconTool size={20} />,
  user: <IconUser size={20} />,
};

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not yet";
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error || "Something went wrong.";
}


const syncDotCss = `
.sync-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; outline-offset: 3px; cursor: default; }
.sync-dot--fresh { animation: sync-dot-pulse 1.6s ease-out 1; }
@keyframes sync-dot-pulse { 0% { box-shadow: 0 0 0 0 rgba(64,192,87,0.55); } 100% { box-shadow: 0 0 0 9px rgba(64,192,87,0); } }
@media (prefers-reduced-motion: reduce) { .sync-dot--fresh { animation: none; } }
`;

// A small dot next to the title: green when in step with Central, orange when the sync is failing.
// The details are in the tooltip.
function SyncDot({ status }: { status: SyncStatus }) {
  const state = syncDotState(status);
  const lines = syncTooltipLines(status);
  return (
    <Tooltip
      withArrow
      events={{ hover: true, focus: true, touch: true }}
      label={<Stack gap={0}>{lines.map((line, index) => <Text key={line} size="xs" fw={index === 0 ? 600 : 400}>{line}</Text>)}</Stack>}
    >
      <span
        role="status"
        tabIndex={0}
        aria-label={lines.join(". ")}
        className={`sync-dot${state === "fresh" ? " sync-dot--fresh" : ""}`}
        style={{ background: state === "failing" ? "var(--mantine-color-orange-6)" : "var(--mantine-color-green-6)" }}
      />
    </Tooltip>
  );
}

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<{ role: string; count: number; permissions: string[] }[]>([]);
  const [paging, setPaging] = useState<Paging>({ page: 1, size: PAGE_SIZE, total: 0, totalPages: 1 });
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setUsers(data.users);
      setRoles(data.roles);
      setPaging(data.paging);
      setCurrentUserId(data.currentUserId);
    } catch (error) {
      notifications.show({
        title: "Unable to load users",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users/sync", { cache: "no-store" });
      if (!response.ok) return;
      setSyncStatus((await response.json()).status);
    } catch {
      setSyncStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadSyncStatus();
  }, [loadSyncStatus]);

  const changeFilter = (setter: (value: string | null) => void) => (value: string | null) => {
    setter(value);
    setPage(1);
  };

  const syncFromCentral = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/users/sync", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      await Promise.all([loadUsers(), loadSyncStatus()]);
      notifications.show({
        title: "Users checked",
        message: "Exima is in step with Central.",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Unable to sync users",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setSyncing(false);
    }
  };

  const roleOptions = roles.map((row) => ({ value: row.role, label: roleTone(row.role, row.permissions).label }));

  return (
    <Stack gap="lg">
      <style>{syncDotCss}</style>
      <Group justify="space-between" align="flex-end">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>Administration</Text>
          <Group gap={10} align="center" wrap="nowrap">
            <Title order={2}>User management</Title>
            {syncStatus && <SyncDot status={syncStatus} />}
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            People, roles and permissions come from Central and cannot be changed here.
          </Text>
        </Box>
      </Group>

      {syncStatus?.last_error ? (
        <Alert variant="light" color="orange" radius="md" icon={<IconRefresh size={18} />} title="Automatic sync is failing">
          <Group justify="space-between" align="center" wrap="nowrap" gap="md">
            <Text size="sm">{syncStatus.last_error}. It tries again every minute.</Text>
            <Button size="xs" color="orange" variant="light" loading={syncing} onClick={syncFromCentral}>
              Retry Now
            </Button>
          </Group>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        {roles.map(({ role, count, permissions }) => {
          const meta = roleTone(role, permissions);
          return (
            <Card key={role} withBorder radius="md" padding="lg">
              <Group justify="space-between" align="flex-start">
                <Stack gap={3}>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                    {meta.label}
                  </Text>
                  <Text size="xl" fw={700}>{count}</Text>
                </Stack>
                <ThemeIcon color={meta.color} variant="light" size="lg" radius="md">
                  {iconOf[meta.icon]}
                </ThemeIcon>
              </Group>
              <Text size="xs" c="dimmed" mt="sm">{meta.description}</Text>
            </Card>
          );
        })}
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="md" align="flex-end">
          <Group align="flex-end" flex={1}>
            <TextInput
              label="Search users"
              placeholder="Search by name or email"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select
              label="Role"
              placeholder="All roles"
              clearable
              data={roleOptions}
              value={roleFilter}
              onChange={changeFilter(setRoleFilter)}
              w={180}
            />
            <Select
              label="Status"
              placeholder="All"
              clearable
              data={statusOptions}
              value={statusFilter}
              onChange={changeFilter(setStatusFilter)}
              w={220}
            />
          </Group>
          <Badge variant="light" size="lg">{paging.total} users</Badge>
        </Group>

        {loading ? (
          <Center py={60}><Loader /></Center>
        ) : users.length === 0 ? (
          <Center py={60}>
            <Stack align="center" gap="xs">
              <ThemeIcon variant="light" color="gray" size={48} radius="xl">
                <IconUsers size={24} />
              </ThemeIcon>
              <Text fw={600}>No users found</Text>
              <Text size="sm" c="dimmed">Try changing the search or the filters.</Text>
            </Stack>
          </Center>
        ) : (
          <Table.ScrollContainer minWidth={780}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Owned activity</Table.Th>
                  <Table.Th>Synced</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((user) => {
                  const meta = roleTone(user.role, user.permissions);
                  const flag = statusBadge[user.status];
                  return (
                    <Table.Tr key={user.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar color={meta.color} radius="xl">{initials(user.name, user.email)}</Avatar>
                          <Box>
                            <Group gap="xs">
                              <Text fw={600} size="sm">{user.name || user.email}</Text>
                              {user.id === currentUserId && <Badge size="xs" variant="outline">You</Badge>}
                              {flag && (
                                <Tooltip label={flag.hint} multiline w={260} withArrow>
                                  <Badge size="xs" color={flag.color} variant="light">{flag.label}</Badge>
                                </Tooltip>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed">{user.email}</Text>
                          </Box>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={meta.color} variant="light">{meta.label}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {user._count.accurateCredentials} connections · {user._count.exportJobs + user._count.importJobs} jobs
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{formatTime(user.entitlementSyncedAt)}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {paging.totalPages > 1 && (
          <Group justify="space-between" mt="md">
            <Text size="sm" c="dimmed">
              Page {paging.page} of {paging.totalPages}
            </Text>
            <Pagination value={paging.page} total={paging.totalPages} onChange={setPage} />
          </Group>
        )}
      </Paper>
    </Stack>
  );
}
