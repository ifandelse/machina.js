import { defineConfig } from "vite";
import { umami } from "../vite-plugin-umami";
import { workspaceSource } from "../vite-plugin-workspace-source";

export default defineConfig({
    plugins: [umami(), workspaceSource()],
    base: process.env.VITE_BASE_PATH || "/",
});
