import {
  defaultVariantColorsResolver,
  mergeThemeOverrides,
  parseThemeColor,
  type MantineGradient,
  type MantineTheme,
  type VariantColorsResolver,
} from "@mantine/core";
import { theme } from "@/lib/theme";

// Kiosk and POS Cashier: the dashboard theme with buttons, badges and theme icons drawn from the --kiosk-* tokens in
// globals.css (only the four spec hexes and colours derived from them).
// Red, pink and orange/yellow are errors and warnings. The manager has not given hexes for those yet, so they keep
// whatever they had.

const WARNING_COLORS = new Set(["red", "danger", "pink", "orange", "yellow"]);

function isWarning(color: string | undefined, theme: MantineTheme) {
  if (!color) return false;
  const parsed = parseThemeColor({ color, theme });
  return parsed.isThemeColor && WARNING_COLORS.has(parsed.color);
}

function isWarningGradient(gradient: MantineGradient | undefined, theme: MantineTheme) {
  return isWarning(gradient?.from, theme) || isWarning(gradient?.to, theme);
}

const kioskVariantColors: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input);
  if (isWarning(input.color, input.theme)) return defaults;

  switch (input.variant) {
    // Default button: surface with a border, ivory text.
    case "default":
      return {
        background: "var(--kiosk-surface)",
        hover: "var(--kiosk-raised)",
        color: "var(--kiosk-text)",
        border: "1px solid var(--kiosk-border)",
      };
    // Main action buttons (they were sage-to-gold gradients) and active toggles: the solid active colour.
    case "gradient":
      if (isWarningGradient(input.gradient, input.theme)) return defaults;
      return {
        background: "var(--kiosk-deep)",
        hover: "var(--kiosk-raised)",
        color: "var(--kiosk-text)",
        border: "1px solid transparent",
      };
    // Inactive choice next to an active one (payment methods): transparent with a sage border.
    case "outline":
      return {
        background: "transparent",
        hover: "var(--kiosk-raised)",
        color: "var(--kiosk-text)",
        border: "1px solid var(--kiosk-sage)",
      };
    case "filled":
      return {
        background: "var(--kiosk-deep)",
        hover: "var(--kiosk-raised)",
        color: "var(--kiosk-text)",
        border: "1px solid transparent",
      };
    case "light":
      return {
        background: "var(--kiosk-raised)",
        hover: "var(--kiosk-border)",
        color: "var(--kiosk-sage-lt)",
        border: "1px solid transparent",
      };
    case "subtle":
      return {
        background: "transparent",
        hover: "var(--kiosk-raised)",
        color: "var(--kiosk-text-2)",
        border: "1px solid transparent",
      };
    default:
      return defaults;
  }
};

export const kioskTheme = mergeThemeOverrides(theme, {
  // The dashboard's surfaces are pure white; here "white" text stays the spec ivory.
  white: "#FFFAF4",
  variantColorResolver: kioskVariantColors,
  components: {
    // The dashboard theme sets a pressed colour from its own palette; here pressing uses the hover colour.
    Button: {
      vars: () => ({ root: { "--sade-btn-pressed": undefined } }),
    },
    // Icon boxes: raised background with a light sage icon, never the sage-to-gold gradient.
    ThemeIcon: {
      vars: (t: MantineTheme, props: { variant?: string; gradient?: MantineGradient; color?: string }) =>
        props.variant === "gradient" && !isWarningGradient(props.gradient, t) && !isWarning(props.color, t)
          ? { root: { "--ti-bg": "var(--kiosk-raised)", "--ti-color": "var(--kiosk-sage-lt)", "--ti-bd": "1px solid transparent" } }
          : { root: {} },
    },
    // Dropdowns and modals stay inside the kiosk root so they get the kiosk colours instead of the page's.
    Select: {
      defaultProps: { comboboxProps: { withinPortal: false } },
    },
    Modal: {
      defaultProps: { withinPortal: false },
    },
  },
});
