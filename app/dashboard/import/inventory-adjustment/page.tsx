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
  Checkbox,
  ScrollArea,
  List,
  useMantineColorScheme,
  Transition,
  Progress,
  Divider,
  rem,
} from "@mantine/core";
import { useState, useEffect } from "react";
import {
  IconAlertCircle,
  IconUpload,
  IconCheck,
  IconFileImport,
  IconPlugConnected,
  IconArrowRight,
  IconArrowLeft,
  IconFileCheck,
  IconFileX,
  IconSettings,
  IconX,
  IconDownload,
  IconInfoCircle,
  IconListCheck,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { Stepper, StepperCard, type Step } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";

interface Credential {
  id: string;
  appKey: string;
}

interface ValidatedRow {
  itemCode: string;
  itemName?: string;
  type: string;
  quantity: number;
  unit: string;
  adjustmentDate: string;
  referenceNumber?: string;
  warehouse?: string;
  description?: string;
  valid: boolean;
  errors: string[];
}

export default function ImportInventoryAdjustmentPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { colorScheme } = useMantineColorScheme();

  const steps: Step[] = [
    {
      id: "select-account",
      title: t.inventoryAdjustment.import.steps.selectAccount,
      description: t.inventoryAdjustment.import.steps.selectAccountDesc,
    },
    {
      id: "upload",
      title: t.inventoryAdjustment.import.steps.upload,
      description: t.inventoryAdjustment.import.steps.uploadDesc,
    },
    {
      id: "validate",
      title: t.inventoryAdjustment.import.steps.review,
      description: t.inventoryAdjustment.import.steps.reviewDesc,
    },
  ];

  const templateColumns = [
    {
      name: "date",
      required: true,
      description: t.inventoryAdjustment.import.upload.template.columns.date,
    },
    {
      name: "number",
      required: false,
      description: t.inventoryAdjustment.import.upload.template.columns.number,
    },
    {
      name: "description",
      required: false,
      description:
        t.inventoryAdjustment.import.upload.template.columns.description,
    },
    {
      name: "itemNo",
      required: true,
      description: t.inventoryAdjustment.import.upload.template.columns.itemNo,
    },
    {
      name: "quantity",
      required: true,
      description:
        t.inventoryAdjustment.import.upload.template.columns.quantity,
    },
    {
      name: "unit",
      required: true,
      description: t.inventoryAdjustment.import.upload.template.columns.unit,
    },
    {
      name: "warehouse",
      required: false,
      description:
        t.inventoryAdjustment.import.upload.template.columns.warehouse,
    },
    {
      name: "detailDescription",
      required: false,
      description:
        t.inventoryAdjustment.import.upload.template.columns.detailDescription,
    },
  ];
  const isDark = colorScheme === "dark";

  const [activeStep, setActiveStep] = useState(0);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<string | null>(
    null,
  );
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [useAutoNumbering, setUseAutoNumbering] = useState(true);
  const [importResults, setImportResults] = useState<{
    successCount: number;
    failedCount: number;
    errors: string[];
  } | null>(null);

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

  const handleValidate = async () => {
    if (!selectedCredential) {
      setError("Silakan pilih kredensial");
      return;
    }

    if (!file) {
      setError("Silakan pilih file");
      return;
    }

    setError("");
    setValidating(true);
    setValidatedRows([]);
    setValidationErrors([]);
    setImportResults(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("credentialId", selectedCredential);

      const response = await fetch(
        "/api/import/inventory-adjustment/validate",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Validasi gagal");
      }

      const result = await response.json();
      setValidatedRows(result.results);
      setValidationErrors(result.errors);

      if (result.valid) {
        notifications.show({
          title: "Validasi Berhasil",
          message: `Semua ${result.results.length} baris valid dan siap diimpor`,
          color: "green",
          icon: <IconCheck size={16} />,
        });
      } else {
        notifications.show({
          title: "Masalah Validasi Ditemukan",
          message: `Ditemukan ${result.errors.length} kesalahan yang harus diperbaiki`,
          color: "orange",
          icon: <IconAlertCircle size={16} />,
        });
      }
    } catch (err: any) {
      setError(err.message);
      notifications.show({
        title: "Validasi Gagal",
        message: err.message,
        color: "red",
        icon: <IconX size={16} />,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!selectedCredential || !file) {
      return;
    }

    if (validationErrors.length > 0) {
      setError("Perbaiki kesalahan validasi sebelum mengimpor");
      return;
    }

    setError("");
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("credentialId", selectedCredential);
      formData.append("useAutoNumbering", String(useAutoNumbering));

      const response = await fetch("/api/import/inventory-adjustment", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Impor gagal");
      }

      const result = await response.json();
      setImportResults(result);

      if (result.success && result.failedCount === 0) {
        notifications.show({
          title: "Impor Berhasil",
          message: `Berhasil mengimpor semua ${result.successCount} adjustment ke Accurate`,
          color: "green",
          icon: <IconCheck size={16} />,
          autoClose: 5000,
        });
      } else if (result.successCount > 0) {
        notifications.show({
          title: "Impor Berhasil Sebagian",
          message: `${result.successCount} adjustment berhasil diimpor, ${result.failedCount} gagal.`,
          color: "orange",
          icon: <IconAlertCircle size={16} />,
          autoClose: 5000,
        });
      } else {
        notifications.show({
          title: "Impor Gagal",
          message: `Gagal mengimpor adjustment. Ditemukan ${result.failedCount} kesalahan.`,
          color: "red",
          icon: <IconX size={16} />,
        });
      }
    } catch (err: any) {
      setError(err.message);
      notifications.show({
        title: "Impor Gagal",
        message: err.message,
        color: "red",
        icon: <IconX size={16} />,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setValidatedRows([]);
    setValidationErrors([]);
    setImportResults(null);
    setError("");
    setActiveStep(1);
  };

  const canProceedToStep2 = selectedCredential !== null;
  const canProceedToStep3 = file !== null;
  const validRowsCount = validatedRows.filter((r) => r.valid).length;
  const invalidRowsCount = validatedRows.filter((r) => !r.valid).length;
  const isValidationComplete = validatedRows.length > 0;
  const canImport =
    isValidationComplete && validationErrors.length === 0 && validRowsCount > 0;

  const handleNext = () => {
    if (activeStep === 1 && canProceedToStep3) {
      handleValidate();
    }
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const selectedCredentialData = credentials.find(
    (c) => c.id === selectedCredential,
  );

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="sm" mb={4}>
            <ThemeIcon size={32} radius="md" variant="light" color="brand">
              <IconFileImport size={18} />
            </ThemeIcon>
            <Title order={2}>{t.inventoryAdjustment.import.title}</Title>
          </Group>
          <Text c="dimmed" size="sm">
            {t.inventoryAdjustment.import.description}
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
                title={t.inventoryAdjustment.import.steps.selectAccount}
                description={
                  t.inventoryAdjustment.import.steps.selectAccountDesc
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
                              ? "var(--mantine-color-green-6)"
                              : isDark
                                ? "var(--mantine-color-dark-4)"
                                : "var(--mantine-color-gray-3)",
                            borderWidth: isSelected ? 2 : 1,
                            backgroundColor: isSelected
                              ? isDark
                                ? "rgba(64, 192, 87, 0.1)"
                                : "rgba(64, 192, 87, 0.05)"
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
                              color={isSelected ? "green" : "gray"}
                            >
                              <IconPlugConnected size={20} />
                            </ThemeIcon>
                            {isSelected && (
                              <ThemeIcon
                                size={24}
                                radius="xl"
                                color="green"
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
                            {language === "id"
                              ? "Klik untuk memilih"
                              : "Click to select"}
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

        {/* Step 2: Upload File */}
        <Transition mounted={activeStep === 1} transition="fade" duration={200}>
          {(styles) => (
            <Box style={styles}>
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                {/* Upload Card */}
                <StepperCard
                  title={language === "id" ? "Unggah File" : "Upload Your File"}
                  description={
                    language === "id"
                      ? "Pilih file CSV atau Excel Anda"
                      : "Select your CSV or Excel file"
                  }
                >
                  <Stack gap="lg">
                    <FileDropzone
                      onFileSelect={setFile}
                      onFileRemove={() => setFile(null)}
                      accept=".csv,.xlsx"
                      maxSize={10 * 1024 * 1024}
                      value={file}
                      title={
                        language === "id"
                          ? "Tarik file ke sini atau klik untuk memilih"
                          : "Drop file here or click to choose"
                      }
                      description={
                        language === "id"
                          ? "Mendukung file CSV dan Excel (XLSX)"
                          : "Supports CSV and Excel (XLSX) files"
                      }
                    />

                    <Divider />

                    <Box>
                      <Group gap="sm" mb="sm">
                        <ThemeIcon size={24} radius="md" variant="light">
                          <IconSettings size={14} />
                        </ThemeIcon>
                        <Text size="sm" fw={600}>
                          {language === "id" ? "Opsi Impor" : "Import Options"}
                        </Text>
                      </Group>

                      <Checkbox
                        label={
                          language === "id"
                            ? "Gunakan Penomoran Otomatis"
                            : "Use Auto Numbering"
                        }
                        description={
                          language === "id"
                            ? "Jika dicentang, Accurate akan membuat nomor adjustment otomatis"
                            : "When enabled, Accurate will auto-generate adjustment numbers"
                        }
                        checked={useAutoNumbering}
                        onChange={(event) =>
                          setUseAutoNumbering(event.currentTarget.checked)
                        }
                        styles={{
                          body: { alignItems: "flex-start" },
                          label: { fontWeight: 500 },
                        }}
                      />
                    </Box>
                  </Stack>
                </StepperCard>

                {/* Template Info Card */}
                <StepperCard
                  title="Format Templat"
                  description="Kolom yang wajib ada pada file impor"
                >
                  <Stack gap="md">
                    <Alert
                      variant="light"
                      color="blue"
                      radius="md"
                      icon={<IconInfoCircle size={16} />}
                    >
                      <Text size="sm">
                        File Anda harus memiliki kolom wajib berikut. Nama kolom
                        harus sama persis.
                      </Text>
                    </Alert>

                    <ScrollArea h={280}>
                      <Stack gap="xs">
                        {templateColumns.map((col) => (
                          <Paper
                            key={col.name}
                            p="sm"
                            radius="md"
                            withBorder
                            style={{
                              borderColor: col.required
                                ? isDark
                                  ? "var(--mantine-color-dark-4)"
                                  : "var(--mantine-color-gray-3)"
                                : isDark
                                  ? "var(--mantine-color-dark-5)"
                                  : "var(--mantine-color-gray-2)",
                            }}
                          >
                            <Group justify="space-between" wrap="nowrap">
                              <Group gap="sm" wrap="nowrap">
                                <Badge
                                  size="xs"
                                  variant={col.required ? "filled" : "light"}
                                  color={col.required ? "blue" : "gray"}
                                >
                                  {col.required ? "Wajib" : "Opsional"}
                                </Badge>
                                <Text size="sm" fw={600} ff="monospace">
                                  {col.name}
                                </Text>
                              </Group>
                            </Group>
                            <Text size="xs" c="dimmed" mt={4}>
                              {col.description}
                            </Text>
                          </Paper>
                        ))}
                      </Stack>
                    </ScrollArea>

                    <Button
                      variant="light"
                      leftSection={<IconDownload size={16} />}
                      fullWidth
                      onClick={() => {
                        // Download template logic here
                        const headers = templateColumns
                          .map((c) => c.name)
                          .join(",");
                        const blob = new Blob([headers + "\n"], {
                          type: "text/csv",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "inventory_adjustment_template.csv";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Unduh Template
                    </Button>
                  </Stack>
                </StepperCard>
              </SimpleGrid>
            </Box>
          )}
        </Transition>

        {/* Step 3: Validate & Import */}
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
                      ? "linear-gradient(135deg, rgba(64, 192, 87, 0.1) 0%, rgba(32, 201, 151, 0.1) 100%)"
                      : "linear-gradient(135deg, rgba(64, 192, 87, 0.05) 0%, rgba(32, 201, 151, 0.05) 100%)",
                    border: isDark
                      ? "1px solid var(--mantine-color-dark-4)"
                      : "1px solid var(--mantine-color-gray-2)",
                  }}
                >
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap="md">
                      <Text size="lg" fw={600}>
                        Ringkasan Impor
                      </Text>
                      <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="lg">
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
                              Akun
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
                            <IconFileImport size={18} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              File
                            </Text>
                            <Text size="sm" fw={600} lineClamp={1}>
                              {file?.name || "-"}
                            </Text>
                          </Box>
                        </Group>

                        <Group gap="sm">
                          <ThemeIcon
                            size={36}
                            radius="md"
                            variant="light"
                            color="green"
                          >
                            <IconFileCheck size={18} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              Baris Valid
                            </Text>
                            <Text size="sm" fw={600} c="green">
                              {validRowsCount}
                            </Text>
                          </Box>
                        </Group>

                        <Group gap="sm">
                          <ThemeIcon
                            size={36}
                            radius="md"
                            variant="light"
                            color="red"
                          >
                            <IconFileX size={18} />
                          </ThemeIcon>
                          <Box>
                            <Text size="xs" c="dimmed">
                              Baris Tidak Valid
                            </Text>
                            <Text size="sm" fw={600} c="red">
                              {invalidRowsCount}
                            </Text>
                          </Box>
                        </Group>
                      </SimpleGrid>
                    </Stack>

                    <Group gap="sm">
                      <Button
                        variant="light"
                        onClick={handleValidate}
                        loading={validating}
                        leftSection={<IconListCheck size={16} />}
                      >
                        {language === "id" ? "Validasi Ulang" : "Revalidate"}
                      </Button>
                      <Button
                        size="lg"
                        leftSection={<IconUpload size={20} />}
                        onClick={handleImport}
                        loading={importing}
                        disabled={!canImport}
                        color="green"
                        style={{
                          boxShadow: canImport
                            ? "0 4px 14px rgba(64, 192, 87, 0.4)"
                            : undefined,
                        }}
                      >
                        {language === "id"
                          ? "Impor ke Accurate"
                          : "Import to Accurate"}
                      </Button>
                    </Group>
                  </Group>
                </Paper>

                {/* Import Results */}
                {importResults && (
                  <Alert
                    variant="light"
                    color={
                      importResults.failedCount === 0
                        ? "green"
                        : importResults.successCount > 0
                          ? "orange"
                          : "red"
                    }
                    radius="md"
                    icon={
                      importResults.failedCount === 0 ? (
                        <IconCheck size={20} />
                      ) : (
                        <IconAlertCircle size={20} />
                      )
                    }
                    title={
                      importResults.failedCount === 0
                        ? language === "id"
                          ? "Impor Berhasil"
                          : "Import Successful"
                        : importResults.successCount > 0
                          ? language === "id"
                            ? "Impor Berhasil Sebagian"
                            : "Import Partially Successful"
                          : language === "id"
                            ? "Impor Gagal"
                            : "Import Failed"
                    }
                  >
                    <Stack gap="sm">
                      <Text size="sm">
                        {language === "id"
                          ? "Berhasil diimpor:"
                          : "Successfully imported:"}{" "}
                        <strong>{importResults.successCount}</strong> |{" "}
                        {language === "id" ? "Gagal" : "Failed"}:{" "}
                        <strong>{importResults.failedCount}</strong>
                      </Text>

                      {importResults.errors.length > 0 && (
                        <List size="sm" spacing="xs">
                          {importResults.errors.slice(0, 5).map((err, idx) => (
                            <List.Item key={idx}>{err}</List.Item>
                          ))}
                          {importResults.errors.length > 5 && (
                            <List.Item>
                              {language === "id"
                                ? `...dan ${importResults.errors.length - 5} kesalahan lainnya`
                                : `...and ${importResults.errors.length - 5} more errors`}
                            </List.Item>
                          )}
                        </List>
                      )}

                      <Button
                        variant="light"
                        size="xs"
                        onClick={handleReset}
                        w="fit-content"
                      >
                        Impor File Lain
                      </Button>
                    </Stack>
                  </Alert>
                )}

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="red"
                    variant="light"
                    radius="md"
                    title={`${validationErrors.length} Kesalahan Validasi`}
                  >
                    <List size="sm" spacing="xs">
                      {validationErrors.slice(0, 10).map((err, idx) => (
                        <List.Item key={idx}>{err}</List.Item>
                      ))}
                      {validationErrors.length > 10 && (
                        <List.Item>
                          ...dan {validationErrors.length - 10} kesalahan
                          lainnya
                        </List.Item>
                      )}
                    </List>
                  </Alert>
                )}

                {/* Validation Preview */}
                <StepperCard
                  title={language === "id" ? "Pratinjau Data" : "Data Preview"}
                  description={
                    isValidationComplete
                      ? `${validatedRows.length} baris dimuat • ${validRowsCount} valid • ${invalidRowsCount} tidak valid`
                      : language === "id"
                        ? "Hasil validasi akan tampil di sini"
                        : "Validation results will appear here"
                  }
                >
                  {validating ? (
                    <Stack gap="md" py="xl" align="center">
                      <Text c="dimmed">
                        {language === "id"
                          ? "Memvalidasi file Anda..."
                          : "Validating your file..."}
                      </Text>
                      <Progress value={100} size="sm" animated w={200} />
                    </Stack>
                  ) : !isValidationComplete ? (
                    <EmptyState
                      variant="no-data"
                      title={
                        language === "id"
                          ? "Belum ada hasil validasi"
                          : "No validation results yet"
                      }
                      description={
                        language === "id"
                          ? "Klik 'Validasi Ulang' untuk memeriksa file"
                          : "Click 'Revalidate' to check your file"
                      }
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
                            <Table.Th w={80}>Status</Table.Th>
                            <Table.Th>Kode Barang</Table.Th>
                            <Table.Th>Nama Barang</Table.Th>
                            <Table.Th>Tipe</Table.Th>
                            <Table.Th>Kuantitas</Table.Th>
                            <Table.Th>Satuan</Table.Th>
                            <Table.Th>Tanggal</Table.Th>
                            <Table.Th>Gudang</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {validatedRows.map((row, idx) => (
                            <Table.Tr
                              key={idx}
                              style={{
                                backgroundColor: row.valid
                                  ? undefined
                                  : isDark
                                    ? "rgba(250, 82, 82, 0.1)"
                                    : "rgba(250, 82, 82, 0.05)",
                              }}
                            >
                              <Table.Td>
                                {row.valid ? (
                                  <Badge
                                    size="sm"
                                    variant="light"
                                    color="green"
                                    leftSection={<IconCheck size={10} />}
                                  >
                                    Valid
                                  </Badge>
                                ) : (
                                  <Badge
                                    size="sm"
                                    variant="light"
                                    color="red"
                                    leftSection={<IconX size={10} />}
                                  >
                                    Tidak Valid
                                  </Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Badge size="sm" variant="light" color="gray">
                                  {row.itemCode}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" lineClamp={1}>
                                  {row.itemName || "-"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge
                                  size="sm"
                                  variant="light"
                                  color={
                                    row.type === "Penambahan" ? "green" : "red"
                                  }
                                >
                                  {row.type}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" fw={500}>
                                  {row.quantity}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{row.unit}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{row.adjustmentDate}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" c="dimmed">
                                  {row.warehouse || "-"}
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
                leftSection={<IconCheck size={16} />}
                onClick={handleImport}
                loading={importing}
                disabled={!canImport}
                color="green"
              >
                {t.inventoryAdjustment.import.actions.import}
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
