import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import compliance from "./eslint-rules/require-prefetch-false.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tooling configs, not application code.
    ".trunk/**",
    // Generated from the server's openapi.json — never edited by hand.
    "src/api/schema.d.ts",
  ]),
  {
    // Law 25 / PIPEDA controls that a reviewer should not have to remember.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { compliance },
    rules: { "compliance/require-prefetch-false": "error" },
  },
]);

export default eslintConfig;
