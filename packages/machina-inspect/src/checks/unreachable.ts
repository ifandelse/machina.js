// =============================================================================
// unreachable.ts — Detect states with no inbound path from initialState
//
// BFS from initialState, following ALL edges (definite and possible).
// Any node not reached is unreachable. Child graphs are analyzed independently
// from their own initialState.
// =============================================================================

import type { StateGraph, Finding } from "../types";

/**
 * Check for unreachable states in the graph.
 * BFS from initialState — any unvisited node is a finding.
 * Recurses into child graphs independently.
 */
export function checkUnreachable(graph: StateGraph, parentState?: string): Finding[] {
    const findings: Finding[] = [];

    findings.push(...findUnreachableInGraph(graph, parentState));

    for (const [childParentState, childGraph] of Object.entries(graph.children)) {
        findings.push(...checkUnreachable(childGraph, childParentState));
    }

    return findings;
}

function findUnreachableInGraph(graph: StateGraph, parentState?: string): Finding[] {
    const { fsmId, initialState, nodes } = graph;
    const visited = new Set<string>();
    const queue: string[] = [];

    if (initialState in nodes) {
        queue.push(initialState);
        visited.add(initialState);
    }

    while (queue.length > 0) {
        const current = queue.shift()!;
        const node = nodes[current];
        if (!node) {
            continue;
        }
        for (const edge of node.edges) {
            if (!visited.has(edge.to) && edge.to in nodes) {
                visited.add(edge.to);
                queue.push(edge.to);
            }
        }
    }

    const findings: Finding[] = [];
    for (const stateName of Object.keys(nodes)) {
        if (!visited.has(stateName)) {
            findings.push({
                type: "unreachable-state",
                message: `State "${stateName}" is unreachable from initialState "${initialState}" in FSM "${fsmId}".`,
                fsmId,
                states: [stateName],
                parentState,
            });
        }
    }

    return findings;
}
