import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["doom/**", "node_modules/**", "dist/**", "scripts/**"],
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      // Allow unused vars if prefixed with _ (common for catch blocks and unused params)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow any types - necessary for WASM/Emscripten integration
      "@typescript-eslint/no-explicit-any": "off",
      // Allow require() - needed for dynamic WASM module loading
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
