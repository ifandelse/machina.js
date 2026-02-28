// =============================================================================
// reachability.ts — BFS reachability check for StateGraph
//
// Top-level graph only. Child graphs are not traversed here — users who want
// to assert reachability inside a child FSM pass the child instance directly
// to expect().
//
// Both "definite" and "possible" edges are followed. The question is whether
// the plumbing exists, not whether runtime conditions will always cause it to
// execute. See design decisions in the build plan for rationale.
// =============================================================================

import type { StateGraph } from "machina-inspect";

/**
 * Returns true if `to` is reachable from `from` via BFS over the
 * top-level graph's edges. Returns false if either state is missing
 * from the graph, or if no path exists.
 *
 * Treats `from === to` as trivially reachable (every state reaches itself).
 */
const canReach = (graph: StateGraph, from: string, to: string): boolean => {
    // Trivially reachable — a state always reaches itself
    if (from === to) {
        return true;
    }

    // If the source state isn't in the graph, there's nothing to walk
    if (!(from in graph.nodes)) {
        return false;
    }

    const visited = new Set<string>();
    const queue: string[] = [from];
    visited.add(from);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const node = graph.nodes[current];

        // Missing node is a safety check — shouldn't happen in a well-formed graph
        if (!node) {
            continue;
        }

        for (const edge of node.edges) {
            if (edge.to === to) {
                return true;
            }
            if (!visited.has(edge.to) && edge.to in graph.nodes) {
                visited.add(edge.to);
                queue.push(edge.to);
            }
        }
    }

    return false;
};

export { canReach };
