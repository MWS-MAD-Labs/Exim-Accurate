"use client";

import {
  Title,
  Paper,
  Stack,
  Button,
  Table,
  ActionIcon,
  Group,
  Text,
  LoadingOverlay,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState, useEffect, useRef } from "react";
import { IconTrash, IconCheck, IconKey } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLanguage } from "@/lib/language";

interface Credential {
  id: string;
  appKey: string;
  host: string | null;
  createdAt: string;
}

export default function CredentialsPage() {
  const { t } = useLanguage();
  const notificationsText = t.dashboard.credentials.notifications;
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const handledStatus = useRef<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("status");
    const message = searchParams.get("message");
    const signature = `${status}|${message}`;

    if (!status || handledStatus.current === signature) {
      return;
    }

    handledStatus.current = signature;

    if (status === "connected") {
      notifications.show({
        title: notificationsText.connectedTitle,
        message: notificationsText.connectedMessage,
        color: "green",
        icon: <IconCheck size={16} />,
      });
      fetchCredentials();
    } else if (status === "error") {
      notifications.show({
        title: notificationsText.errorTitle,
        message: message || notificationsText.errorGeneric,
        color: "red",
      });
    }
  }, [
    searchParams,
    notificationsText.connectedTitle,
    notificationsText.connectedMessage,
    notificationsText.errorTitle,
    notificationsText.errorGeneric,
  ]);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const response = await fetch("/api/credentials");
      if (response.ok) {
        const data = await response.json();
        setCredentials(data);
      }
    } catch (err) {
      console.error("Failed to fetch credentials", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    modals.openConfirmModal({
      title: t.dashboard.credentials.disconnectTooltip,
      children: <Text size="sm">{t.dashboard.credentials.disconnectConfirm}</Text>,
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        setLoadingDeleteId(id);
        try {
          const response = await fetch(`/api/credentials?id=${id}`, {
            method: "DELETE",
          });

          if (response.ok) {
            notifications.show({
              title: t.dashboard.credentials.notifications.deleteSuccessTitle,
              message: t.dashboard.credentials.notifications.deleteSuccessMessage,
              color: "green",
              icon: <IconCheck size={16} />,
            });
            fetchCredentials();
          }
        } catch (err) {
          notifications.show({
            title: t.dashboard.credentials.notifications.deleteErrorTitle,
            message: t.dashboard.credentials.notifications.deleteErrorMessage,
            color: "red",
          });
        } finally {
          setLoadingDeleteId(null);
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <Title order={1}>{t.dashboard.credentials.title}</Title>

      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={3}>{t.dashboard.credentials.connectTitle}</Title>
          <Text c="dimmed" size="sm">
            {t.dashboard.credentials.connectDescription}
          </Text>
          <Button
            component="a"
            href="/api/accurate/authorize"
            leftSection={<IconKey size={16} />}
            variant="light"
          >
            {t.dashboard.credentials.connectButton}
          </Button>
        </Stack>
      </Paper>

      <Paper p="md" withBorder pos="relative">
        <LoadingOverlay visible={loading} />
        <Title order={3} mb="md">
          {t.dashboard.credentials.connectedAccountsTitle}
        </Title>

        {credentials.length === 0 && !loading ? (
          <EmptyState
            variant="no-credentials"
            title={t.dashboard.emptyState.noCredentials.title}
            description={t.dashboard.emptyState.noCredentials.description}
            action={{
              label: t.dashboard.credentials.connectButton,
              onClick: () => (window.location.href = "/api/accurate/authorize"),
            }}
          />
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.dashboard.credentials.table.appKey}</Table.Th>
                <Table.Th>{t.dashboard.credentials.table.host}</Table.Th>
                <Table.Th>{t.dashboard.credentials.table.connectedAt}</Table.Th>
                <Table.Th>{t.dashboard.credentials.table.action}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {credentials.map((cred) => (
                <Table.Tr key={cred.id}>
                  <Table.Td>{cred.appKey}</Table.Td>
                  <Table.Td>
                    {cred.host || t.dashboard.credentials.table.notDetected}
                  </Table.Td>
                  <Table.Td>
                    {new Date(cred.createdAt).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip
                        label={t.dashboard.credentials.disconnectTooltip}
                        withArrow
                      >
                        <ActionIcon
                          color="red"
                          onClick={() => handleDelete(cred.id)}
                          loading={loadingDeleteId === cred.id}
                          aria-label={t.dashboard.credentials.disconnectTooltip}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
