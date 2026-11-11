import { Box, Group, Text } from "@mantine/core";

interface BrandMarkProps {
  size?: number;
  // false shows only the S badge (the collapsed sidebar).
  withWordmark?: boolean;
}

export function BrandMark({ size = 36, withWordmark = true }: BrandMarkProps) {
  return (
    <Group gap="xs" wrap="nowrap" aria-label="Sade">
      <Box
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          background: "var(--sade-brand-gradient)",
          display: "grid",
          placeItems: "center",
          color: "#FFFAF4",
          fontFamily: "var(--font-jakarta-sans), sans-serif",
          fontSize: Math.round(size * 0.52),
          fontWeight: 800,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        S
      </Box>
      {withWordmark && <Text
        size="xl"
        fw={800}
        style={{
          color: "var(--sade-wordmark)",
          fontFamily: "var(--font-jakarta-sans), sans-serif",
          letterSpacing: "-0.03em",
        }}
      >
        Sade
      </Text>}
    </Group>
  );
}
