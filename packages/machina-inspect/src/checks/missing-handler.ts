// =============================================================================
// missing-handler.ts — Detect states missing handlers for known inputs
//
// Collects the union of all input names across all edges in a graph
// (excluding _onEnter, _onExit, and *), then flags any state that handles
// fewer inputs than the global union — unless that state has a * catch-all,
// which implicitly handles every input.
//
// Limitation: Only inputs visible as graph edges are included. Function
// handlers that produce no statically-extractable return target are invisible
// to the graph, so the input union may be incomplete. This check is
// best-effort and operates on what the graph knows.
//
// Does NOT recurse into child graphs automatically — child graphs have their
// own independent input sets. The top-level checkMissingHandlers recurses
// into children the same way all other checks do.
// =============================================================================

import type { StateGraph, Finding } from "../types";

// These are structural keys in the state object, not real inputs.
// Including them in the "all inputs" union would cause false positives
// on every FSM.
const EXCLUDED_INPUTS = new Set(["_onEnter", "_onExit", "*"]);

/**
 * Check for states with missing handlers relative to the FSM's full input set.
 * States with a `*` catch-all edge are skipped entirely.
 * Recurses into child graphs independently.
 */
export function checkMissingHandlers(graph: StateGraph, parentState?: string): Finding[] {
    const findings: Finding[] = [];

    findings.push(...findMissingHandlersInGraph(graph, parentState));

    for (const [childParentState, childGraph] of Object.entries(graph.children)) {
        findings.push(...checkMissingHandlers(childGraph, childParentState));
    }

    return findings;
}

function findMissingHandlersInGraph(graph: StateGraph, parentState?: string): Finding[] {
    const { fsmId, nodes } = graph;

    // Collect the global input union: every inputName across all edges in
    // all states, minus the structural keys we never want to check.
    const allInputs = new Set<string>();
    for (const node of Object.values(nodes)) {
        for (const edge of node.edges) {
            if (!EXCLUDED_INPUTS.has(edge.inputName)) {
                allInputs.add(edge.inputName);
            }
        }
    }

    // Nothing to compare if the FSM has no named inputs at all (e.g., single
    // state with only _onEnter, or an empty FSM).
    if (allInputs.size === 0) {
        return [];
    }

    const findings: Finding[] = [];

    for (const [stateName, node] of Object.entries(nodes)) {
        // States with a * catch-all handle every input by definition.
        // Reporting missing handlers here would always be a false positive.
        const hasCatchAll = node.edges.some(e => e.inputName === "*");
        if (hasCatchAll) {
            continue;
        }

        // Collect the inputs this state explicitly handles (via edges).
        const stateInputs = new Set<string>();
        for (const edge of node.edges) {
            if (!EXCLUDED_INPUTS.has(edge.inputName)) {
                stateInputs.add(edge.inputName);
            }
        }

        // Diff: inputs the FSM knows about that this state doesn't handle.
        const missingInputs = [...allInputs].filter(input => !stateInputs.has(input));

        if (missingInputs.length > 0) {
            findings.push({
                type: "missing-handler",
                message:
                    `State "${stateName}" in FSM "${fsmId}" is missing handlers for: ` +
                    missingInputs.map(i => `"${i}"`).join(", ") +
                    ".",
                fsmId,
                states: [stateName],
                inputs: missingInputs,
                parentState,
            });
        }
    }

    return findings;
}
