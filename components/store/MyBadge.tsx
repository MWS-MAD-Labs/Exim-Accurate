"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Alert, Button, Loader, Modal, Stack, Text } from "@mantine/core";
import { IconQrcode } from "@tabler/icons-react";

// The staff badge on a phone: show it at the kiosk or the cashier instead of a card.
export function MyBadge() {
  const [opened, setOpened] = useState(false);
  const [badge, setBadge] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const open = async () => {
    setOpened(true);
    setError(null);
    try {
      const response = await fetch("/api/me/badge", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to load your badge");
      setBadge(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your badge");
    }
  };

  useEffect(() => {
    if (opened && badge && canvas.current) {
      void QRCode.toCanvas(canvas.current, badge.token, { width: 260, margin: 2, errorCorrectionLevel: "M" });
    }
  }, [opened, badge]);

  return (
    <>
      <Button variant="default" leftSection={<IconQrcode size={17} />} onClick={open}>
        My Badge
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="My Badge" centered>
        <Stack align="center" gap="xs">
          {error ? (
            <Alert color="red" w="100%">{error}</Alert>
          ) : badge ? (
            <>
              <canvas ref={canvas} aria-label="Your staff badge QR code" />
              <Text fw={600}>{badge.name}</Text>
              <Text size="xs" c="dimmed" ta="center">Show this at the kiosk or the cashier. It is only for you; do not share a screenshot.</Text>
            </>
          ) : (
            <Loader />
          )}
        </Stack>
      </Modal>
    </>
  );
}
