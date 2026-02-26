import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { umami } from "../vite-plugin-umami";

export default defineConfig({
    plugins: [react(), umami()],
    base: process.env.VITE_BASE_PATH || "/",
    optimizeDeps: {
        exclude: ["machina"],
    },
});
