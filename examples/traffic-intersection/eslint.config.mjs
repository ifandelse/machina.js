import tsParser from "@typescript-eslint/parser";
import machina from "eslint-plugin-machina";

export default [
    {
        ignores: ["**/*.test.ts"],
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
        },
        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },
    },
    machina.configs.recommended,
];
