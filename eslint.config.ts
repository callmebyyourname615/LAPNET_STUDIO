import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
