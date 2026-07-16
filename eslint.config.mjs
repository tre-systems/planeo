import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      ".wrangler/",
      "worker-configuration.d.ts",
      "playwright-report/",
      "test-results/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      import: importPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      // The classic pair only — react-hooks v7's compiler-alignment rules
      // reject R3F's useFrame scratch-mutation idiom (a documented pattern).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          // Classify the "@/…" alias as internal explicitly — no TS import
          // resolver needed (the order rules never resolve modules).
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/first": "warn",
      "import/newline-after-import": "warn",
    },
  },
);
