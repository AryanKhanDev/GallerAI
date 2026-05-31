/**
 * src/utils/theme.ts
 * ChatGPT-inspired monochrome theme
 * Dark + Light ready
 */

export const theme = {
  dark: {
    bg0: "#000000",
    bg1: "#1c1c1e",
    bg2: "#2c2c2e",
    bg3: "#3a3a3c",

    text0: "#f5f5f5",
    text1: "#a1a1aa",
    text2: "#71717a",

    accent: "#ffffff",
    accentDim: "#ffffff22",
    accentText: "#000000",

    success: "#4caf7d",
    error: "#e05252",

    overlay: "rgba(0,0,0,0.82)",
    overlayLight: "rgba(0,0,0,0.45)",
  },

  light: {
    bg0: "#ffffff",
    bg1: "#f3f4f6",
    bg2: "#e5e7eb",
    bg3: "#d4d4d8",

    text0: "#111111",
    text1: "#52525b",
    text2: "#71717a",

    accent: "#111111",
    accentDim: "#11111122",
    accentText: "#ffffff",

    success: "#4caf7d",
    error: "#e05252",

    overlay: "rgba(255,255,255,0.82)",
    overlayLight: "rgba(255,255,255,0.45)",
  },
};

export type ThemeMode =
  | "dark"
  | "light";

export const getColors = (
  mode: ThemeMode = "dark"
) => theme[mode];

/**
 * Legacy export
 * Keeps old screens working.
 */
export const colors =
  theme.dark;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 999,
};

export const font = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,

  xs: 11,
  sm: 13,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
};