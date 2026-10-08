"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Alert, Box, Button, Card, Center, Group, Loader, Pagination, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPrinter, IconSearch } from "@tabler/icons-react";

interface BadgeRow {
  id: string;
  name: string;
  email: string;
  version: number;
  token: string;
}

const PAGE_SIZE = 12;

function BadgeQr({ token }: { token: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) void QRCode.toCanvas(canvas.current, token, { width: 150, margin: 1, errorCorrectionLevel: "M" });
  }, [token]);
  return <canvas ref={canvas} />;
}

export function Badges() {
  const [rows, setRows] = useState<BadgeRow[]>([]);
  const [paging, setPaging] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (debounced.trim()) params.set("search", debounced.trim());
      const response = await fetch(`/api/admin/badges?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to load badges");
      setRows(data.badges);
      setPaging(data.paging);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load badges");
    } finally {
      setLoading(false);
    }
  }, [page, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const reissue = async (row: BadgeRow) => {
    if (!window.confirm(`Cancel every badge of ${row.name} and make a new one? Cards already printed for them stop working.`)) return;
    const response = await fetch(`/api/admin/badges/${row.id}/reissue`, { method: "POST" });
    if (!response.ok) {
      notifications.show({ title: "Unable to reissue", message: (await response.json().catch(() => null))?.error ?? "Please try again.", color: "red" });
      return;
    }
    notifications.show({ title: "Badge reissued", message: `${row.name} has a new badge. Print it again or open My Badge.`, color: "green" });
    await load();
  };

  return (
    <Stack gap="lg">
      <style>{`@media print { .no-print { display: none !important; } .print-grid { grid-template-columns: repeat(3, 1fr) !important; } body { background: white; } }`}</style>
      <Group justify="space-between" align="flex-end" className="no-print">
        <Box>
          <Text size="sm" c="dimmed" mb={4}>Administration</Text>
          <Title order={2}>Badges</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Each badge is signed by Exima and belongs to one person. People can also show theirs from My Badge in the staff store, so printing is optional.
          </Text>
        </Box>
        <Button leftSection={<IconPrinter size={18} />} onClick={() => window.print()} disabled={rows.length === 0}>
          Print This Page
        </Button>
      </Group>

      <TextInput
        className="no-print"
        label="Search"
        placeholder="Search by name or email"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }}
        maw={360}
      />

      {error && <Alert color="red" className="no-print">{error}</Alert>}
      {loading ? (
        <Center py={60}><Loader /></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} className="print-grid">
          {rows.map((row) => (
            <Card key={row.id} withBorder radius="md" padding="md" style={{ breakInside: "avoid" }}>
              <Stack align="center" gap={6}>
                <BadgeQr token={row.token} />
                <Text fw={700} ta="center">{row.name}</Text>
                <Text size="xs" c="dimmed" ta="center">{row.email}</Text>
                <Button size="xs" variant="subtle" color="red" className="no-print" onClick={() => reissue(row)}>
                  Reissue
                </Button>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {paging.totalPages > 1 && (
        <Group justify="space-between" className="no-print">
          <Text size="sm" c="dimmed">{paging.total} people, page {paging.page} of {paging.totalPages}</Text>
          <Pagination value={paging.page} total={paging.totalPages} onChange={setPage} />
        </Group>
      )}
    </Stack>
  );
}
