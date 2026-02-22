import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

export default defineConfig({
    site: "https://ifandelse.github.io",
    base: "/machina.js",
    vite: {
        ssr: {
            // Vite's SSR externals resolve nanoid and zod from the wrong
            // location during static generation. Bundling them inline
            // sidesteps the issue.
            noExternal: ["nanoid", "zod"],
        },
    },
    integrations: [
        starlight({
            title: "machina",
            description:
                "Focused finite state machines for JavaScript and TypeScript. States in, states out.",
            plugins: [
                starlightTypeDoc({
                    entryPoints: ["../machina/src/index.ts"],
                    tsconfig: "../machina/tsconfig.json",
                }),
            ],
            social: [
                {
                    icon: "github",
                    label: "GitHub",
                    href: "https://github.com/ifandelse/machina.js",
                },
            ],
            sidebar: [
                {
                    label: "Guide",
                    items: [
                        { slug: "guide/introduction" },
                        { slug: "guide/getting-started" },
                        { slug: "guide/concepts" },
                        { slug: "guide/fsm" },
                        { slug: "guide/behavioral-fsm" },
                        { slug: "guide/hierarchical" },
                        { slug: "guide/events" },
                        { slug: "guide/defer" },
                    ],
                },
                typeDocSidebarGroup,
                {
                    label: "Examples",
                    items: [
                        { slug: "examples/overview" },
                        { slug: "examples/connectivity" },
                        { slug: "examples/traffic-intersection" },
                        { slug: "examples/dungeon-critters" },
                        { slug: "examples/shopping-cart" },
                        { slug: "examples/with-react" },
                    ],
                },
                {
                    label: "Migration",
                    items: [{ slug: "migration/v5-to-v6" }],
                },
            ],
        }),
    ],
});
