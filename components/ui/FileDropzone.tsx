"use client";

import {
  Box,
  Group,
  Stack,
  Text,
  ThemeIcon,
  useMantineColorScheme,
  rem,
  CloseButton,
  Paper,
  Progress,
} from "@mantine/core";
import {
  IconUpload,
  IconFile,
  IconFileTypeCsv,
  IconFileTypeXls,
  IconFileTypeDoc,
  IconFileTypePdf,
  IconPhoto,
  IconX,
  IconCheck,
} from "@tabler/icons-react";
import { useRef, useState, useCallback, ReactNode } from "react";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
  loading?: boolean;
  value?: File | null;
  error?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  showPreview?: boolean;
  uploadProgress?: number;
}

const fileTypeIcons: Record<string, ReactNode> = {
  csv: <IconFileTypeCsv size={32} />,
  xlsx: <IconFileTypeXls size={32} />,
  xls: <IconFileTypeXls size={32} />,
  doc: <IconFileTypeDoc size={32} />,
  docx: <IconFileTypeDoc size={32} />,
  pdf: <IconFileTypePdf size={32} />,
  png: <IconPhoto size={32} />,
  jpg: <IconPhoto size={32} />,
  jpeg: <IconPhoto size={32} />,
  gif: <IconPhoto size={32} />,
};

