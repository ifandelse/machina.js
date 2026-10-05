import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import starlightThemeNova from "starlight-theme-nova";
import starlightLlmsTxt from "starlight-llms-txt";

export default defineConfig({
    site: "https://machina-js.org",
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
            logo: {
                light: "./src/assets/machina-logo-wordmark-light.svg",
                dark: "./src/assets/machina-logo-wordmark-dark.svg",
                replacesTitle: true,
            },
            description:
                "Focused finite state machines for JavaScript and TypeScript. States in, states out.",
            favicon: "/favicon.svg",
            head: [
                {
                    tag: "link",
                    attrs: {
                        rel: "icon",
                        href: "/favicon.ico",
                        sizes: "32x32",
                    },
                },
                {
                    tag: "link",
                    attrs: {
                        rel: "apple-touch-icon",
                        href: "/apple-touch-icon.png",
                    },
                },
                {
                    tag: "meta",
                    attrs: {
                        property: "og:image",
                        content: "https://machina-js.org/og-image.png",
                    },
                },
                {
                    tag: "meta",
                    attrs: {
                        property: "og:image:width",
                        content: "1200",
                    },
                },
                {
                    tag: "meta",
                    attrs: {
                        property: "og:image:height",
                        content: "630",
                    },
                },
                {
                    tag: "meta",
                    attrs: {
                        name: "twitter:card",
                        content: "summary_large_image",
                    },
                },
                {
                    tag: "script",
                    attrs: {
                        defer: true,
                        src: "https://cloud.umami.is/script.js",
                        "data-website-id": "0fc5aee8-bb41-4435-bb49-08749d0263a9",
                    },
                },
            ],
            customCss: ["./src/styles/custom.css"],
            plugins: [
                starlightThemeNova(),
                // Generates llms.txt, llms-full.txt, and llms-small.txt at
                // build time (#193). The hand-maintained copies in public/
                // drifted two releases behind before PR #192 caught them up;
                // derived files cannot drift. Pinned to the 0.7.x line: 0.8+
                // requires Astro 6/7, and this site runs Astro 5. Bump the
                // plugin when the Astro migration lands.
                starlightLlmsTxt({
                    // One paragraph after the description, for LLM readers.
                    // Version-neutral on purpose: version facts live in the
                    // docs pages, which regenerate this file on every build.
                    details: [
                        "machina is TypeScript-first. Handlers receive `{ ctx, inputName, defer, emit }` as a destructured args object. A handler returns a state name to transition and returns nothing to stay in the current state. String shorthand (`timeout: \"yellow\"`) declares an unconditional transition. The compiler validates state names, transition targets, `handle()` inputs, and `defer({ until })` targets. Hierarchies are typed: a parent's `handle()` accepts its children's inputs at any depth, and `bubbles` declares the inputs an FSM sends upward, checked at the `_child` mounting site. An input payload map (`createFsm<TInputs>()`) types each input's arguments at the handler and at every `handle()` call.",
                    ].join("\n"),
                    optionalLinks: [
                        {
                            label: "Source code",
                            url: "https://github.com/ifandelse/machina.js",
                            description: "GitHub repository",
                        },
                        {
                            label: "npm package",
                            url: "https://www.npmjs.com/package/machina",
                            description: "Install with `npm install machina`",
                        },
                        {
                            label: "API Reference",
                            url: "https://machina-js.org/api/",
                            description:
                                "TypeDoc-generated API documentation: classes, interfaces, type aliases",
                        },
                    ],
                    // Output order mirrors the sidebar: guide in reading
                    // order, then examples, tools, migration. The generator
                    // sorts alphabetically otherwise.
                    promote: [
                        "index*",
                        "guide/introduction",
                        "guide/getting-started",
                        "guide/concepts",
                        "guide/fsm",
                        "guide/behavioral-fsm",
                        "guide/hierarchical",
                        "guide/events",
                        "guide/defer",
                        "guide/typed-payloads",
                        "guide/persisting-clients",
                        "examples/overview",
                        "examples/connectivity",
                        "examples/traffic-intersection",
                        "examples/dungeon-critters",
                        "examples/shopping-cart",
                        "examples/job-queue",
                        "examples/with-react",
                        "examples/machina-explorer",
                        "tools/**",
                        "migration/**",
                    ],
                    // The typedoc pages regenerate from source and read as
                    // reference, not narrative. Last in the full file, absent
                    // from the small one.
                    demote: ["api/**"],
                    exclude: ["api/**"],
                }),
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
                {
                    icon: "npm",
                    label: "npm",
                    href: "https://www.npmjs.com/package/machina",
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
                        { slug: "guide/typed-payloads" },
                        { slug: "guide/persisting-clients" },
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
                        { slug: "examples/job-queue" },
                        { slug: "examples/with-react" },
                        { slug: "examples/machina-explorer" },
                    ],
                },
                {
                    label: "Tools",
                    items: [
                        { slug: "tools/machina-inspect" },
                        { slug: "tools/machina-test" },
                        { slug: "tools/eslint-plugin" },
                    ],
                },
                {
                    label: "Migration",
                    items: [{ slug: "migration/v6-to-v7" }, { slug: "migration/v5-to-v6" }],
                },
            ],
        }),
    ],
});
