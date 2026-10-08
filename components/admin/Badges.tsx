"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPrinter, IconQrcode, IconRefresh, IconSearch } from "@tabler/icons-react";

interface BadgeRow {
  id: string;
  name: string;
  email: string;
  reissued: number;
}

interface PrintItem {
  id: string;
  name: string;
  email: string;
  image: string;
}

const SIZES = ["25", "50", "100"];
const CHUNK = 100;

async function readError(response: Response) {
  return (await response.json().catch(() => null))?.error ?? "Please try again.";
}

const qrImage = (text: string, width: number) => QRCode.toDataURL(text, { width, margin: 1, errorCorrectionLevel: "M" });

// Prints 24 badges to an A4 sheet. It is only on the page while printing.
function PrintSheet({ items }: { items: PrintItem[] }) {
  return (
    <div className="badge-print-sheet">
      {items.map((item) => (
        <div key={item.id} className="badge-print-cell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" width={96} height={96} />
          <div className="badge-print-name">{item.name}</div>
          <div className="badge-print-email">{item.email}</div>
        </div>
      ))}
    </div>
  );
}

const printCss = `
.badge-print-sheet { display: none; }
@media print {
  @page { size: A4; margin: 10mm; }
  body * { visibility: hidden !important; }
  .badge-print-sheet, .badge-print-sheet * { visibility: visible !important; }
  .badge-print-sheet { display: grid !important; position: absolute; left: 0; top: 0; width: 100%;
    grid-template-columns: repeat(3, 1fr); grid-auto-rows: 34mm; }
  .badge-print-cell { display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 1px dashed #999; padding: 1mm; break-inside: avoid; overflow: hidden; }
  .badge-print-cell img { width: 24mm; height: 24mm; }
  .badge-print-name { font: 700 8.5pt sans-serif; text-align: center; line-height: 1.1; max-width: 100%; }
  .badge-print-email { font: 6.5pt sans-serif; color: #444; text-align: center; max-width: 100%; overflow-wrap: anywhere; }
}`;

