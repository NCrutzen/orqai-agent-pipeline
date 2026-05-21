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
    // Phase 88.2 (SPEC.md §"Out of scope"): lib/automations/** is a trusted-
    // boundary surface — tactical scripts, externally credentialed, reviewed
    // by humans on commit. Type-cleaning the surface is deferred (CONTEXT.md
    // "Deferred Ideas"). Revisit when ownership stabilises.
    "lib/automations/**",
  ]),
  // Phase 88.2 (D-12 / SPEC Req 1): honour `_`-prefix convention for
  // intentionally-unused args + destructure-leftovers.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
