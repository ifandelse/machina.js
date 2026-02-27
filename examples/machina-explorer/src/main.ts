// =============================================================================
// main.ts — machina-explorer entry point
//
// Wires together: CodeMirror editor → evaluator → buildStateGraph + inspectGraph
// → report renderer + mermaid diagram + export buttons.
//
// State is kept at module scope so the handler notes toggle can re-generate the
// diagram without re-running eval + inspect. Re-analysis only happens on Analyze
// button click.
// =============================================================================

import "./style.css";
import { createEditor } from "./editor";
import { evaluateConfig } from "./evaluator";
import { renderFindings, renderError, renderClean } from "./report";
import { generateMermaid } from "./mermaid-generator";
import { renderDiagram } from "./diagram";
import { copyMermaidSource, downloadSvg } from "./export";
import { buildStateGraph, inspectGraph } from "machina-inspect";
import type { StateGraph } from "machina-inspect";

// ---------------------------------------------------------------------------
// DOM elements — all required, will throw if missing (hard fail is intentional)
// ---------------------------------------------------------------------------

const editorContainer = document.getElementById("editor-container") as HTMLElement;
const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement;
const findingsContainer = document.getElementById("findings-container") as HTMLElement;
const findingsSection = document.getElementById("findings-section") as HTMLElement;
const diagramSection = document.getElementById("diagram-section") as HTMLElement;
const diagramContainer = document.getElementById("diagram-container") as HTMLElement;
const diagramActions = document.getElementById("diagram-actions") as HTMLElement;
const handlerNotesToggle = document.getElementById("handler-notes-toggle") as HTMLInputElement;
const handlerNotesLabel = document.getElementById("handler-notes-label") as HTMLElement;
const copyMermaidBtn = document.getElementById("copy-mermaid-btn") as HTMLButtonElement;
const downloadSvgBtn = document.getElementById("download-svg-btn") as HTMLButtonElement;
const tabDiagram = document.getElementById("tab-diagram") as HTMLButtonElement;
const tabFindings = document.getElementById("tab-findings") as HTMLButtonElement;

// ---------------------------------------------------------------------------
// Persistent analysis state
// State is stored after a successful analysis so the handler notes toggle can
// re-render the diagram without re-running eval + inspect.
// ---------------------------------------------------------------------------

let currentGraph: StateGraph | null = null;
let currentConfig: Record<string, unknown> | null = null;
let currentMermaidSource: string | null = null;

// ---------------------------------------------------------------------------
// Editor setup
// ---------------------------------------------------------------------------

const editor = createEditor(editorContainer);

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function switchTab(tab: "diagram" | "findings"): void {
    const isDiagram = tab === "diagram";
    tabDiagram.classList.toggle("active", isDiagram);
    tabDiagram.setAttribute("aria-selected", String(isDiagram));
    tabFindings.classList.toggle("active", !isDiagram);
    tabFindings.setAttribute("aria-selected", String(!isDiagram));

    diagramSection.hidden = !isDiagram;
    findingsSection.hidden = isDiagram;

    // Only show handler notes toggle on the diagram tab
    handlerNotesLabel.hidden = !isDiagram;
}

tabDiagram.addEventListener("click", () => switchTab("diagram"));
tabFindings.addEventListener("click", () => switchTab("findings"));

// ---------------------------------------------------------------------------
// Analyze flow
// ---------------------------------------------------------------------------

analyzeBtn.addEventListener("click", async () => {
    const source = editor.getValue();

    const evalResult = evaluateConfig(source);
    if (!evalResult.ok) {
        renderError(findingsContainer, evalResult.error);
        // Clear previous diagram state on eval failure
        currentGraph = null;
        currentConfig = null;
        currentMermaidSource = null;
        diagramActions.hidden = true;
        diagramContainer.innerHTML = "";
        return;
    }

    let graph: StateGraph;
    try {
        graph = buildStateGraph(evalResult.config);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        renderError(findingsContainer, "Graph build failed: " + msg);
        return;
    }

    const findings = inspectGraph(graph);

    if (findings.length === 0) {
        renderClean(findingsContainer);
    } else {
        renderFindings(findingsContainer, findings);
    }

    // Store for diagram re-render on toggle
    currentGraph = graph;
    currentConfig = evalResult.config as Record<string, unknown>;

    await refreshDiagram();

    // Default to findings tab after analysis
    switchTab("findings");
});

// ---------------------------------------------------------------------------
// Diagram rendering
// ---------------------------------------------------------------------------

async function refreshDiagram(): Promise<void> {
    if (!currentGraph || !currentConfig) {
        return;
    }

    const mermaidSource = generateMermaid(currentGraph, currentConfig, {
        handlerNotes: handlerNotesToggle.checked,
    });

    currentMermaidSource = mermaidSource;

    try {
        await renderDiagram(diagramContainer, mermaidSource);
        diagramActions.hidden = false;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        diagramContainer.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className = "diagram-error";
        errEl.textContent = "Diagram render failed: " + msg;
        diagramContainer.appendChild(errEl);
        diagramActions.hidden = true;
    }
}

handlerNotesToggle.addEventListener("change", () => {
    void refreshDiagram();
});

// ---------------------------------------------------------------------------
// Export — copy mermaid source
// ---------------------------------------------------------------------------

copyMermaidBtn.addEventListener("click", async () => {
    if (!currentMermaidSource) {
        return;
    }

    const originalText = copyMermaidBtn.textContent ?? "Copy Mermaid";

    try {
        await copyMermaidSource(currentMermaidSource);
        copyMermaidBtn.textContent = "Copied!";
    } catch (_err) {
        copyMermaidBtn.textContent = "Copy failed";
    }

    // Reset button text after a short delay
    setTimeout(() => {
        copyMermaidBtn.textContent = originalText;
    }, 2000);
});

// ---------------------------------------------------------------------------
// Export — download PNG
// ---------------------------------------------------------------------------

downloadSvgBtn.addEventListener("click", () => {
    const svgEl = diagramContainer.querySelector("svg");
    if (!svgEl) {
        return;
    }

    const fsmId = currentGraph?.fsmId ?? "fsm";
    downloadSvg(svgEl as SVGElement, fsmId + "-diagram.svg");
});
