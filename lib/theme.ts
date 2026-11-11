import {
  createTheme,
  CSSVariablesResolver,
  defaultVariantColorsResolver,
  MantineColorsTuple,
  MantineTheme,
  parseThemeColor,
  rem,
  VariantColorsResolver,
} from "@mantine/core";

const brand: MantineColorsTuple = [
  "#F1F4EF",
  "#E7EEE4", // 1 sage tint (icon boxes, badges, light buttons)
  "#D5E3CF", // 2 panel border, secondary button border
  "#C1D0B9",
  "#A9BD9F",
  "#8FA983",
  "#6F8B6A", // 6 Goodness Sage: icons, status dots, borders, focus ring. Not for text.
  "#486142", // 7 deep sage: primary buttons, green text
  "#3A4F35", // 8 primary hover
  "#2D3E29", // 9 primary pressed
];

const accent: MantineColorsTuple = [
  "#FBF4E6",
  "#F6E9C9",
  "#F0DDAA",
  "#E9D08A",
  "#E2C36C",
  "#DDB44F",
  "#D6A13A",
  "#B98429",
  "#956A22",
  "#74521D",
];

const success: MantineColorsTuple = [
  "#F1F4EF",
  "#E7EEE4", // 1 sage tint (icon boxes, badges, light buttons)
  "#D5E3CF", // 2 panel border, secondary button border
  "#C1D0B9",
  "#A9BD9F",
  "#8FA983",
  "#6F8B6A", // 6 Goodness Sage: icons, status dots, borders, focus ring. Not for text.
  "#486142", // 7 deep sage: primary buttons, green text
  "#3A4F35", // 8 primary hover
  "#2D3E29", // 9 primary pressed
];

const danger: MantineColorsTuple = [
  "#FFF1F1",
  "#FCE3E3",
  "#F8D0D0",
  "#F2B8B8",
  "#E99C9C",
  "#DD8080",
  "#CC6666",
  "#AD4E4E",
  "#8D3E3E",
  "#703333",
];

const dark: MantineColorsTuple = [
  "#F4F0E8", // 0 teks
  "#DDD9CC", // 1
  "#B9BEAE", // 2
  "#949B88", // 3 teks muted
  "#364333", // 4 border
  "#2C382A", // 5 raised / hover
  "#242E21", // 6 card
  "#1C2419", // 7 background
  "#171E15", // 8 sidebar / header
  "#12180F", // 9 paling gelap
];

const gray: MantineColorsTuple = [
  "#F5F2EC",
  "#E9E5DC",
  "#DAD5CA",
  "#C9C3B7",
  "#B3ADA1",
  "#999388",
  "#7C776E",
  "#635F57",
  "#4A4741",
  "#34322D",
];

const sky: MantineColorsTuple = [
  "#EFF7FA",
  "#DDEEF4",
  "#C5E1EA",
  "#ACD2DE",
  "#92C2D2",
  "#79AFC7",
  "#6098B0",
  "#4C7E95",
  "#3D6579",
  "#31515F",
];

// Every Mantine colour name belongs to one of four Sade families. The colours themselves (per light/dark) are CSS
// variables in globals.css, so buttons, badges, theme icons, alerts and nav links all follow the scheme.
type Family = "sage" | "gold" | "sky" | "rose";
const FAMILIES: Record<string, Family> = {
  brand: "sage", success: "sage", green: "sage", teal: "sage", cyan: "sage", lime: "sage", violet: "sage", indigo: "sage",
  accent: "gold", orange: "gold", yellow: "gold", grape: "gold",
  sky: "sky", blue: "sky",
  danger: "rose", red: "rose", pink: "rose",
};

// The family of a colour name, or null for gray, dark, a CSS colour or an explicit shade like "brand.5".
function familyOf(color: string | undefined, theme: MantineTheme): Family | null {
  const parsed = parseThemeColor({ color: color || theme.primaryColor, theme });
  if (!parsed.isThemeColor || parsed.shade !== undefined) return null;
  return FAMILIES[parsed.color] ?? null;
}

