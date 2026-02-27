import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { umami } from "../vite-plugin-umami";
import { workspaceSource } from "../vite-plugin-workspace-source";

export default defineConfig({
    plugins: [react(), umami(), workspaceSource()],
    base: process.env.VITE_BASE_PATH || "/",
});
