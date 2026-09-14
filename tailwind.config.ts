import type { Config } from "tailwindcss";

// Design tokens extracted from reference/IBF_FG_Warehouse_Frontend_Design_v5.html
// (visual reference only — see docs/DESIGN_SYSTEM.md for the full extraction map).
// Colors/shadows are reused; the HTML's fixed-width scale-transform layout is NOT reused.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B1F3A",
        ink2: "#334155",
        muted: "#64748B",
        muted2: "#94A3B8",
        canvas: "#F0F4F8",
        surface: "#FFFFFF",
        line: "#E2E8F0",
        navy: { DEFAULT: "#0B1F3A", 2: "#13294B", 3: "#1C3A66" },
        teal: { DEFAULT: "#0D9488", 2: "#0F766E", light: "#CCFBF1" },
        sky: { DEFAULT: "#0284C7", light: "#E0F2FE" },
        gold: { DEFAULT: "#D97706", light: "#FEF3C7" },
        success: { DEFAULT: "#059669", light: "#D1FAE5" },
        danger: { DEFAULT: "#DC2626", light: "#FEE2E2" },
        warning: { DEFAULT: "#F59E0B", light: "#FEF3C7" },
        accent: { DEFAULT: "#7C3AED", light: "#EDE9FE" },
        slate: "#475569",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,.06), 0 8px 24px -6px rgba(15,23,42,.1)",
        elevated: "0 20px 50px -12px rgba(15,23,42,.22)",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
