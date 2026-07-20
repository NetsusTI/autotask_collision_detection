import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Proyecto WXT separado (su propio tsconfig/toolchain) — no debe lintiarse con
    // las reglas de Next.js, y su carpeta .output/.wxt es código generado.
    "ticket_lock_wxt/**",
  ]),
]);

export default eslintConfig;
