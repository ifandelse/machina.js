// =============================================================================
// onenter-loop.ts — Detect unconditional _onEnter transition cycles
//
// Only reports cycles where ALL edges are "definite" (unconditional).
// Conditional _onEnter bounces are an intentional pattern — not bugs.
// Self-loops are excluded: the runtime silently ignores same-state transitions.
// =============================================================================

import type { StateGraph, Finding } from "../types";

/**
 * Check for _onEnter transition loops in the graph.
 * Only reports cycles where every edge is "definite".
 * Recurses into child graphs.
 */
export function checkOnEnterLoops(graph: StateGraph, parentState?: string): Finding[] {
    const findings: Finding[] = [];

    findings.push(...findOnEnterLoopsInGraph(graph, parentState));

    for (const [childParentState, childGraph] of Object.entries(graph.children)) {
        findings.push(...checkOnEnterLoops(childGraph, childParentState));
    }

    return findings;
}

function findOnEnterLoopsInGraph(graph: StateGraph, parentState?: string): Finding[] {
    const { fsmId, nodes } = graph;

    // Build the _onEnter-only subgraph: edges where inputName === "_onEnter"
    // and confidence === "definite", excluding self-loops (same-state transitions
    // are no-ops in the runtime — they hit the same-state guard and return early).
    const onEnterEdges: Record<string, string[]> = {};

    for (const [stateName, node] of Object.entries(nodes)) {
        const definiteOnEnterTargets = node.edges
            .filter(
                e => e.inputName === "_onEnter" && e.confidence === "definite" && e.to !== stateName // exclude self-loops
            )
            .map(e => e.to);

        if (definiteOnEnterTargets.length > 0) {
            onEnterEdges[stateName] = definiteOnEnterTargets;
        }
    }

    // DFS cycle detection on the _onEnter subgraph.
    // We use the "white-gray-black" algorithm: unvisited, in-stack, done.
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color: Record<string, number> = {};

    for (const stateName of Object.keys(nodes)) {
        color[stateName] = WHITE;
    }

    const findings: Finding[] = [];
    const reportedCycles = new Set<string>();

    const dfs = (node: string, stack: string[]): void => {
        color[node] = GRAY;
        stack.push(node);

        for (const neighbor of onEnterEdges[node] ?? []) {
            if (color[neighbor] === GRAY) {
                // Found a back edge — extract the cycle from the stack
                const cycleStart = stack.indexOf(neighbor);
                const cycle = stack.slice(cycleStart);

                // Deduplicate: sort cycle members to produce a canonical key
                const cycleKey = [...cycle].sort().join(",");
                if (!reportedCycles.has(cycleKey)) {
                    reportedCycles.add(cycleKey);
                    findings.push({
                        type: "onenter-loop",
                        message:
                            `Unconditional _onEnter loop detected in FSM "${fsmId}": ` +
                            cycle.join(" → ") +
                            ` → ${neighbor}`,
                        fsmId,
                        states: cycle,
                        parentState,
                    });
                }
            } else if (color[neighbor] === WHITE) {
                dfs(neighbor, stack);
            }
        }

        stack.pop();
        color[node] = BLACK;
    };

    for (const stateName of Object.keys(nodes)) {
        if (color[stateName] === WHITE) {
            dfs(stateName, []);
        }
    }

    return findings;
}
