const path = require("node:path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "src/ui/**/*.{html,ts,tsx}")],
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
};
