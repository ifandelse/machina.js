/**
 * machina-inspect — static analysis for machina FSM configs
 *
 * Primary entry points:
 * - `buildStateGraph(input)` — build a StateGraph IR from a config or live instance
 * - `inspect(input)` — build graph + run all checks, returns findings
 * - `inspectGraph(graph)` — run all checks against a pre-built graph
 * - `walkHandlerAst(node)` — extract transition targets from a pre-parsed handler AST node
 *
 * @module machina-inspect
 */

// Graph IR and builder
export { buildStateGraph } from "./graph-builder";

// Public API
export { inspect, inspectGraph } from "./inspect";

// Handler AST walker — shared utility for runtime and ESLint paths
export { analyzeHandler, walkHandlerAst } from "./handler-analyzer";
export type { HandlerTarget, AstFunctionNode } from "./handler-analyzer";

// Types
export type {
    StateGraph,
    StateNode,
    TransitionEdge,
    Finding,
    BaseFinding,
    UnreachableFinding,
    OnEnterLoopFinding,
    MissingHandlerFinding,
    InspectInput,
} from "./types";
