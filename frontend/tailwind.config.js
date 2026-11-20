/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#070B12",
        surface: "#0C121C",
        raised: "#111A28",
        overlay: "#0A1019",
        line: "#1B2637",
        "line-strong": "#2A3A52",
        ink: "#E8EEF7",
        "ink-secondary": "#A5B4CB",
        "ink-muted": "#74849C",
        "ink-faint": "#4F5E75",
        accent: "#22D3EE",
        "accent-strong": "#06B6D4",
        "accent-soft": "#0E2E3A",
        success: "#34D399",
        "success-soft": "#0D2B23",
        warning: "#FBBF24",
        "warning-soft": "#2D2410",
        danger: "#FB7185",
        "danger-soft": "#331520",
        info: "#60A5FA",
        "info-soft": "#12233D",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.04em" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12.5px", { lineHeight: "19px" }],
        base: ["14px", { lineHeight: "21px" }],
        md: ["15px", { lineHeight: "23px" }],
        lg: ["17px", { lineHeight: "25px" }],
        xl: ["21px", { lineHeight: "28px" }],
        "2xl": ["26px", { lineHeight: "32px" }],
        "3xl": ["32px", { lineHeight: "38px" }],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        pop: "0 18px 48px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(42,58,82,0.6)",
        glow: "0 0 0 1px rgba(34,211,238,0.25), 0 0 32px -8px rgba(34,211,238,0.25)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "drawer-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(251,113,133,0.35)" },
          "70%": { boxShadow: "0 0 0 8px rgba(251,113,133,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(251,113,133,0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "slide-in": "slide-in 180ms ease-out",
        "drawer-in": "drawer-in 200ms ease-out",
        "pulse-ring": "pulse-ring 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};