export function Badges() {
  const [rows, setRows] = useState<BadgeRow[]>([]);
  const [paging, setPaging] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState("25");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<{ name: string; email: string; image: string } | null>(null);
  const [reissuing, setReissuing] = useState<BadgeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<PrintItem[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size });
      if (debounced.trim()) params.set("search", debounced.trim());
      const response = await fetch(`/api/admin/badges?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setRows(data.badges);
      setPaging(data.paging);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load badges");
    } finally {
      setLoading(false);
    }
  }, [page, size, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  // The sheet is made, the browser prints it, and then it goes away.
  useEffect(() => {
    if (!sheet) return;
    const done = () => setSheet(null);
    window.addEventListener("afterprint", done, { once: true });
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
    };
  }, [sheet]);

  const pageIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  const togglePage = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) allOnPage ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllMatching = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set("search", debounced.trim());
      const response = await fetch(`/api/admin/badges/ids?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const { ids } = (await response.json()) as { ids: string[] };
      setSelected(new Set(ids));
      setMatching(ids);
    } catch (caught) {
      notifications.show({ title: "Unable to select", message: caught instanceof Error ? caught.message : "Please try again.", color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (row: BadgeRow) => {
    try {
      const response = await fetch(`/api/admin/badges/${row.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setPreview({ name: data.name, email: data.email, image: await qrImage(data.token, 280) });
    } catch (caught) {
      notifications.show({ title: "Unable to show the badge", message: caught instanceof Error ? caught.message : "Please try again.", color: "red" });
    }
  };

  const printIds = async (ids: string[]) => {
    setBusy(true);
    try {
      const items: PrintItem[] = [];
      for (let start = 0; start < ids.length; start += CHUNK) {
        const response = await fetch("/api/admin/badges/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(start, start + CHUNK) }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const { badges } = (await response.json()) as { badges: { id: string; name: string; email: string; token: string }[] };
        for (const badge of badges) items.push({ id: badge.id, name: badge.name, email: badge.email, image: await qrImage(badge.token, 240) });
      }
      if (items.length === 0) throw new Error("Nobody to print.");
      setSheet(items);
    } catch (caught) {
      notifications.show({ title: "Unable to print", message: caught instanceof Error ? caught.message : "Please try again.", color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const reissue = async () => {
    if (!reissuing) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/badges/${reissuing.id}/reissue`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      notifications.show({ title: "Badge reissued", message: `${reissuing.name} has a new badge. It shows in My Badge, or print it again.`, color: "green" });
      setReissuing(null);
      await load();
    } catch (caught) {
      notifications.show({ title: "Unable to reissue", message: caught instanceof Error ? caught.message : "Please try again.", color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <Stack gap="lg">
      <style>{printCss}</style>
      <Box>
        <Text size="sm" c="dimmed" mb={4}>Administration</Text>
        <Title order={2}>Badges</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Each badge is signed by Exima and belongs to one person. People can also show theirs from My Badge in the staff store, so printing is optional. Only people who still have access get one.
        </Text>
      </Box>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="md" align="flex-end">
          <Group align="flex-end" flex={1}>
            <TextInput
              label="Search"
              placeholder="Search by name or email"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => changeFilter(() => { setSearch(event.currentTarget.value); setMatching(null); })}
              style={{ flex: 1, minWidth: 220, maxWidth: 360 }}
            />
            <Select label="Per page" data={SIZES} value={size} onChange={(value) => changeFilter(() => setSize(value ?? "25"))} allowDeselect={false} w={100} />
          </Group>
          <Group gap="xs">
            {selected.size > 0 && (
              <Button variant="subtle" onClick={() => { setSelected(new Set()); setMatching(null); }}>Clear ({selected.size})</Button>
            )}
            <Button leftSection={<IconPrinter size={18} />} disabled={selected.size === 0} loading={busy} onClick={() => printIds([...selected])}>
              Print Selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </Group>
        </Group>

        {error && <Alert color="red" mb="md">{error}</Alert>}

        {allOnPage && paging.total > rows.length && !(matching && matching.length >= paging.total) && (
          <Alert variant="light" color="blue" mb="md">
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm">The {rows.length} people on this page are selected.</Text>
              <Button size="xs" variant="light" loading={busy} onClick={selectAllMatching}>Select all {paging.total} that match</Button>
            </Group>
          </Alert>
        )}

        {loading ? (
          <Center py={60}><Loader /></Center>
        ) : rows.length === 0 ? (
          <Center py={60}><Text c="dimmed">Nobody matches.</Text></Center>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <Checkbox aria-label="Select this page" checked={allOnPage} indeterminate={someOnPage && !allOnPage} onChange={togglePage} />
                  </Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Reissued</Table.Th>
                  <Table.Th ta="right">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Checkbox aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} />
                    </Table.Td>
                    <Table.Td><Text size="sm" fw={600}>{row.name}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{row.email}</Text></Table.Td>
                    <Table.Td>{row.reissued > 0 ? <Badge variant="light" color="orange">{row.reissued}x</Badge> : <Text size="sm" c="dimmed">Never</Text>}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Show badge"><ActionIcon variant="subtle" aria-label={`Show badge of ${row.name}`} onClick={() => openPreview(row)}><IconQrcode size={18} /></ActionIcon></Tooltip>
                        <Tooltip label="Print"><ActionIcon variant="subtle" aria-label={`Print badge of ${row.name}`} onClick={() => printIds([row.id])}><IconPrinter size={18} /></ActionIcon></Tooltip>
                        <Tooltip label="Reissue"><ActionIcon variant="subtle" color="red" aria-label={`Reissue badge of ${row.name}`} onClick={() => setReissuing(row)}><IconRefresh size={18} /></ActionIcon></Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {paging.totalPages > 1 && (
          <Group justify="space-between" mt="md">
            <Text size="sm" c="dimmed">{paging.total} people, page {paging.page} of {paging.totalPages}</Text>
            <Pagination value={paging.page} total={paging.totalPages} onChange={setPage} />
          </Group>
        )}
      </Paper>

      <Modal opened={!!preview} onClose={() => setPreview(null)} title="Badge" centered size="sm">
        {preview && (
          <Stack align="center" gap="xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.image} alt={`Badge of ${preview.name}`} width={260} height={260} />
            <Text fw={700}>{preview.name}</Text>
            <Text size="xs" c="dimmed">{preview.email}</Text>
          </Stack>
        )}
      </Modal>

      <Modal opened={!!reissuing} onClose={() => setReissuing(null)} title="Reissue badge" centered>
        <Stack>
          <Text size="sm">
            Cancel every badge of <Text span fw={700}>{reissuing?.name}</Text> and make a new one? Cards already printed for them stop working at once.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setReissuing(null)}>Cancel</Button>
            <Button color="red" loading={busy} onClick={reissue}>Reissue</Button>
          </Group>
        </Stack>
      </Modal>

      {sheet && createPortal(<PrintSheet items={sheet} />, document.body)}
    </Stack>
  );
}