function getFileIcon(filename: string): ReactNode {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return fileTypeIcons[extension] || <IconFile size={32} />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function FileDropzone({
  onFileSelect,
  onFileRemove,
  accept = ".csv,.xlsx",
  maxSize = 10 * 1024 * 1024, // 10MB default
  disabled = false,
  loading = false,
  value,
  error,
  title = "Tarik file ke sini atau klik untuk unggah",
  description,
  icon,
  showPreview = true,
  uploadProgress,
}: FileDropzoneProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error || localError;

  const validateFile = useCallback(
    (file: File): boolean => {
      setLocalError(null);

      // Check file size
      if (file.size > maxSize) {
        setLocalError(`Ukuran file melebihi batas ${formatFileSize(maxSize)}`);
        return false;
      }

      // Check file type
      if (accept) {
        const acceptedTypes = accept
          .split(",")
          .map((t) => t.trim().toLowerCase());
        const fileExtension =
          "." + (file.name.split(".").pop()?.toLowerCase() || "");
        const fileMimeType = file.type.toLowerCase();

        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith(".")) {
            return fileExtension === type;
          }
          if (type.includes("*")) {
            const [mainType] = type.split("/");
            return fileMimeType.startsWith(mainType + "/");
          }
          return fileMimeType === type;
        });

        if (!isAccepted) {
          setLocalError(`Jenis file tidak didukung. Diterima: ${accept}`);
          return false;
        }
      }

      return true;
    },
    [accept, maxSize],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (validateFile(file)) {
        onFileSelect(file);
      }
    },
    [validateFile, onFileSelect],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !loading) {
        setIsDragging(true);
      }
    },
    [disabled, loading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || loading) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [disabled, loading, handleFileSelect],
  );

  const handleClick = useCallback(() => {
    if (!disabled && !loading && inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled, loading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
      // Reset input value so same file can be selected again
      e.target.value = "";
    },
    [handleFileSelect],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLocalError(null);
      onFileRemove?.();
    },
    [onFileRemove],
  );

  const getBorderColor = () => {
    if (displayError) return "var(--mantine-color-red-6)";
    if (isDragging) return "var(--mantine-color-brand-6)";
    if (value) return "var(--mantine-color-green-6)";
    return isDark
      ? "var(--mantine-color-dark-4)"
      : "var(--mantine-color-gray-3)";
  };

  const getBackgroundColor = () => {
    if (isDragging) {
      return isDark ? "rgba(111, 139, 106, 0.1)" : "rgba(111, 139, 106, 0.05)";
    }
    if (value) {
      return isDark ? "rgba(111, 139, 106, 0.05)" : "rgba(111, 139, 106, 0.03)";
    }
    return isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)";
  };

  // Show file preview if a file is selected
  if (value && showPreview) {
    return (
      <Box>
        <Paper
          p="md"
          radius="lg"
          style={{
            border: `2px solid ${getBorderColor()}`,
            backgroundColor: getBackgroundColor(),
            transition: "all 0.2s ease",
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="md" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <ThemeIcon size={48} radius="md" variant="light" color="green">
                {getFileIcon(value.name)}
              </ThemeIcon>
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {value.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatFileSize(value.size)}
                </Text>
                {uploadProgress !== undefined && uploadProgress < 100 && (
                  <Progress
                    value={uploadProgress}
                    size="sm"
                    radius="xl"
                    mt={4}
                    animated
                  />
                )}
                {uploadProgress === 100 && (
                  <Group gap={4}>
                    <IconCheck size={14} color="var(--mantine-color-green-6)" />
                    <Text size="xs" c="green">
                      Siap diproses
                    </Text>
                  </Group>
                )}
              </Stack>
            </Group>

            {onFileRemove && !loading && (
              <CloseButton
                size="sm"
                radius="xl"
                onClick={handleRemove}
                aria-label="Hapus file"
              />
            )}
          </Group>
        </Paper>

        {displayError && (
          <Text size="xs" c="red" mt="xs">
            {displayError}
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        style={{ display: "none" }}
        disabled={disabled || loading}
      />

      <Box
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${getBorderColor()}`,
          borderRadius: rem(12),
          padding: rem(32),
          backgroundColor: getBackgroundColor(),
          cursor: disabled || loading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.2s ease",
          textAlign: "center",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !loading && !isDragging) {
            e.currentTarget.style.borderColor = isDark
              ? "var(--mantine-color-dark-3)"
              : "var(--mantine-color-gray-4)";
            e.currentTarget.style.backgroundColor = isDark
              ? "rgba(255, 255, 255, 0.03)"
              : "rgba(0, 0, 0, 0.02)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.borderColor = getBorderColor();
            e.currentTarget.style.backgroundColor = getBackgroundColor();
          }
        }}
      >
        <Stack gap="md" align="center">
          <ThemeIcon
            size={64}
            radius="xl"
            variant="light"
            color={isDragging ? "brand" : "gray"}
            style={{
              transition: "all 0.2s ease",
              transform: isDragging ? "scale(1.1)" : "scale(1)",
            }}
          >
            {icon || <IconUpload size={32} />}
          </ThemeIcon>

          <Stack gap={4} align="center">
            <Text size="md" fw={600} c={isDragging ? "brand" : undefined}>
              {isDragging ? "Letakkan file di sini" : title}
            </Text>
            <Text size="sm" c="dimmed">
              {description ||
                `Format didukung: ${accept.replace(/\./g, "").toUpperCase()}`}
            </Text>
            <Text size="xs" c="dimmed">
              Ukuran file maksimum: {formatFileSize(maxSize)}
            </Text>
          </Stack>
        </Stack>
      </Box>

      {displayError && (
        <Text size="xs" c="red" mt="xs">
          {displayError}
        </Text>
      )}
    </Box>
  );
}

// Compact variant for smaller spaces
interface CompactDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  placeholder?: string;
  value?: File | null;
}

export function CompactDropzone({
  onFileSelect,
  accept = ".csv,.xlsx",
  disabled = false,
  placeholder = "Klik atau letakkan file",
  value,
}: CompactDropzoneProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
        disabled={disabled}
      />

      <Group
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        gap="sm"
        p="sm"
        style={{
          border: `1px dashed ${
            isDragging
              ? "var(--mantine-color-brand-6)"
              : isDark
                ? "var(--mantine-color-dark-4)"
                : "var(--mantine-color-gray-4)"
          }`,
          borderRadius: rem(8),
          cursor: disabled ? "not-allowed" : "pointer",
          backgroundColor: isDragging
            ? isDark
              ? "rgba(111, 139, 106, 0.1)"
              : "rgba(111, 139, 106, 0.05)"
            : "transparent",
          transition: "all 0.15s ease",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <IconUpload size={18} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>
          {value ? value.name : placeholder}
        </Text>
      </Group>
    </Box>
  );
}
