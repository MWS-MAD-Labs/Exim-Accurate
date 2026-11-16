"use client";

import { ActionIcon, MantineProvider, Tooltip } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLanguage } from "@/lib/language";
import { kioskTheme } from "@/lib/kiosk-theme";

// Kiosk and POS Cashier pick light or dark on their own, separate from the dashboard's theme. Light by default.
// The choice is remembered on this device, so a kiosk station keeps it after a reload.
type KioskScheme = "light" | "dark";
const STORAGE_KEY = "sade.kiosk.colorScheme";

const KioskSchemeContext = createContext<{ scheme: KioskScheme; toggle: () => void }>({
  scheme: "light",
  toggle: () => undefined,
});

interface KioskColorSchemeProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function KioskColorScheme({ children, className, style }: KioskColorSchemeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getRootElement = useCallback(() => rootRef.current ?? undefined, []);
  // Light on the server and the first render; a remembered dark choice is applied right after mounting.
  const [scheme, setScheme] = useState<KioskScheme>("light");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "dark") setScheme("dark");
    } catch {
      // Storage can be blocked; the station then stays light.
    }
  }, []);

  const toggle = useCallback(() => {
    setScheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not remembered, still switched.
      }
      return next;
    });
  }, []);

  return (
    <KioskSchemeContext.Provider value={{ scheme, toggle }}>
      <MantineProvider theme={kioskTheme} forceColorScheme={scheme} getRootElement={getRootElement}>
        <div ref={rootRef} data-mantine-color-scheme={scheme} className={className} style={style}>
          {children}
        </div>
      </MantineProvider>
    </KioskSchemeContext.Provider>
  );
}

// The light/dark button in the Kiosk and POS headers.
export function KioskSchemeToggle() {
  const { scheme, toggle } = useContext(KioskSchemeContext);
  const { language } = useLanguage();
  const isDark = scheme === "dark";
  const label = isDark
    ? language === "id" ? "Mode terang" : "Light mode"
    : language === "id" ? "Mode gelap" : "Dark mode";

  return (
    <Tooltip label={label} position="bottom">
      <ActionIcon
        variant="default"
        size="lg"
        radius="md"
        onClick={toggle}
        aria-label={label}
      >
        {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}
