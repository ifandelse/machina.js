import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import starlightThemeNova from "starlight-theme-nova";

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
                        content: "/og-image.png",
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
                        { slug: "examples/machina-explorer" },
                    ],
                },
                {
                    label: "Tools",
                    items: [{ slug: "tools/machina-inspect" }, { slug: "tools/eslint-plugin" }],
                },
                {
                    label: "Migration",
                    items: [{ slug: "migration/v5-to-v6" }],
                },
            ],
        }),
    ],
});
