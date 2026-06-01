/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Qalam editorial "ink on paper" sepia palette, exposed as Tailwind tokens.
        ink: { DEFAULT: "#1a1714", soft: "#534b42" },
        paper: { DEFAULT: "#fbf8f3", edge: "#efe9df" },
        surface: "#ffffff",
        line: "#e3dccf",
        accent: { DEFAULT: "#9a6b3f", deep: "#6f4a26" },
        danger: "#b4452f",
        // shadcn semantic tokens mapped onto the palette
        border: "#e3dccf",
        input: "#e3dccf",
        ring: "#9a6b3f",
        background: "#fbf8f3",
        foreground: "#1a1714",
        primary: { DEFAULT: "#9a6b3f", foreground: "#ffffff" },
        secondary: { DEFAULT: "#efe9df", foreground: "#1a1714" },
        muted: { DEFAULT: "#efe9df", foreground: "#534b42" },
        popover: { DEFAULT: "#ffffff", foreground: "#1a1714" },
        card: { DEFAULT: "#ffffff", foreground: "#1a1714" },
      },
      fontFamily: {
        ui: ["Inter", "system-ui", "sans-serif"],
        nastaliq: ['"Noto Nastaliq Urdu"', "serif"],
      },
      borderRadius: {
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        qalam: "0 6px 28px rgba(40, 30, 18, 0.12)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
