// =============================================================================
// inspect.ts — Public API entry points
//
// inspect() is the convenience function: build graph + run all checks.
// inspectGraph() is for callers that already have a graph (e.g., tools
// that build the graph once and run multiple check passes).
// =============================================================================

import { buildStateGraph } from "./graph-builder";
import { checkUnreachable } from "./checks/unreachable";
import { checkOnEnterLoops } from "./checks/onenter-loop";
import type { StateGraph, Finding, InspectInput } from "./types";

/**
 * Build a state graph from the input and run all structural checks.
 * Returns an array of findings — empty means no issues detected.
 *
 * @param input - A config object or a live Fsm/BehavioralFsm instance
 */
export function inspect(input: InspectInput): Finding[] {
    const graph = buildStateGraph(input);
    return inspectGraph(graph);
}

/**
 * Run all structural checks against a pre-built state graph.
 * Useful when you've already called buildStateGraph() for another purpose
 * (e.g., diagram export) and want to avoid building it twice.
 *
 * @param graph - A StateGraph produced by buildStateGraph()
 */
export function inspectGraph(graph: StateGraph): Finding[] {
    return [...checkUnreachable(graph), ...checkOnEnterLoops(graph)];
}
