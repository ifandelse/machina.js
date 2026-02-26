import { defineConfig } from "vite";
import { umami } from "../vite-plugin-umami";

export default defineConfig({
    plugins: [umami()],
    base: process.env.VITE_BASE_PATH || "/",
    optimizeDeps: {
        exclude: ["machina"],
    },
});