const sadeVariantColors: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input);
  // Secondary: white with a pale sage border and green text.
  if (input.variant === "default") {
    return {
      background: "var(--sade-secondary-bg)",
      hover: "var(--sade-secondary-hover)",
      color: "var(--sade-secondary-text)",
      border: "1px solid var(--sade-secondary-border)",
    };
  }

  const family = familyOf(input.color, input.theme);
  if (!family) return defaults;

  switch (input.variant) {
    case "filled":
      return {
        background: `var(--sade-${family}-filled)`,
        hover: `var(--sade-${family}-filled-hover)`,
        color: `var(--sade-${family}-filled-text)`,
        border: "1px solid transparent",
      };
    case "light":
      return {
        background: `var(--sade-tint-${family})`,
        hover: `var(--sade-tint-${family}-hover)`,
        color: `var(--sade-tint-${family}-text)`,
        border: family === "rose" ? "1px solid var(--sade-tint-rose-border)" : "1px solid transparent",
      };
    case "subtle":
      return {
        background: "transparent",
        hover: `var(--sade-tint-${family})`,
        color: `var(--sade-tint-${family}-text)`,
        border: "1px solid transparent",
      };
    case "outline":
      return family === "sage"
        ? {
            background: "var(--sade-secondary-bg)",
            hover: "var(--sade-secondary-hover)",
            color: "var(--sade-secondary-text)",
            border: "1px solid var(--sade-secondary-border)",
          }
        : { ...defaults, color: `var(--sade-tint-${family}-text)`, border: `1px solid var(--sade-tint-${family}-text)` };
    default:
      return defaults;
  }
};

// The colour a button takes while pressed (Mantine reuses the hover colour).
function pressedFor(variant: string | undefined, color: string | undefined, theme: MantineTheme): string | undefined {
  const v = variant ?? "filled";
  if (v === "default") return "var(--sade-secondary-pressed)";
  const family = familyOf(color, theme);
  if (!family) return undefined;
  if (v === "filled") return `var(--sade-${family}-filled-pressed)`;
  if (v === "light") return `var(--sade-tint-${family}-pressed)`;
  if (v === "outline" && family === "sage") return "var(--sade-secondary-pressed)";
  return undefined;
}

