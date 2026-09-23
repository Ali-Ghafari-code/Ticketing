import type { Config } from "tailwindcss";

const withVar = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: { sans: ["Vazirmatn", "Tahoma", "system-ui", "sans-serif"] },
      colors: {
        background: withVar("background"),
        foreground: withVar("foreground"),
        card: withVar("card"),
        muted: withVar("muted"),
        "muted-foreground": withVar("muted-foreground"),
        border: withVar("border"),
        input: withVar("input"),
        ring: withVar("primary"),
        primary: { DEFAULT: withVar("primary"), foreground: withVar("primary-foreground") },
        accent: withVar("accent"),
        success: withVar("success"),
        warning: withVar("warning"),
        danger: withVar("danger"),
        info: withVar("info"),
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        soft: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)",
        pop: "0 10px 30px -10px rgb(15 23 42 / 0.25)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.97)" }, to: { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in .15s ease-out",
        "slide-in-right": "slide-in-right .2s ease-out",
        "scale-in": "scale-in .15s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
