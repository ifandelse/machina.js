// =============================================================================
// mermaid-generator.ts — Convert a StateGraph + config to a mermaid string
//
// Pure function, no DOM dependencies. Kept cleanly separable so it can be
// extracted to machina-inspect if there's ever a CLI or server-side use case.
//
// Uses stateDiagram-v2 because it's a semantic match for state machines:
// [*] initial markers, rounded nodes, native subgraph support for child FSMs.
// =============================================================================

import type { StateGraph } from "machina-inspect";

// Keys that exist in a state config object but are structural, not input handlers.
// _child is structural wiring. _onEnter and _onExit are lifecycle, but we keep
// them in handler notes because they're relevant to understanding state behavior.
const STRUCTURAL_KEYS = new Set(["_child"]);

// Mermaid identifiers can't contain spaces, brackets, or special chars without quoting.
// We use the id form `state "Label" as identifier` when a name contains special chars,
// but for the diagram edges we just need safe identifiers.
const MERMAID_UNSAFE = /[\s\-.()[\]{}:,#"'`]/;

/**
 * Escape a state name to a safe mermaid identifier.
 * Mermaid stateDiagram-v2 supports quoted labels via `state "label" as id` syntax,
 * but for edges we need plain identifiers. We replace unsafe chars with underscores.
 */
function safeName(name: string): string {
    if (!MERMAID_UNSAFE.test(name)) {
        return name;
    }
    return name.replace(/[\s\-.()[\]{}:,#"'`]/g, "_");
}

/**
 * Escape a label string for use in mermaid edge labels.
 * Colons and quotes would break mermaid's edge label parsing.
 */
function safeLabel(label: string): string {
    return label.replace(/:/g, "\\:").replace(/"/g, '\\"');
}

/**
 * Render a state declaration line.
 * If the original name differs from the safe name, use the `state "label" as id` form
 * so the diagram still shows the original name.
 */
function stateDeclaration(name: string): string | null {
    const id = safeName(name);
    if (id !== name) {
        // safeLabel escapes double-quotes in the label so they don't break mermaid's
        // `state "label" as id` syntax when the state name itself contains a quote.
        return `state "${safeLabel(name)}" as ${id}`;
    }
    // No declaration needed — mermaid auto-creates the node from edge references
    return null;
}

export interface GeneratorOptions {
    handlerNotes?: boolean;
}

/**
 * Generate a mermaid stateDiagram-v2 string from a StateGraph and config.
 *
 * @param graph - The StateGraph IR from buildStateGraph()
 * @param config - The raw config object (needed for handler key enumeration)
 * @param options - Optional settings; handlerNotes adds note blocks per state
 */
export function generateMermaid(
    graph: StateGraph,
    config: Record<string, unknown>,
    options: GeneratorOptions = {}
): string {
    const lines: string[] = ["stateDiagram-v2"];
    renderGraph(graph, config, options, lines, "");
    return lines.join("\n");
}

/**
 * Render a single graph (top-level or child) into the lines array.
 * The indent parameter handles child FSM subgraph indentation.
 */
function renderGraph(
    graph: StateGraph,
    config: Record<string, unknown>,
    options: GeneratorOptions,
    lines: string[],
    indent: string
): void {
    const { initialState, nodes, children } = graph;
    const configStates = getConfigStates(config);

    // Emit state declarations for names that need escaping
    for (const stateName of Object.keys(nodes)) {
        const decl = stateDeclaration(stateName);
        if (decl !== null) {
            lines.push(indent + "    " + decl);
        }
    }

    // Initial state arrow
    lines.push(indent + "    [*] --> " + safeName(initialState));

    // Edges
    for (const node of Object.values(nodes)) {
        if (children[node.name]) {
            // States with a child FSM render as subgraphs
            renderChildState(node.name, children[node.name], config, options, lines, indent);
        }

        for (const edge of node.edges) {
            // _onEnter bounce transitions are included in edges — label them accordingly
            const labelSuffix = edge.confidence === "possible" ? " (?)" : "";
            const label = safeLabel(edge.inputName) + labelSuffix;
            lines.push(
                indent + "    " + safeName(edge.from) + " --> " + safeName(edge.to) + " : " + label
            );
        }

        // Handler notes: list all handler keys for this state from the config.
        // Uses single-line note format because mermaid's multi-line note parser
        // misinterprets handler names (like _onEnter) as state diagram syntax.
        // Mermaid silently drops notes for states with subgraph children, so we
        // skip composite states to avoid silent no-ops.
        if (options.handlerNotes === true && !children[node.name]) {
            const handlers = getHandlerKeys(configStates, node.name);
            if (handlers.length > 0) {
                const noteText = handlers.join(", ");
                lines.push(indent + "    note right of " + safeName(node.name) + " : " + noteText);
            }
        }
    }
}

/**
 * Render a state that has a child FSM as a mermaid subgraph.
 * The parent state becomes a `state parentName { ... }` block containing
 * the child FSM's own diagram content.
 */
function renderChildState(
    parentName: string,
    childGraph: StateGraph,
    config: Record<string, unknown>,
    options: GeneratorOptions,
    lines: string[],
    indent: string
): void {
    // Child FSM config lives under the parent state's _child property
    const childConfig = getChildConfig(config, parentName);

    lines.push(indent + "    state " + safeName(parentName) + " {");
    renderGraph(childGraph, childConfig, options, lines, indent + "    ");
    lines.push(indent + "    }");
}

/**
 * Extract the states object from a config, safely.
 * Returns an empty object if the config doesn't have a states field.
 */
function getConfigStates(config: Record<string, unknown>): Record<string, Record<string, unknown>> {
    if ("states" in config && typeof config.states === "object" && config.states !== null) {
        return config.states as Record<string, Record<string, unknown>>;
    }
    return {};
}

/**
 * Get the config object for a child FSM.
 * Child FSMs are live instances, so we need to reach into their states property.
 * If we can't find it, return an empty object so handler notes just omit the child.
 */
function getChildConfig(
    parentConfig: Record<string, unknown>,
    parentStateName: string
): Record<string, unknown> {
    const states = getConfigStates(parentConfig);
    const parentState = states[parentStateName];
    if (!parentState) {
        return {};
    }
    const child = parentState["_child"];
    if (typeof child === "object" && child !== null && "states" in child) {
        return child as Record<string, unknown>;
    }
    return {};
}

/**
 * Get the list of input handler keys for a state, filtering out structural keys.
 * These come from the raw config object, not the StateGraph, because handlers
 * that don't transition (side-effect-only) wouldn't appear as graph edges.
 */
function getHandlerKeys(
    configStates: Record<string, Record<string, unknown>>,
    stateName: string
): string[] {
    const stateObj = configStates[stateName];
    if (!stateObj) {
        return [];
    }
    return Object.keys(stateObj).filter(key => !STRUCTURAL_KEYS.has(key));
}
