import { createTheme, MantineColorsTuple, rem } from "@mantine/core";

// Brand color palette - Professional blue with energetic orange accent
const brand: MantineColorsTuple = [
  "#E7F5FF",
  "#D0EBFF",
  "#A5D8FF",
  "#74C0FC",
  "#4DABF7",
  "#339AF0",
  "#228BE6",
  "#1C7ED6",
  "#1971C2",
  "#1864AB",
];

const accent: MantineColorsTuple = [
  "#FFF4E6",
  "#FFE8CC",
  "#FFD8A8",
  "#FFC078",
  "#FFA94D",
  "#FF922B",
  "#FD7E14",
  "#F76707",
  "#E8590C",
  "#D9480F",
];

const success: MantineColorsTuple = [
  "#EBFBEE",
  "#D3F9D8",
  "#B2F2BB",
  "#8CE99A",
  "#69DB7C",
  "#51CF66",
  "#40C057",
  "#37B24D",
  "#2F9E44",
  "#2B8A3E",
];

const danger: MantineColorsTuple = [
  "#FFF5F5",
  "#FFE3E3",
  "#FFC9C9",
  "#FFA8A8",
  "#FF8787",
  "#FF6B6B",
  "#FA5252",
  "#F03E3E",
  "#E03131",
  "#C92A2A",
];

export const theme = createTheme({
  // Color configuration
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 7 },
  colors: {
    brand,
    accent,
    success,
    danger,
  },

  // Typography
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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

  // Spacing scale
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },

  // Border radius
  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(8),
    lg: rem(12),
    xl: rem(16),
  },

  // Shadows for depth
  shadows: {
    xs: "0 1px 2px rgba(0, 0, 0, 0.05)",
    sm: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  },

  // Default radius for components
  defaultRadius: "md",

  // Cursor style
  cursorType: "pointer",

  // Focus ring
  focusRing: "auto",

  // Component-specific overrides
  components: {
    // A square box with only a hint of a corner. The default radius would make it almost round.
    Checkbox: {
      defaultProps: {
        radius: "xs",
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
      },
      styles: {
        root: {
          fontWeight: 600,
          transition: "all 0.2s ease",
          "&:hover": {
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
        shadow: "sm",
      },
      styles: {
        root: {
          transition: "all 0.2s ease",
        },
      },
    },
    Paper: {
      defaultProps: {
        radius: "lg",
        shadow: "sm",
      },
    },
    TextInput: {
      defaultProps: {
        radius: "md",
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: "md",
      },
    },
    Select: {
      defaultProps: {
        radius: "md",
      },
    },
    NumberInput: {
      defaultProps: {
        radius: "md",
      },
    },
    FileInput: {
      defaultProps: {
        radius: "md",
      },
    },
    Table: {
      styles: {
        th: {
          fontWeight: 600,
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
      defaultProps: {
        radius: "md",
      },
    },
    Badge: {
      defaultProps: {
        radius: "md",
      },
    },
    Modal: {
      defaultProps: {
        radius: "lg",
      },
    },
    Notification: {
      defaultProps: {
        radius: "md",
      },
    },
  },
});

// CSS variables for custom styling
export const cssVariables = {
  // Gradients
  gradientPrimary: "linear-gradient(135deg, #228BE6 0%, #1C7ED6 100%)",
  gradientAccent: "linear-gradient(135deg, #FF922B 0%, #FD7E14 100%)",
  gradientSuccess: "linear-gradient(135deg, #51CF66 0%, #40C057 100%)",
  gradientDanger: "linear-gradient(135deg, #FF6B6B 0%, #FA5252 100%)",
  gradientDark: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",

  // Background patterns
  patternDots:
    "radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)",
  patternGrid:
    "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",

  // Glassmorphism
  glass: {
    background: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.3)",
  },
  glassDark: {
    background: "rgba(0, 0, 0, 0.3)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
};
