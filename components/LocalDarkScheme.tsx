"use client";

import { MantineProvider } from "@mantine/core";
import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { theme } from "@/lib/theme";

interface LocalDarkSchemeProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function LocalDarkScheme({
  children,
  className,
  style,
}: LocalDarkSchemeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getRootElement = useCallback(() => rootRef.current ?? undefined, []);

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme="dark"
      getRootElement={getRootElement}
    >
      <div
        ref={rootRef}
        data-mantine-color-scheme="dark"
        className={className}
        style={style}
      >
        {children}
      </div>
    </MantineProvider>
  );
}
