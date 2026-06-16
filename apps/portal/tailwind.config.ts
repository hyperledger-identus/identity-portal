import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        panel: "#f7f8fa",
        line: "#d7dce3",
        brand: "#0f766e",
        accent: "#b45309",
      },
    },
  },
  plugins: [],
} satisfies Config;
