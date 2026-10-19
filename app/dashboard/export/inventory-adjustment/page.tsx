"use client";

import {
  Title,
  Paper,
  Stack,
  Button,
  Select,
  Table,
  Alert,
  Group,
  Text,
  Box,
  Badge,
  ThemeIcon,
  SimpleGrid,
  Divider,
  ScrollArea,
  Tooltip,
  ActionIcon,
  useMantineColorScheme,
  rem,
  Transition,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useState, useEffect } from "react";
import {
  IconAlertCircle,
  IconDownload,
  IconFileExport,
  IconDatabase,
  IconCalendar,
  IconSettings,
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconEye,
  IconFileTypeCsv,
  IconFileTypeXls,
  IconFileCode,
  IconPlugConnected,
  IconRefresh,
  IconInfoCircle,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { Stepper, StepperCard, type Step } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLanguage } from "@/lib/language";
import { useRouter } from "next/navigation";

interface Credential {
  id: string;
  appKey: string;
}

interface PreviewRecord {
  adjustmentNumber: string;
  date: string;
  itemName: string;
  itemCode: string;
  type: string;
  quantity: number;
  unit: string;
  warehouse?: string;
  description?: string;
}

const formatOptions = [
  {
    value: "csv",
    label: "CSV",
    description: "Nilai dipisahkan koma",
    icon: <IconFileTypeCsv size={24} />,
    color: "green",
  },
  {
    value: "xlsx",
    label: "Excel (XLSX)",
    description: "Format Microsoft Excel",
    icon: <IconFileTypeXls size={24} />,
    color: "blue",
  },
  {
    value: "json",
    label: "JSON",
    description: "Notasi Objek JavaScript",
    icon: <IconFileCode size={24} />,
    color: "orange",
  },
];

export default function ExportInventoryAdjustmentPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  const steps: Step[] = [
    {
      id: "select-account",
      title: t.inventoryAdjustment.export.steps.selectAccount,
      description: t.inventoryAdjustment.export.steps.selectAccountDesc,
    },
    {
      id: "configure",
      title: t.inventoryAdjustment.export.steps.config,
      description: t.inventoryAdjustment.export.steps.configDesc,
    },
    {
      id: "preview",
      title: t.inventoryAdjustment.export.steps.preview,
      description: t.inventoryAdjustment.export.steps.previewDesc,
    },
  ];

  const formatOptions = [
    {
      value: "csv",
      label: t.inventoryAdjustment.export.config.formats.csv.label,
      description: t.inventoryAdjustment.export.config.formats.csv.description,
      icon: <IconFileTypeCsv size={24} />,
      color: "green",
    },
    {
      value: "xlsx",
      label: t.inventoryAdjustment.export.config.formats.xlsx.label,
      description: t.inventoryAdjustment.export.config.formats.xlsx.description,
      icon: <IconFileTypeXls size={24} />,
      color: "blue",
    },
    {
      value: "json",
      label: t.inventoryAdjustment.export.config.formats.json.label,
      description: t.inventoryAdjustment.export.config.formats.json.description,
      icon: <IconFileCode size={24} />,
      color: "orange",
    },
  ];

  const [activeStep, setActiveStep] = useState(0);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<string | null>(
    null,
  );
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [format, setFormat] = useState<string>("csv");
  const [loading, setLoading] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [preview, setPreview] = useState<PreviewRecord[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalRecords, setTotalRecords] = useState<number | null>(null);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    setLoadingCredentials(true);
    try {
      const response = await fetch("/api/credentials");
      if (response.ok) {
        const data = await response.json();
        setCredentials(data);
        // Auto-select if only one credential
        if (data.length === 1) {
          setSelectedCredential(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch credentials", err);
    } finally {
      setLoadingCredentials(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCredential) {
      setError("Silakan pilih kredensial");
      return;
    }

    if (!dateRange[0] || !dateRange[1]) {
      setError("Silakan pilih rentang tanggal");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/export/inventory-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: selectedCredential,
          startDate: dayjs(dateRange[0]).format("YYYY-MM-DD"),
          endDate: dayjs(dateRange[1]).format("YYYY-MM-DD"),
          format,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ekspor gagal");
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `export.${format}`;

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      notifications.show({
        title: "Ekspor Berhasil",
        message: `${filename} berhasil diunduh`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      setError(err.message);
      notifications.show({
        title: "Ekspor Gagal",
        message: err.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPreview = async () => {
    if (!selectedCredential || !dateRange[0] || !dateRange[1]) return;

    setPreviewLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/export/inventory-adjustment/preview?` +
          new URLSearchParams({
            credentialId: selectedCredential,
            startDate: dayjs(dateRange[0]).format("YYYY-MM-DD"),
            endDate: dayjs(dateRange[1]).format("YYYY-MM-DD"),
          }),
      );

      if (response.ok) {
        const data = await response.json();
        setPreview(data.preview || []);
        setTotalRecords(data.total || data.preview?.length || 0);
      } else {
        const data = await response.json();
        throw new Error(data.error || "Gagal memuat pratinjau");
      }
    } catch (err: any) {
      setError(err.message);
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const canProceedToStep2 = selectedCredential !== null;
  const canProceedToStep3 = dateRange[0] !== null && dateRange[1] !== null;

  const handleNext = () => {
    if (activeStep === 1 && canProceedToStep3) {
      // Fetch preview when moving to step 3
      fetchPreview();
    }
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const selectedCredentialData = credentials.find(
    (c) => c.id === selectedCredential,
  );
  const selectedFormatData = formatOptions.find((f) => f.value === format);

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="sm" mb={4}>
            <ThemeIcon size={32} radius="md" variant="light" color="brand">
              <IconFileExport size={18} />
            </ThemeIcon>
            <Title order={2}>{t.inventoryAdjustment.export.title}</Title>
          </Group>
          <Text c="dimmed" size="sm">
            {t.inventoryAdjustment.export.description}
          </Text>
        </Box>
        <Badge size="lg" variant="light" color="blue">
          {language === "id" ? "Langkah" : "Step"} {activeStep + 1} /{" "}
          {steps.length}
        </Badge>
      </Group>

      {/* Stepper */}
      <Paper
        p="md"
        radius="lg"
        style={{
          border: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
        }}
      >
        <Stepper
          steps={steps}
          activeStep={activeStep}
          onStepClick={setActiveStep}
          allowClickNavigation
          size="md"
        />
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="red"
          variant="light"
          radius="md"
          withCloseButton
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}

      {/* Step Content */}
      <Box>
        {/* Step 1: Select Account */}
        <Transition mounted={activeStep === 0} transition="fade" duration={200}>
          {(styles) => (
            <Box style={styles}>
              <StepperCard
                title={t.inventoryAdjustment.export.steps.selectAccount}
                description={
                  t.inventoryAdjustment.export.steps.selectAccountDesc
                }
              >
                {loadingCredentials ? (
                  <Stack gap="md" py="xl" align="center">
                    <Text c="dimmed">{t.common.processing}</Text>
                  </Stack>
                ) : credentials.length === 0 ? (
                  <EmptyState
                    variant="no-credentials"
                    title={t.dashboard.emptyState.noCredentials.title}
                    description={
                      t.dashboard.emptyState.noCredentials.description
                    }
                    action={{
                      label: t.dashboard.credentials.connectButton,
                      onClick: () => router.push("/dashboard/credentials"),
                    }}
                  />
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                    {credentials.map((cred) => {
                      const isSelected = selectedCredential === cred.id;
                      return (
                        <Paper
                          key={cred.id}
                          p="lg"
                          radius="lg"
                          withBorder
                          style={{
                            cursor: "pointer",
                            borderColor: isSelected
                              ? "var(--mantine-color-brand-6)"
                              : isDark
                                ? "var(--mantine-color-dark-4)"
                                : "var(--mantine-color-gray-3)",
                            borderWidth: isSelected ? 2 : 1,
                            backgroundColor: isSelected
                              ? isDark
                                ? "rgba(34, 139, 230, 0.1)"
                                : "rgba(34, 139, 230, 0.05)"
                              : undefined,
                            transition: "all 0.2s ease",
                          }}
                          onClick={() => setSelectedCredential(cred.id)}
                        >
                          <Group justify="space-between" mb="sm">
                            <ThemeIcon
                              size={40}
                              radius="md"
                              variant="light"
                              color={isSelected ? "brand" : "gray"}
                            >
                              <IconPlugConnected size={20} />
                            </ThemeIcon>
                            {isSelected && (
                              <ThemeIcon
                                size={24}
                                radius="xl"
                                color="brand"
                                variant="filled"
                              >
                                <IconCheck size={14} />
                              </ThemeIcon>
                            )}
                          </Group>
                          <Text fw={600} size="sm">
                            {cred.appKey}
                          </Text>
                          <Text size="xs" c="dimmed" mt={4}>
                            Klik untuk memilih
                          </Text>
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                )}
              </StepperCard>
            </Box>
          )}
        </Transition>

        {/* Step 2: Configure */}
        <Transition mounted={activeStep === 1} transition="fade" duration={200}>
          {(styles) => (
            <Box style={styles}>
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                {/* Date Range Card */}
                <StepperCard
                  title={t.inventoryAdjustment.export.config.dateRange}
                  description={t.inventoryAdjustment.export.steps.configDesc}
                >
                  <Stack gap="md">
                    <Group gap="sm">
                      <ThemeIcon size={32} radius="md" variant="light">
                        <IconCalendar size={18} />
                      </ThemeIcon>
                      <Box>
                        <Text size="sm" fw={500}>
                          {t.inventoryAdjustment.export.config.dateRange}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t.inventoryAdjustment.export.steps.configDesc}
                        </Text>
                      </Box>
                    </Group>

                    <DatePickerInput
                      type="range"
                      label={t.inventoryAdjustment.export.config.dateRange}
                      placeholder={
                        language === "id"
                          ? "Pilih rentang tanggal"
                          : "Select date range"
                      }
                      value={dateRange}
                      onChange={setDateRange}
                      size="md"
                      radius="md"
                      clearable
                      valueFormat="DD MMM YYYY"
                    />

                    {dateRange[0] && dateRange[1] && (
                      <Alert
                        variant="light"
                        color="blue"
                        radius="md"
                        icon={<IconInfoCircle size={16} />}
                      >
                        <Text size="sm">
                          Mengekspor data dari{" "}
                          <strong>
                            {dayjs(dateRange[0]).format("DD MMM YYYY")}
                          </strong>{" "}
                          hingga{" "}
                          <strong>
                            {dayjs(dateRange[1]).format("DD MMM YYYY")}
                          </strong>{" "}
                          ({dayjs(dateRange[1]).diff(dateRange[0], "day") + 1}{" "}
                          hari)
                        </Text>
                      </Alert>
                    )}
                  </Stack>
                </StepperCard>

                {/* Format Card */}
                <StepperCard
                  title={t.inventoryAdjustment.export.config.format}
                  description={t.inventoryAdjustment.export.config.format}
                >
                  <Stack gap="md">
                    {formatOptions.map((option) => {
                      const isSelected = format === option.value;
                      return (
                        <Paper
                          key={option.value}
                          p="md"
                          radius="md"
                          withBorder
                          style={{
                            cursor: "pointer",
                            borderColor: isSelected
                              ? `var(--mantine-color-${option.color}-6)`
                              : isDark
                                ? "var(--mantine-color-dark-4)"
                                : "var(--mantine-color-gray-3)",
                            borderWidth: isSelected ? 2 : 1,
                            backgroundColor: isSelected
                              ? isDark
                                ? `rgba(var(--mantine-color-${option.color}-6-rgb), 0.1)`
                                : `rgba(var(--mantine-color-${option.color}-6-rgb), 0.05)`
                              : undefined,
                            transition: "all 0.2s ease",
                          }}
                          onClick={() => setFormat(option.value)}
                        >
                          <Group justify="space-between" wrap="nowrap">
                            <Group gap="md" wrap="nowrap">
                              <ThemeIcon
                                size={44}
                                radius="md"
                                variant="light"
                                color={isSelected ? option.color : "gray"}
                              >
                                {option.icon}
                              </ThemeIcon>
                              <Box>
                                <Text fw={600} size="sm">
                                  {option.label}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {option.description}
                                </Text>
                              </Box>
                            </Group>
                            {isSelected && (
                              <ThemeIcon
                                size={24}
                                radius="xl"
                                color={option.color}
                                variant="filled"
                              >
                                <IconCheck size={14} />
                              </ThemeIcon>
                            )}
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                </StepperCard>
              </SimpleGrid>
            </Box>
          )}
        </Transition>

        {/* Step 3: Preview & Export */}
        <Transition mounted={activeStep === 2} transition="fade" duration={200}>
          {(styles) => (
            <Box style={styles}>
              <Stack gap="lg">
                {/* Summary Card */}
                <Paper
                  p="lg"
                  radius="lg"
                  style={{
                    background: isDark
                      ? "linear-gradient(135deg, rgba(34, 139, 230, 0.1) 0%, rgba(121, 80, 242, 0.1) 100%)"
                      : "linear-gradient(135deg, rgba(34, 139, 230, 0.05) 0%, rgba(121, 80, 242, 0.05) 100%)",
                    border: isDark
                      ? "1px solid var(--mantine-color-dark-4)"
                      : "1px solid var(--mantine-color-gray-2)",
                  }}
                >
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap="md">
                      <Text size="lg" fw={600}>
                        {t.inventoryAdjustment.import.steps.review}
                      </Text>
                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
                        <Group gap="sm">
                          <ThemeIcon
                            size={36}
                            radius="md"
                            variant="light"
                            color="violet"
                          >
                            <IconPlugConnected size={18} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              {t.dashboard.nav.credentials}
                            </Text>
                            <Text size="sm" fw={600}>
                              {selectedCredentialData?.appKey || "-"}
                            </Text>
                          </Box>
                        </Group>

                        <Group gap="sm">
                          <ThemeIcon
                            size={36}
                            radius="md"
                            variant="light"
                            color="blue"
                          >
                            <IconCalendar size={18} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              {t.inventoryAdjustment.export.config.dateRange}
                            </Text>
                            <Text size="sm" fw={600}>
                              {dateRange[0] && dateRange[1]
                                ? `${dayjs(dateRange[0]).format(
                                    "DD/MM/YY",
                                  )} - ${dayjs(dateRange[1]).format(
                                    "DD/MM/YY",
                                  )}`
                                : "-"}
                            </Text>
                          </Box>
                        </Group>

                        <Group gap="sm">
                          <ThemeIcon
                            size={36}
                            radius="md"
                            variant="light"
                            color={selectedFormatData?.color || "gray"}
                          >
                            {selectedFormatData?.icon || (
                              <IconFileExport size={18} />
                            )}
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              {t.inventoryAdjustment.export.config.format}
                            </Text>
                            <Text size="sm" fw={600}>
                              {selectedFormatData?.label || "-"}
                            </Text>
                          </Box>
                        </Group>
                      </SimpleGrid>
                    </Stack>

                    <Button
                      size="lg"
                      leftSection={<IconDownload size={20} />}
                      onClick={handleExport}
                      loading={loading}
                      disabled={!canProceedToStep3}
                      style={{
                        background:
                          "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
                        boxShadow: "0 4px 14px rgba(34, 139, 230, 0.4)",
                      }}
                    >
                      Unduh Hasil Ekspor
                    </Button>
                  </Group>
                </Paper>

                {/* Preview Section */}
                <StepperCard
                  title={t.inventoryAdjustment.export.preview.title}
                  description={
                    totalRecords !== null
                      ? t.inventoryAdjustment.export.preview.subtitle.replace(
                          "{total}",
                          totalRecords.toString(),
                        )
                      : t.inventoryAdjustment.export.preview.title
                  }
                >
                  <Group justify="flex-end" mb="md">
                    <Button
                      variant="light"
                      size="sm"
                      leftSection={<IconRefresh size={16} />}
                      onClick={fetchPreview}
                      loading={previewLoading}
                    >
                      {t.inventoryAdjustment.import.actions.reset}
                    </Button>
                  </Group>

                  {previewLoading ? (
                    <Stack gap="md" py="xl" align="center">
                      <Text c="dimmed">{t.common.processing}</Text>
                    </Stack>
                  ) : preview.length === 0 ? (
                    <EmptyState
                      variant="no-data"
                      title={t.inventoryAdjustment.export.preview.empty}
                      description={t.inventoryAdjustment.export.preview.empty}
                      size="sm"
                    />
                  ) : (
                    <ScrollArea>
                      <Table
                        striped
                        highlightOnHover
                        withTableBorder
                        withColumnBorders
                        styles={{
                          th: {
                            backgroundColor: isDark
                              ? "var(--mantine-color-dark-6)"
                              : "var(--mantine-color-gray-0)",
                          },
                        }}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>
                              {
                                t.inventoryAdjustment.export.preview.table
                                  .number
                              }
                            </Table.Th>
                            <Table.Th>
                              {t.inventoryAdjustment.export.preview.table.date}
                            </Table.Th>
                            <Table.Th>
                              {t.inventoryAdjustment.export.preview.table.item}
                            </Table.Th>
                            <Table.Th>
                              {
                                t.inventoryAdjustment.import.upload.template
                                  .columns.itemNo
                              }
                            </Table.Th>
                            <Table.Th>
                              {language === "id" ? "Tipe" : "Type"}
                            </Table.Th>
                            <Table.Th>
                              {
                                t.inventoryAdjustment.export.preview.table
                                  .quantity
                              }
                            </Table.Th>
                            <Table.Th>
                              {t.inventoryAdjustment.export.preview.table.unit}
                            </Table.Th>
                            <Table.Th>
                              {
                                t.inventoryAdjustment.import.upload.template
                                  .columns.warehouse
                              }
                            </Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {preview.map((record, idx) => (
                            <Table.Tr key={idx}>
                              <Table.Td>
                                <Text size="sm" fw={500}>
                                  {record.adjustmentNumber}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{record.date}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" lineClamp={1}>
                                  {record.itemName}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge size="sm" variant="light" color="gray">
                                  {record.itemCode}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Badge
                                  size="sm"
                                  variant="light"
                                  color={
                                    record.type === "Penambahan"
                                      ? "green"
                                      : "red"
                                  }
                                >
                                  {record.type}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" fw={500}>
                                  {record.quantity}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{record.unit}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" c="dimmed">
                                  {record.warehouse || "-"}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  )}
                </StepperCard>
              </Stack>
            </Box>
          )}
        </Transition>
      </Box>

      {/* Navigation */}
      <Paper
        p="md"
        radius="lg"
        style={{
          border: isDark
            ? "1px solid var(--mantine-color-dark-4)"
            : "1px solid var(--mantine-color-gray-2)",
        }}
      >
        <Group justify="space-between">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={handleBack}
            disabled={activeStep === 0}
          >
            {t.inventoryAdjustment.export.actions.back}
          </Button>

          <Group gap="sm">
            {activeStep === 2 ? (
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={handleExport}
                loading={loading}
                disabled={!canProceedToStep3}
                color="green"
              >
                {t.inventoryAdjustment.export.actions.export}
              </Button>
            ) : (
              <Button
                rightSection={<IconArrowRight size={16} />}
                onClick={handleNext}
                disabled={
                  (activeStep === 0 && !canProceedToStep2) ||
                  (activeStep === 1 && !canProceedToStep3)
                }
              >
                {t.inventoryAdjustment.export.actions.next}
              </Button>
            )}
          </Group>
        </Group>
      </Paper>
    </Stack>
  );
}
