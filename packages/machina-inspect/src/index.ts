/**
 * machina-inspect — static analysis for machina FSM configs
 *
 * Primary entry points:
 * - `buildStateGraph(input)` — build a StateGraph IR from a config or live instance
 * - `inspect(input)` — build graph + run all checks, returns findings
 * - `inspectGraph(graph)` — run all checks against a pre-built graph
 *
 * @module machina-inspect
 */

// Graph IR and builder
export { buildStateGraph } from "./graph-builder";

// Public API
export { inspect, inspectGraph } from "./inspect";

// Types
export type { StateGraph, StateNode, TransitionEdge, Finding, InspectInput } from "./types";
