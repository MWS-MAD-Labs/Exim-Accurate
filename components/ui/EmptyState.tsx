"use client";

import {
  Stack,
  Text,
  Title,
  Button,
  ThemeIcon,
  Box,
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import {
  IconDatabase,
  IconFileOff,
  IconFolderOff,
  IconInbox,
  IconPlugConnectedX,
  IconSearch,
  IconShoppingCartOff,
  IconCloudOff,
} from "@tabler/icons-react";
import Image from "next/image";
import { ReactNode } from "react";
import { useLanguage } from "@/lib/language";

type EmptyStateVariant =
  | "no-data"
  | "no-results"
  | "no-connection"
  | "empty-folder"
  | "empty-cart"
  | "no-credentials"
  | "error"
  | "custom";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "filled" | "light" | "outline" | "subtle";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: "sm" | "md" | "lg";
}

const variantConfig: Record<
  EmptyStateVariant,
  { icon: ReactNode; title: string; description: string }
> = {
  "no-data": {
    icon: <IconDatabase size={48} stroke={1.5} />,
    title: "Belum ada data",
    description: "Mulai dengan menambahkan data agar tampil di sini.",
  },
  "no-results": {
    icon: <IconSearch size={48} stroke={1.5} />,
    title: "Hasil tidak ditemukan",
    description:
      "Coba ubah pencarian atau filter untuk menemukan data yang Anda cari.",
  },
  "no-connection": {
    icon: <IconCloudOff size={48} stroke={1.5} />,
    title: "Kesalahan koneksi",
    description:
      "Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.",
  },
  "empty-folder": {
    icon: <IconFolderOff size={48} stroke={1.5} />,
    title: "Folder ini kosong",
    description: "Unggah file atau buat item baru untuk memulai.",
  },
  "empty-cart": {
    icon: <IconShoppingCartOff size={48} stroke={1.5} />,
    title: "Keranjang Anda kosong",
    description: "Scan barang untuk menambahkannya ke keranjang.",
  },
  "no-credentials": {
    icon: <IconPlugConnectedX size={48} stroke={1.5} />,
    title: "Belum ada akun terhubung",
    description: "Hubungkan akun Accurate untuk mulai impor dan ekspor data.",
  },
  error: {
    icon: <IconFileOff size={48} stroke={1.5} />,
    title: "Terjadi kesalahan",
    description:
      "Terjadi kesalahan tak terduga. Silakan coba lagi atau hubungi dukungan.",
  },
  custom: {
    icon: <IconInbox size={48} stroke={1.5} />,
    title: "Tidak ada isi",
    description: "Bagian ini kosong.",
  },
};

const sizeConfig = {
  sm: {
    iconSize: 64,
    titleSize: "lg" as const,
    spacing: "md" as const,
    maxWidth: 280,
  },
  md: {
    iconSize: 80,
    titleSize: "xl" as const,
    spacing: "lg" as const,
    maxWidth: 360,
  },
  lg: {
    iconSize: 100,
    titleSize: "h2" as const,
    spacing: "xl" as const,
    maxWidth: 440,
  },
};

