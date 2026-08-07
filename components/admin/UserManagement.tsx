"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCash,
  IconCheck,
  IconDotsVertical,
  IconKey,
  IconPlus,
  IconSearch,
  IconShield,
  IconTrash,
  IconUser,
  IconUsers,
  IconTool,
} from "@tabler/icons-react";
import {
  USER_ROLE_META,
  USER_ROLES,
  type UserRole,
} from "@/lib/user-roles";

interface ManagedUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  _count: {
    accurateCredentials: number;
    exportJobs: number;
    importJobs: number;
  };
}

const roleOptions = USER_ROLES.map((role) => ({
  value: role,
  label: USER_ROLE_META[role].label,
}));

const roleIcons: Record<UserRole, React.ReactNode> = {
  admin: <IconShield size={20} />,
  cashier: <IconCash size={20} />,
  resource: <IconTool size={20} />,
  staff: <IconUser size={20} />,
};

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function roleMeta(role: string) {
  return USER_ROLE_META[role as UserRole] || {
    label: role,
    description: "Legacy or custom role.",
    color: "gray",
  };
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error || "Something went wrong.";
}

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setUsers(data.users);
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
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const counts = useMemo(
    () =>
      USER_ROLES.reduce<Record<UserRole, number>>(
        (result, userRole) => {
          result[userRole] = users.filter((user) => user.role === userRole).length;
          return result;
        },
        { admin: 0, cashier: 0, resource: 0, staff: 0 },
      ),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!roleFilter || user.role === roleFilter) &&
        (!normalizedQuery || user.email.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, roleFilter, users]);

  const resetCreateForm = () => {
    setEmail("");
    setPassword("");
    setRole("staff");
  };

  const createUser = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      if (!response.ok) throw new Error(await readError(response));

      setCreateOpen(false);
      resetCreateForm();
      await loadUsers();
      notifications.show({
        title: "User created",
        message: `${email.toLowerCase()} can now sign in.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Unable to create user",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error(await readError(response));

      setEditUser(null);
      await loadUsers();
      notifications.show({
        title: "Role updated",
        message: `${editUser.email} is now ${USER_ROLE_META[role].label}.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Unable to update role",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!passwordUser) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${passwordUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response));

      setPasswordUser(null);
      setPassword("");
      notifications.show({
        title: "Password updated",
        message: `A new password was set for ${passwordUser.email}.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Unable to update password",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async () => {
    if (!deleteUser) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));

      setDeleteUser(null);
      await loadUsers();
      notifications.show({
        title: "User deleted",
        message: `${deleteUser.email} and their owned data were removed.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Unable to delete user",
        message: error instanceof Error ? error.message : "Please try again.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>Administration</Text>
          <Title order={2}>User management</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Create accounts, assign access roles, and manage credentials.
          </Text>
        </Box>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setCreateOpen(true)}>
          Add user
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        {USER_ROLES.map((userRole) => {
          const meta = USER_ROLE_META[userRole];
          return (
            <Card key={userRole} withBorder radius="md" padding="lg">
              <Group justify="space-between" align="flex-start">
                <Stack gap={3}>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                    {meta.label}
                  </Text>
                  <Text size="xl" fw={700}>{counts[userRole]}</Text>
                </Stack>
                <ThemeIcon color={meta.color} variant="light" size="lg" radius="md">
                  {roleIcons[userRole]}
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
              placeholder="Search by email"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select
              label="Role"
              placeholder="All roles"
              clearable
              data={roleOptions}
              value={roleFilter}
              onChange={setRoleFilter}
              w={180}
            />
          </Group>
          <Badge variant="light" size="lg">{filteredUsers.length} users</Badge>
        </Group>

        {loading ? (
          <Center py={60}><Loader /></Center>
        ) : filteredUsers.length === 0 ? (
          <Center py={60}>
            <Stack align="center" gap="xs">
              <ThemeIcon variant="light" color="gray" size={48} radius="xl">
                <IconUsers size={24} />
              </ThemeIcon>
              <Text fw={600}>No users found</Text>
              <Text size="sm" c="dimmed">Try changing the search or role filter.</Text>
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
                  <Table.Th>Created</Table.Th>
                  <Table.Th ta="right">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredUsers.map((user) => {
                  const meta = roleMeta(user.role);
                  const isCurrentUser = user.id === currentUserId;
                  return (
                    <Table.Tr key={user.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar color={meta.color} radius="xl">{initials(user.email)}</Avatar>
                          <Box>
                            <Group gap="xs">
                              <Text fw={600} size="sm">{user.email}</Text>
                              {isCurrentUser && <Badge size="xs" variant="outline">You</Badge>}
                            </Group>
                            <Text size="xs" c="dimmed">ID: {user.id.slice(0, 8)}</Text>
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
                        <Text size="sm">
                          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(user.createdAt))}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle" aria-label={`Manage ${user.email}`}>
                              <IconDotsVertical size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconShield size={16} />}
                              onClick={() => {
                                setRole(USER_ROLES.includes(user.role as UserRole) ? user.role as UserRole : "staff");
                                setEditUser(user);
                              }}
                            >
                              Change role
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconKey size={16} />}
                              onClick={() => {
                                setPassword("");
                                setPasswordUser(user);
                              }}
                            >
                              Reset password
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={16} />}
                              disabled={isCurrentUser}
                              onClick={() => setDeleteUser(user)}
                            >
                              Delete user
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
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
        opened={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="Add user"
        centered
      >
        <Stack>
          <TextInput
            label="Email"
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Temporary password"
            description="Use at least 8 characters."
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
          <Select
            label="Role"
            data={roleOptions}
            value={role}
            onChange={(value) => value && setRole(value as UserRole)}
            allowDeselect={false}
          />
          <Alert color={USER_ROLE_META[role].color} variant="light">
            {USER_ROLE_META[role].description}
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={saving} disabled={!email || password.length < 8} onClick={createUser}>
              Create user
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!editUser} onClose={() => setEditUser(null)} title="Change user role" centered>
        <Stack>
          <Text size="sm">Update access for <Text span fw={700}>{editUser?.email}</Text>.</Text>
          <Select
            label="Role"
            data={roleOptions}
            value={role}
            onChange={(value) => value && setRole(value as UserRole)}
            allowDeselect={false}
          />
          <Alert color={USER_ROLE_META[role].color} variant="light">
            {USER_ROLE_META[role].description}
          </Alert>
          {editUser?.id === currentUserId && role !== "admin" && (
            <Alert color="orange" icon={<IconAlertCircle size={16} />}>
              Your current session will lose admin access after this change.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button loading={saving} onClick={updateRole}>Save role</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!passwordUser} onClose={() => setPasswordUser(null)} title="Reset password" centered>
        <Stack>
          <Text size="sm">Set a new password for <Text span fw={700}>{passwordUser?.email}</Text>.</Text>
          <PasswordInput
            label="New password"
            description="Use at least 8 characters."
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPasswordUser(null)}>Cancel</Button>
            <Button loading={saving} disabled={password.length < 8} onClick={resetPassword}>
              Update password
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deleteUser} onClose={() => setDeleteUser(null)} title="Delete user" centered>
        <Stack>
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            This permanently deletes the account and all data owned by it through cascading relations.
          </Alert>
          <Text size="sm">
            Delete <Text span fw={700}>{deleteUser?.email}</Text>? This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button color="red" loading={saving} onClick={removeUser}>Delete user</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
