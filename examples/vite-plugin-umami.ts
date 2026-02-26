import type { Plugin } from "vite";

export const umami = (): Plugin => ({
    name: "umami",
    transformIndexHtml(html) {
        if (!process.env.VITE_BASE_PATH) {
            return html;
        }
        return html.replace(
            "</head>",
            `  <script defer src="https://cloud.umami.is/script.js" data-website-id="0fc5aee8-bb41-4435-bb49-08749d0263a9"></script>\n  </head>`
        );
    },
});
