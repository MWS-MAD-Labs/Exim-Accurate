"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Box, Text, Loader, Stack, Center, Select, Group } from "@mantine/core";
import { IconCamera, IconAlertCircle } from "@tabler/icons-react";
import { useLanguage } from "@/lib/language";

interface PersistentScannerProps {
  onScan: (code: string) => void;
  scannerHeight?: number;
  disabled?: boolean;
}

export function PersistentScanner({
  onScan,
  scannerHeight = 300,
  disabled = false,
}: PersistentScannerProps) {
  const { language } = useLanguage();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<
    "initializing" | "ready" | "scanning" | "error"
  >("initializing");
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const readerId = "persistent-scanner-reader";

  const isTransitioningRef = useRef(false);

  const startScanning = useCallback(async () => {
    if (!selectedCamera || isTransitioningRef.current) return;

    try {
      isTransitioningRef.current = true;
      setError(null);

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
        });
      }

      // Ensure we aren't already scanning (library state check)
      if (scannerRef.current.isScanning) {
        isTransitioningRef.current = false;
        setStatus("scanning");
        return;
      }

      await scannerRef.current.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.5,
        },
        (decodedText) => {
          if (disabled) return;
          const now = Date.now();
          if (
            decodedText === lastScannedRef.current &&
            now - lastScanTimeRef.current < 2000
          )
            return;
          lastScannedRef.current = decodedText;
          lastScanTimeRef.current = now;
          onScan(decodedText);
        },
        () => {},
      );
      setStatus("scanning");
    } catch (err: any) {
      if (err?.message?.includes("already under transition")) {
        // Ignore and let state catch up
        return;
      }
      console.error("Scanner start error:", err);
      setError(
        err.message ||
          (language === "id"
            ? "Gagal memulai kamera"
            : "Failed to start camera"),
      );
      setStatus("error");
    } finally {
      isTransitioningRef.current = false;
    }
  }, [disabled, onScan, readerId, selectedCamera, language]);

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          const formattedDevices = devices.map((dev, idx) => ({
            id: dev.id,
            label:
              dev.label ||
              `${language === "id" ? "Kamera" : "Camera"} ${idx + 1}`,
          }));
          setCameras(formattedDevices);
          setSelectedCamera(formattedDevices[0].id);
          setStatus("ready");
        } else {
          setError(
            language === "id" ? "Kamera tidak ditemukan" : "Camera not found",
          );
          setStatus("error");
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setError(
          language === "id"
            ? "Izin kamera ditolak"
            : "Camera permission denied",
        );
        setStatus("error");
      });

    return () => {
      // Safer unmount cleanup
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          isTransitioningRef.current = true;
          scanner
            .stop()
            .then(() => {
              try {
                scanner.clear();
              } catch (e) {}
            })
            .catch((err) => {
              // Ignore common unmount errors
              if (!err?.message?.includes("removeChild")) {
                console.warn("Cleanup error:", err);
              }
            })
            .finally(() => {
              isTransitioningRef.current = false;
            });
        } else {
          try {
            scanner.clear();
          } catch (e) {}
        }
      }
    };
  }, [language]);

  useEffect(() => {
    if (status === "ready" && selectedCamera) {
      startScanning();
    }

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        if (!isTransitioningRef.current) {
          isTransitioningRef.current = true;
          scannerRef.current
            .stop()
            .catch(() => {})
            .finally(() => {
              isTransitioningRef.current = false;
            });
        }
      }
    };
  }, [selectedCamera, startScanning, status]);

  const handleCameraChange = async (cameraId: string | null) => {
    if (!cameraId) return;

    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setSelectedCamera(cameraId);
    setStatus("ready");
  };

  return (
    <Stack gap="xs">
      {/* Camera selector */}
      {cameras.length > 1 && (
        <Select
          size="xs"
          placeholder={language === "id" ? "Pilih kamera" : "Select camera"}
          data={cameras.map((c) => ({ value: c.id, label: c.label }))}
          value={selectedCamera}
          onChange={handleCameraChange}
          leftSection={<IconCamera size={14} />}
          styles={{
            input: {
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "white",
            },
          }}
        />
      )}

      {/* Scanner container */}
      <Box
        style={{
          width: "100%",
          height: scannerHeight,
          backgroundColor: "#000",
          borderRadius: "12px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Inject CSS for library */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
                    #${readerId} video {
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                    }
                    #${readerId}__scan_region {
                        background: transparent !important;
                    }
                    #${readerId}__dashboard {
                        display: none !important;
                    }
                    #${readerId} {
                        border: none !important;
                    }
                `,
          }}
        />

        {/* Scanner element - always present */}
        <div
          id={readerId}
          style={{
            width: "100%",
            height: "100%",
            opacity: status === "scanning" ? 1 : 0,
          }}
        />

        {/* Overlay for non-scanning states */}
        {status !== "scanning" && (
          <Center
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
            }}
          >
            {status === "initializing" && (
              <Stack align="center" gap="xs">
                <Loader color="blue" />
                <Text c="white" size="sm">
                  {language === "id"
                    ? "Menginisialisasi kamera..."
                    : "Initializing camera..."}
                </Text>
              </Stack>
            )}
            {status === "ready" && (
              <Stack align="center" gap="xs">
                <Loader color="blue" />
                <Text c="white" size="sm">
                  {language === "id"
                    ? "Memulai scanner..."
                    : "Starting scanner..."}
                </Text>
              </Stack>
            )}
            {status === "error" && (
              <Stack align="center" gap="xs">
                <IconAlertCircle size={40} color="red" />
                <Text c="red" size="sm">
                  {error}
                </Text>
              </Stack>
            )}
          </Center>
        )}

        {/* Scanning indicator */}
        {status === "scanning" && !disabled && (
          <Box
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(111,139,106,0.9)",
              padding: "4px 12px",
              borderRadius: "20px",
            }}
          >
            <Group gap={6}>
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "white",
                  animation: "pulse 1s infinite",
                }}
              />
              <Text c="white" size="xs" fw={600}>
                {language === "id" ? "MEMINDAI" : "SCANNING"}
              </Text>
            </Group>
          </Box>
        )}
      </Box>

      <style
        dangerouslySetInnerHTML={{
          __html: `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `,
        }}
      />
    </Stack>
  );
}
