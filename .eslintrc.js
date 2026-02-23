module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: "./tsconfig.json",
    },
    plugins: ["@typescript-eslint"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
    env: {
        node: true,
        browser: true,
        jest: true,
    },
    rules: {
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "no-duplicate-imports": 1,
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
                varsIgnorePattern: "^_",
                argsIgnorePattern: "^_",
            },
        ],
        "@typescript-eslint/no-unused-expressions": [
            "error",
            {
                allowShortCircuit: true,
                allowTernary: true,
                allowTaggedTemplates: true,
            },
        ],
    },
    ignorePatterns: ["dist", "node_modules", ".eslintrc.js"],
};
