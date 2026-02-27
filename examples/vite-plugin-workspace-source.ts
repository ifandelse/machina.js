import { resolve } from "path";
import type { Plugin } from "vite";

// Resolve workspace packages to their TypeScript source during Vite dev.
// This bypasses the dist/ folder entirely — no build step needed, instant
// HMR on library changes, and no more "Failed to resolve entry" errors
// when dist/ doesn't exist yet.
const EXAMPLES_DIR = import.meta.dirname;
const PACKAGES_DIR = resolve(EXAMPLES_DIR, "../packages");

const PACKAGE_SOURCES: Record<string, string> = {
    machina: resolve(PACKAGES_DIR, "machina/src/index.ts"),
    "machina-inspect": resolve(PACKAGES_DIR, "machina-inspect/src/index.ts"),
};

export const workspaceSource = (...packages: string[]): Plugin => {
    const targets = packages.length > 0 ? packages : Object.keys(PACKAGE_SOURCES);
    const alias: Record<string, string> = {};
    for (const name of targets) {
        if (PACKAGE_SOURCES[name]) {
            alias[name] = PACKAGE_SOURCES[name];
        }
    }

    return {
        name: "workspace-source",
        config() {
            return {
                resolve: { alias },
            };
        },
    };
};
