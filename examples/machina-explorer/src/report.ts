// =============================================================================
// report.ts — DOM renderers for inspect findings
//
// Avoids innerHTML with user content to prevent XSS. All text is set via
// textContent or safe DOM methods. No user-supplied strings go into innerHTML.
// =============================================================================

import type { Finding } from "machina-inspect";

// Human-readable type labels for each finding type
const TYPE_LABELS: Record<Finding["type"], string> = {
    "unreachable-state": "Unreachable State",
    "onenter-loop": "onEnter Loop",
    "missing-handler": "Missing Handler",
};

/**
 * Render a list of findings into the container.
 * Each finding gets its own styled list item.
 */
export function renderFindings(container: HTMLElement, findings: Finding[]): void {
    container.innerHTML = "";

    const list = document.createElement("ul");
    list.className = "finding-list";

    for (const finding of findings) {
        const item = document.createElement("li");
        item.className = "finding-item";

        const typeEl = document.createElement("div");
        typeEl.className = "finding-type";
        typeEl.textContent = TYPE_LABELS[finding.type] ?? finding.type;

        const msgEl = document.createElement("p");
        msgEl.className = "finding-message";
        msgEl.textContent = finding.message;

        item.appendChild(typeEl);
        item.appendChild(msgEl);

        if (finding.states.length > 0) {
            const statesEl = document.createElement("div");
            statesEl.className = "finding-states";
            statesEl.textContent = "States: " + finding.states.join(", ");
            item.appendChild(statesEl);
        }

        // MissingHandlerFinding has an `inputs` field — surface it if present
        if (finding.type === "missing-handler") {
            const inputsEl = document.createElement("div");
            inputsEl.className = "finding-states";
            inputsEl.textContent = "Missing inputs: " + finding.inputs.join(", ");
            item.appendChild(inputsEl);
        }

        list.appendChild(item);
    }

    container.appendChild(list);
}

/**
 * Render an error message into the container (eval failure, inspect crash, etc.).
 * Uses a pre-like element so stack traces are readable.
 */
export function renderError(container: HTMLElement, message: string): void {
    container.innerHTML = "";

    const el = document.createElement("pre");
    el.className = "findings-error";
    el.textContent = message;

    container.appendChild(el);
}

/**
 * Render a "no findings" clean state into the container.
 */
export function renderClean(container: HTMLElement): void {
    container.innerHTML = "";

    const el = document.createElement("div");
    el.className = "findings-clean";
    el.textContent = "No issues found — config looks clean.";

    container.appendChild(el);
}
