"use client";

import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { useMounted } from "@mantine/hooks";

// The server cannot read the saved theme, so its HTML is always light. Mantine reads the saved theme in the browser's
// first render, which makes styles chosen with `colorScheme === "dark"` differ and React reports a hydration mismatch.
// These hooks answer "light" until the page has mounted, the same as the server, then the real value.
// The page colours themselves come from CSS variables and are dark from the start, only inline styles wait a moment.

// "light" or "dark", with "auto" already resolved from the OS setting.
export function useAppColorScheme(): "light" | "dark" {
  const mounted = useMounted();
  const computed = useComputedColorScheme("light");
  return mounted ? computed : "light";
}

// What the person picked ("light", "dark" or "auto"), for theme switchers.
export function useColorSchemeChoice() {
  const mounted = useMounted();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return { choice: mounted ? colorScheme : "light", setColorScheme };
}
