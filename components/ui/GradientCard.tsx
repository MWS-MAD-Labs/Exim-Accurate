"use client";

import {
  Paper,
  Box,
  Text,
  Title,
  Group,
  MantineColor,
  Stack,
} from "@mantine/core";
import { useAppColorScheme } from "@/lib/use-app-color-scheme";
import { ReactNode } from "react";

interface GradientCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  gradient?: "brand" | "accent" | "success" | "danger" | "violet" | "cyan" | "dark";
  headerContent?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  hoverable?: boolean;
  padding?: "xs" | "sm" | "md" | "lg" | "xl";
  minHeight?: number | string;
}

const gradients: Record<string, { light: string; dark: string }> = {
  brand: {
    light: "linear-gradient(135deg, #6F8B6A 0%, #486142 100%)",
    dark: "linear-gradient(135deg, #486142 0%, #202B1D 100%)",
  },
  accent: {
    light: "linear-gradient(135deg, #B98429 0%, #956A22 100%)",
    dark: "linear-gradient(135deg, #956A22 0%, #74521D 100%)",
  },
  success: {
    light: "linear-gradient(135deg, #6F8B6A 0%, #486142 100%)",
    dark: "linear-gradient(135deg, #486142 0%, #2D402A 100%)",
  },
  danger: {
    light: "linear-gradient(135deg, #CC6666 0%, #AD4E4E 100%)",
    dark: "linear-gradient(135deg, #AD4E4E 0%, #703333 100%)",
  },
  violet: {
    light: "linear-gradient(135deg, #6F8B6A 0%, #486142 100%)",
    dark: "linear-gradient(135deg, #486142 0%, #2D402A 100%)",
  },
  cyan: {
    light: "linear-gradient(135deg, #6098B0 0%, #3D6579 100%)",
    dark: "linear-gradient(135deg, #4C7E95 0%, #31515F 100%)",
  },
  dark: {
    light: "linear-gradient(135deg, #3A4B31 0%, #202B1D 100%)",
    dark: "linear-gradient(135deg, #2C3927 0%, #1D271B 100%)",
  },
};

export function GradientCard({
  title,
  subtitle,
  icon,
  children,
  gradient = "brand",
  headerContent,
  footer,
  onClick,
  hoverable = false,
  padding = "md",
  minHeight,
}: GradientCardProps) {
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  const gradientStyle = gradients[gradient] || gradients.brand;
  const isClickable = !!onClick || hoverable;

  return (
    <Paper
      radius="lg"
      shadow="sm"
      style={{
        overflow: "hidden",
        transition: "all 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        minHeight,
        border: isDark
          ? "1px solid rgba(255, 255, 255, 0.1)"
          : "1px solid rgba(0, 0, 0, 0.05)",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = isDark
            ? "0 12px 40px rgba(0, 0, 0, 0.4)"
            : "0 12px 40px rgba(0, 0, 0, 0.15)";
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "";
        }
      }}
    >
      {/* Gradient Header */}
      {(title || subtitle || icon || headerContent) && (
        <Box
          p={padding}
          style={{
            background: isDark ? gradientStyle.dark : gradientStyle.light,
            color: "white",
          }}
        >
          {headerContent || (
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                {title && (
                  <Title order={4} c="white" fw={600}>
                    {title}
                  </Title>
                )}
                {subtitle && (
                  <Text size="sm" c="rgba(255, 255, 255, 0.8)">
                    {subtitle}
                  </Text>
                )}
              </Stack>
              {icon && (
                <Box
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    borderRadius: "50%",
                    padding: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {icon}
                </Box>
              )}
            </Group>
          )}
        </Box>
      )}

      {/* Content */}
      <Box p={padding}>{children}</Box>

      {/* Footer */}
      {footer && (
        <Box
          p={padding}
          pt={0}
          style={{
            borderTop: isDark
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid rgba(0, 0, 0, 0.05)",
          }}
        >
          {footer}
        </Box>
      )}
    </Paper>
  );
}

// Variant with full gradient background
interface FullGradientCardProps {
  children: ReactNode;
  gradient?: "brand" | "accent" | "success" | "danger" | "violet" | "cyan" | "dark";
  onClick?: () => void;
  hoverable?: boolean;
  padding?: "xs" | "sm" | "md" | "lg" | "xl";
  minHeight?: number | string;
}

export function FullGradientCard({
  children,
  gradient = "brand",
  onClick,
  hoverable = false,
  padding = "lg",
  minHeight,
}: FullGradientCardProps) {
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  const gradientStyle = gradients[gradient] || gradients.brand;
  const isClickable = !!onClick || hoverable;

  return (
    <Paper
      radius="lg"
      p={padding}
      style={{
        background: isDark ? gradientStyle.dark : gradientStyle.light,
        color: "white",
        transition: "all 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        minHeight,
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = "0 12px 40px rgba(0, 0, 0, 0.3)";
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "";
        }
      }}
    >
      {children}
    </Paper>
  );
}

// Bordered card with subtle gradient accent
interface BorderGradientCardProps {
  children: ReactNode;
  gradient?: "brand" | "accent" | "success" | "danger" | "violet" | "cyan";
  onClick?: () => void;
  hoverable?: boolean;
  padding?: "xs" | "sm" | "md" | "lg" | "xl";
  minHeight?: number | string;
  borderPosition?: "top" | "left" | "bottom" | "right";
  borderWidth?: number;
}

export function BorderGradientCard({
  children,
  gradient = "brand",
  onClick,
  hoverable = false,
  padding = "md",
  minHeight,
  borderPosition = "top",
  borderWidth = 4,
}: BorderGradientCardProps) {
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";

  const gradientStyle = gradients[gradient] || gradients.brand;
  const isClickable = !!onClick || hoverable;

  const getBorderStyle = () => {
    const grad = isDark ? gradientStyle.dark : gradientStyle.light;
    switch (borderPosition) {
      case "top":
        return { borderTop: `${borderWidth}px solid transparent`, borderImage: `${grad} 1` };
      case "left":
        return { borderLeft: `${borderWidth}px solid transparent`, borderImage: `${grad} 1` };
      case "bottom":
        return { borderBottom: `${borderWidth}px solid transparent`, borderImage: `${grad} 1` };
      case "right":
        return { borderRight: `${borderWidth}px solid transparent`, borderImage: `${grad} 1` };
      default:
        return {};
    }
  };

  return (
    <Paper
      radius="lg"
      p={padding}
      shadow="sm"
      style={{
        ...getBorderStyle(),
        transition: "all 0.2s ease",
        cursor: isClickable ? "pointer" : "default",
        minHeight,
        overflow: "hidden",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = isDark
            ? "0 8px 32px rgba(0, 0, 0, 0.3)"
            : "0 8px 32px rgba(0, 0, 0, 0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "";
        }
      }}
    >
      {children}
    </Paper>
  );
}
