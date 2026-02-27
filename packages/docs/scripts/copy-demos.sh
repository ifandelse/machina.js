#!/usr/bin/env bash
# Builds all example apps with the correct base path and copies them into
# the docs dist directory. Mirrors what the CI workflow does so you can
# verify the full site locally with:
#
#   pnpm --filter @machina/docs build:full && pnpm --filter @machina/docs preview

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCS_DIST="$REPO_ROOT/packages/docs/dist"
EXAMPLES=(connectivity traffic-intersection dungeon-critters shopping-cart with-react machina-explorer)

# machina lib and machina-inspect must be built first — examples import from them
echo "Building machina library..."
pnpm --filter machina build

echo "Building machina-inspect..."
pnpm --filter machina-inspect build

for example in "${EXAMPLES[@]}"; do
    echo "Building $example..."
    VITE_BASE_PATH="/demos/$example/" pnpm --filter "@machina-examples/$example" build

    mkdir -p "$DOCS_DIST/demos/$example"
    cp -r "$REPO_ROOT/examples/$example/dist/"* "$DOCS_DIST/demos/$example/"
done

echo "Done. Run 'pnpm --filter @machina/docs preview' to see the full site."
