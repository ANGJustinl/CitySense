import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "docs/**/*.cjs",
    "data/damai-session/**",
    "tools/damai-search/.browser-profile/**",
    "tools/damai-search/output/**",
    "next-env.d.ts"
  ])
]);