export function EmptyState({
  variant = "no-data",
  title,
  description,
  icon,
  action,
  secondaryAction,
  size = "md",
}: EmptyStateProps) {
  const colorScheme = useAppColorScheme();
  const { t } = useLanguage();
  const isDark = colorScheme === "dark";

  const config = variantConfig[variant];
  const sizeSettings = sizeConfig[size];

  const displayTitle =
    title ||
    (
      t.dashboard.emptyState[
        variant as keyof typeof t.dashboard.emptyState
      ] as any
    )?.title ||
    config.title;
  const displayDescription =
    description ||
    (
      t.dashboard.emptyState[
        variant as keyof typeof t.dashboard.emptyState
      ] as any
    )?.description ||
    config.description;
  const displayIcon = icon || config.icon;

  return (
    <Stack
      align="center"
      justify="center"
      gap={sizeSettings.spacing}
      py="xl"
      style={{ minHeight: 200 }}
    >
      <Box
        style={{
          width: sizeSettings.iconSize,
          height: sizeSettings.iconSize,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark
            ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(135deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 100%)",
          border: isDark
            ? "2px dashed rgba(255,255,255,0.1)"
            : "2px dashed rgba(0,0,0,0.1)",
        }}
      >
        <ThemeIcon
          size={sizeSettings.iconSize * 0.6}
          radius="xl"
          variant="transparent"
          c="dimmed"
        >
          {displayIcon}
        </ThemeIcon>
      </Box>

      <Stack
        align="center"
        gap="xs"
        style={{ maxWidth: sizeSettings.maxWidth, textAlign: "center" }}
      >
        <Title order={size === "lg" ? 2 : size === "md" ? 3 : 4}>
          {displayTitle}
        </Title>
        <Text c="dimmed" size={size === "sm" ? "sm" : "md"}>
          {displayDescription}
        </Text>
      </Stack>

      {(action || secondaryAction) && (
        <Stack gap="xs" align="center">
          {action && (
            <Button
              variant={action.variant || "filled"}
              onClick={action.onClick}
              size={size === "sm" ? "sm" : "md"}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="subtle"
              onClick={secondaryAction.onClick}
              size={size === "sm" ? "xs" : "sm"}
            >
              {secondaryAction.label}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

// Illustration-based empty state for more visual impact
interface IllustratedEmptyStateProps extends EmptyStateProps {
  illustrationUrl?: string;
}

export function IllustratedEmptyState({
  illustrationUrl,
  ...props
}: IllustratedEmptyStateProps) {
  const colorScheme = useAppColorScheme();
  const { t } = useLanguage();
  const isDark = colorScheme === "dark";
  const sizeSettings = sizeConfig[props.size || "md"];

  if (!illustrationUrl) {
    return <EmptyState {...props} />;
  }

  return (
    <Stack
      align="center"
      justify="center"
      gap={sizeSettings.spacing}
      py="xl"
      style={{ minHeight: 200 }}
    >
      <Box
        style={{
          width: sizeSettings.iconSize * 1.5,
          height: sizeSettings.iconSize * 1.5,
          opacity: isDark ? 0.8 : 1,
        }}
      >
        <Image
          src={illustrationUrl}
          alt=""
          width={sizeSettings.iconSize * 1.5}
          height={sizeSettings.iconSize * 1.5}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
          unoptimized
          loader={({ src }) => src}
        />
      </Box>

      <Stack
        align="center"
        gap="xs"
        style={{ maxWidth: sizeSettings.maxWidth, textAlign: "center" }}
      >
        <Title order={props.size === "lg" ? 2 : props.size === "md" ? 3 : 4}>
          {props.title ||
            (
              t.dashboard.emptyState[
                props.variant as keyof typeof t.dashboard.emptyState
              ] as any
            )?.title ||
            variantConfig[props.variant || "no-data"].title}
        </Title>
        <Text c="dimmed" size={props.size === "sm" ? "sm" : "md"}>
          {props.description ||
            (
              t.dashboard.emptyState[
                props.variant as keyof typeof t.dashboard.emptyState
              ] as any
            )?.description ||
            variantConfig[props.variant || "no-data"].description}
        </Text>
      </Stack>

      {(props.action || props.secondaryAction) && (
        <Stack gap="xs" align="center">
          {props.action && (
            <Button
              variant={props.action.variant || "filled"}
              onClick={props.action.onClick}
              size={props.size === "sm" ? "sm" : "md"}
            >
              {props.action.label}
            </Button>
          )}
          {props.secondaryAction && (
            <Button
              variant="subtle"
              onClick={props.secondaryAction.onClick}
              size={props.size === "sm" ? "xs" : "sm"}
            >
              {props.secondaryAction.label}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
