const path = require("path");

module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: path.resolve(__dirname, "tsconfig.test.json") }],
    },
    moduleNameMapper: {
        "^machina$": path.resolve(__dirname, "node_modules/machina/dist/index.cjs"),
        "^machina-inspect$": path.resolve(__dirname, "node_modules/machina-inspect/dist/index.cjs"),
    },
    transformIgnorePatterns: ["/node_modules/(?!(machina|machina-inspect))"],
};
