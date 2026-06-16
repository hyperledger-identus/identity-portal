import config from "../../eslint.config.mjs";

export default [
  ...config,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": "off",
    },
  },
];
