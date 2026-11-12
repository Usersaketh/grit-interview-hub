import tsParser from "@typescript-eslint/parser";

export default [{
  files: ["**/*.{ts,tsx}"],
  languageOptions: { parser: tsParser },
  ignores: [".next/**", "node_modules/**"]
}];
