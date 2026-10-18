#!/usr/bin/env node
// Syncs the shared README sections from the root README (the source of truth)
// into packages/machina/README.md. Relative links are rewritten to absolute
// URLs because npm renders the package README outside the repo, where
// ./examples/... and ./packages/... resolve to nothing.
//
// Usage: node scripts/sync-readmes.mjs [--check | --write]
//   --check  exit 1 if the package README is stale (the default)
//   --write  update the package README in place
// Positional args (filenames appended by lint-staged) are ignored.
//
// Blocks are delimited in both files by HTML comment markers:
//   <!-- sync:NAME --> ... <!-- /sync:NAME -->
// A block in the root with no counterpart in the package README is root-only
// (the TOC and Contributing live outside markers for the same reason). A block
// in the package README missing from the root is an error, because its content
// would have no source.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(repoRoot, "README.md");
const destPath = join(repoRoot, "packages", "machina", "README.md");

const GITHUB = "https://github.com/ifandelse/machina.js";

// ./packages/<name>/ links go to the published npm page; every other relative
// path goes to GitHub — blob for files (a dot in the last segment), tree for
// directories.
const rewriteLinks = text =>
    text.replace(/\]\(\.\/([^)]+)\)/g, (_match, path) => {
        const pkg = path.match(/^packages\/([^/]+)\/?$/);
        if (pkg) {
            return `](https://www.npmjs.com/package/${pkg[1]})`;
        }
        const trimmed = path.replace(/\/$/, "");
        const kind = trimmed.split("/").pop().includes(".") ? "blob" : "tree";
        return `](${GITHUB}/${kind}/master/${trimmed})`;
    });

const extractBlocks = (text, file) => {
    const blocks = new Map();
    const markerPair = /<!-- sync:([a-z-]+) -->([\s\S]*?)<!-- \/sync:\1 -->/g;
    for (const match of text.matchAll(markerPair)) {
        if (blocks.has(match[1])) {
            throw new Error(`duplicate sync block "${match[1]}" in ${file}`);
        }
        blocks.set(match[1], match[2]);
    }
    // An opening marker without a matching close never enters the map, so a
    // count mismatch means the file has a typo'd or unclosed marker.
    const opens = (text.match(/<!-- sync:/g) ?? []).length;
    if (opens !== blocks.size) {
        throw new Error(`unbalanced sync markers in ${file}`);
    }
    return blocks;
};

const source = readFileSync(sourcePath, "utf8");
const dest = readFileSync(destPath, "utf8");

const sourceBlocks = extractBlocks(source, relative(repoRoot, sourcePath));
const destBlocks = extractBlocks(dest, relative(repoRoot, destPath));

for (const name of destBlocks.keys()) {
    if (!sourceBlocks.has(name)) {
        throw new Error(`block "${name}" exists in the package README but not in the root README`);
    }
}

let expected = dest;
const stale = [];
for (const name of destBlocks.keys()) {
    const rendered = `\n\n${rewriteLinks(sourceBlocks.get(name).trim())}\n\n`;
    if (destBlocks.get(name) !== rendered) {
        stale.push(name);
    }
    const blockPattern = new RegExp(`(<!-- sync:${name} -->)[\\s\\S]*?(<!-- /sync:${name} -->)`);
    // Replacer function so "$" sequences in README prose aren't treated as
    // substitution patterns.
    expected = expected.replace(blockPattern, (_m, open, close) => `${open}${rendered}${close}`);
}

const write = process.argv.includes("--write");

if (stale.length === 0) {
    console.log("sync-readmes: packages/machina/README.md is in sync");
} else if (write) {
    writeFileSync(destPath, expected);
    console.log(`sync-readmes: updated blocks: ${stale.join(", ")}`);
} else {
    console.error(
        `sync-readmes: packages/machina/README.md is stale (blocks: ${stale.join(", ")}).\n` +
            "Run `pnpm run sync:readmes` to update it from the root README."
    );
    process.exit(1);
}
