// =============================================================================
// diagram.ts — Mermaid diagram rendering
//
// mermaid.render() is async and mutates a hidden container element.
// We give each render a unique ID to avoid stale state in mermaid's internal
// cache. The previous SVG is cleared before inserting the new one.
// =============================================================================

import mermaid from "mermaid";

let initialized = false;

// Counter for unique render IDs — mermaid's cache is keyed by element ID
let renderCounter = 0;

/**
 * Initialize mermaid once on first use.
 * Light theme to match the app's visual style.
 */
function ensureInitialized(): void {
    if (initialized) {
        return;
    }
    mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
    });
    initialized = true;
}

/**
 * Render a mermaid diagram string as an SVG into the given container.
 * Clears any previous diagram before rendering the new one.
 * Throws if mermaid fails to render (callers should catch and show an error).
 */
export async function renderDiagram(container: HTMLElement, mermaidSource: string): Promise<void> {
    ensureInitialized();

    // Clear previous content before rendering
    container.innerHTML = "";

    const id = "mermaid-render-" + ++renderCounter;

    // mermaid.render() returns { svg, bindFunctions } — we only need svg
    const { svg } = await mermaid.render(id, mermaidSource);

    container.innerHTML = svg;

    // Mermaid stamps inline max-width/height on the SVG element which prevents
    // it from filling the available container space. Strip them so our CSS rules.
    const svgEl = container.querySelector("svg");
    if (svgEl) {
        svgEl.style.maxWidth = "";
        svgEl.style.maxHeight = "";
    }
}