export const theme = createTheme({
  primaryColor: "brand",
  // Ivory text on #6F8B6A is only 3.6:1, so filled buttons use shade 7 (#486142, 6.6:1) in both modes.
  primaryShade: { light: 7, dark: 7 },
  colors: {
    brand,
    accent,
    success,
    danger,
    dark,
    gray,
    sky,
    orange: accent,
    yellow: accent,
    blue: sky,
    cyan: success,
    green: success,
    teal: success,
    violet: brand,
    indigo: brand,
    grape: accent,
    lime: success,
    red: danger,
    pink: danger,
  },
  // Surfaces are pure white; ivory is only the page background (--sade-page in globals.css).
  white: "#FFFFFF",
  black: "#211F1A",
  fontFamily:
    'var(--font-nunito-sans), "Nunito Sans", sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'var(--font-jakarta-sans), "Plus Jakarta Sans", sans-serif',
    fontWeight: "700",
    sizes: {
      h1: { fontSize: rem(36), lineHeight: "1.2" },
      h2: { fontSize: rem(28), lineHeight: "1.3" },
      h3: { fontSize: rem(22), lineHeight: "1.4" },
      h4: { fontSize: rem(18), lineHeight: "1.5" },
      h5: { fontSize: rem(16), lineHeight: "1.5" },
      h6: { fontSize: rem(14), lineHeight: "1.5" },
    },
  },
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },
  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(8),
    lg: rem(12),
    xl: rem(16),
  },
  shadows: {
    xs: "0 1px 2px rgba(43, 55, 37, 0.05)",
    sm: "0 1px 2px rgba(43, 55, 37, 0.06)",
    md: "0 4px 8px rgba(43, 55, 37, 0.08)",
    lg: "0 10px 24px rgba(43, 55, 37, 0.1)",
    xl: "0 20px 36px rgba(43, 55, 37, 0.12)",
  },
  defaultRadius: "md",
  cursorType: "pointer",
  variantColorResolver: sadeVariantColors,
  focusRing: "auto",
  components: {
    Checkbox: {
      defaultProps: { radius: "xs" },
    },
    Button: {
      defaultProps: { radius: 10 },
      styles: { root: { fontWeight: 700 } },
      vars: (theme: MantineTheme, props: { variant?: string; color?: string }) => ({
        root: { "--sade-btn-pressed": pressedFor(props.variant, props.color, theme) },
      }),
    },
    Card: {
      defaultProps: { radius: "lg", shadow: "sm", withBorder: true },
      styles: { root: { transition: "all 0.2s ease" } },
    },
    Paper: {
      defaultProps: { radius: "lg", shadow: "sm", withBorder: true },
    },
    SegmentedControl: {
      defaultProps: { color: "brand" },
    },
    TextInput: {
      defaultProps: { radius: "md" },
    },
    PasswordInput: {
      defaultProps: { radius: "md" },
    },
    Select: {
      defaultProps: { radius: "md" },
    },
    NumberInput: {
      defaultProps: { radius: "md" },
    },
    FileInput: {
      defaultProps: { radius: "md" },
    },
    Table: {
      styles: {
        th: {
          fontWeight: 700,
          textTransform: "uppercase",
          fontSize: rem(11),
          letterSpacing: "0.5px",
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: rem(8),
          transition: "all 0.15s ease",
        },
      },
    },
    Alert: {
      defaultProps: { radius: "md" },
    },
    Badge: {
      defaultProps: { radius: "xl" },
      styles: { root: { fontSize: rem(11), fontWeight: 700, textTransform: "uppercase" } },
    },
    Modal: {
      defaultProps: { radius: "lg" },
    },
    Notification: {
      defaultProps: { radius: "md" },
    },
  },
});

export const cssVariables = {
  gradientPrimary: "linear-gradient(135deg, #6F8B6A 0%, #486142 100%)",
  gradientAccent: "linear-gradient(135deg, #E2C36C 0%, #D6A13A 100%)",
  gradientSuccess: "linear-gradient(135deg, #8FA983 0%, #486142 100%)",
  gradientDanger: "linear-gradient(135deg, #F2B8B8 0%, #CC6666 100%)",
  gradientDark: "linear-gradient(135deg, #2C382A 0%, #1C2419 100%)",
  patternDots:
    "radial-gradient(circle, rgba(72, 97, 66, 0.08) 1px, transparent 1px)",
  patternGrid:
    "linear-gradient(rgba(72, 97, 66, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(72, 97, 66, 0.05) 1px, transparent 1px)",
  glass: {
    background: "rgba(255, 250, 244, 0.78)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(72, 97, 66, 0.12)",
  },
  glassDark: {
    background: "rgba(32, 43, 29, 0.78)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(230, 234, 223, 0.12)",
  },
};

// Surfaces (cards, top bar, sidebar, modals) and text colours per scheme. Mantine injects its own variables after the
// stylesheets, so these go through the provider instead of globals.css. The page background is --sade-page.
// Dark values follow the "warm dark espresso-green" of the spec; the hexes are a guess pending the manager.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "#FFFFFF",
    "--mantine-color-text": "#211F1A",
    "--mantine-color-dimmed": "#6B665C",
    "--mantine-color-error": "#AD4E4E",
  },
  dark: {
    "--mantine-color-body": "#242E21",
    "--mantine-color-text": "#F4F0E8",
    "--mantine-color-dimmed": "#949B88",
    "--mantine-color-error": "#E99C9C",
  },
});
