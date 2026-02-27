// =============================================================================
// export.ts — Copy mermaid source and download PNG
//
// copyMermaidSource: writes text to clipboard, falls back to a message if the
//   Clipboard API is unavailable (e.g., non-secure context).
//
// downloadPng: serializes the mermaid SVG to a canvas, exports as PNG blob,
//   then triggers a download via a temporary <a> element. Mermaid SVGs sometimes
//   lack explicit width/height — we read the viewBox and set them before drawing
//   so canvas.drawImage() has concrete dimensions to work with.
// =============================================================================

const DEFAULT_SVG_FILENAME = "fsm-diagram.svg";

/**
 * Copy the mermaid source string to the system clipboard.
 * Returns a promise that resolves once the text is written.
 * Rejects if the Clipboard API is unavailable or permission is denied.
 */
export async function copyMermaidSource(source: string): Promise<void> {
    if (!navigator.clipboard) {
        throw new Error("Clipboard API is not available in this context.");
    }
    await navigator.clipboard.writeText(source);
}

/**
 * Serialize the given SVG element and trigger a browser download.
 *
 * Mermaid SVGs use <foreignObject> for text labels, which taints any canvas
 * they're drawn onto — making PNG export via toBlob() impossible without a
 * third-party renderer. SVG download sidesteps this entirely and produces
 * better output anyway (vector, scalable, smaller file size).
 */
export function downloadSvg(svgElement: SVGElement, filename: string = DEFAULT_SVG_FILENAME): void {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, filename);
}

/**
 * Trigger a file download by creating a temporary <a> element, clicking it,
 * and immediately removing it.
 */
function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer revocation so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
