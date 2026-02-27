// =============================================================================
// types.ts — Public type definitions for machina-inspect
//
// StateGraph is the intermediate representation (IR) that all analysis tools
// consume. It's a first-class export so future tools (Mermaid, ESLint rules,
// CLI) can build on the same graph without re-implementing the acorn parsing.
// =============================================================================

import type { MachinaInstance } from "machina";

// -----------------------------------------------------------------------------
// Input type
// -----------------------------------------------------------------------------

/**
 * Accepted inputs for buildStateGraph() and inspect().
 * Either a raw config object or a live Fsm/BehavioralFsm instance.
 */
export type InspectInput =
    | {
          id: string;
          initialState: string;
          states: Record<string, Record<string, unknown>>;
      }
    | MachinaInstance;

// -----------------------------------------------------------------------------
// Graph IR
// -----------------------------------------------------------------------------

/**
 * A directed transition edge in the state graph.
 * Represents a possible path from one state to another.
 */
export interface TransitionEdge {
    /** The input name that triggers this transition (or "_onEnter" for bounce transitions) */
    inputName: string;
    /** The source state */
    from: string;
    /** The target state */
    to: string;
    /**
     * Confidence level for this edge:
     * - "definite": unconditional transition (string shorthand, or sole top-level return)
     * - "possible": conditional transition (inside if/switch/ternary/logical)
     */
    confidence: "definite" | "possible";
}

/**
 * A node in the state graph — one per state.
 */
export interface StateNode {
    /** The state name */
    name: string;
    /** All outbound transition edges from this state */
    edges: TransitionEdge[];
}

/**
 * The state graph intermediate representation.
 * Built by buildStateGraph() from a config or live FSM instance.
 */
export interface StateGraph {
    /** The FSM's unique identifier */
    fsmId: string;
    /** The initial state name (BFS root for reachability analysis) */
    initialState: string;
    /** All nodes in the graph, keyed by state name */
    nodes: Record<string, StateNode>;
    /**
     * Child graphs, keyed by the parent state name.
     * Built recursively when _child FSMs are present.
     */
    children: Record<string, StateGraph>;
}

// -----------------------------------------------------------------------------
// Findings — discriminated union
// -----------------------------------------------------------------------------

/**
 * Shared fields for all finding types.
 */
export interface BaseFinding {
    /** Human-readable description of the issue */
    message: string;
    /** The FSM id where the issue was found */
    fsmId: string;
    /**
     * The relevant state name(s). For unreachable-state: the unreachable
     * state. For onenter-loop: all states in the cycle.
     * For missing-handler: the state that is missing handlers.
     */
    states: string[];
    /**
     * For child FSM findings: the parent state that owns this child FSM.
     * Undefined for top-level FSM findings.
     */
    parentState?: string;
}

/**
 * A state that has no inbound path from the initial state.
 */
export interface UnreachableFinding extends BaseFinding {
    type: "unreachable-state";
}

/**
 * An unconditional _onEnter transition cycle that will infinite-loop the runtime.
 */
export interface OnEnterLoopFinding extends BaseFinding {
    type: "onenter-loop";
}

/**
 * A state that is missing handlers for inputs that other states in the FSM handle.
 * The `inputs` field lists the input names that this state does not handle.
 * States with a `*` catch-all handler are excluded from this check.
 *
 * Limitation: only inputs visible as graph edges are included in the comparison.
 * Function handlers with no statically-extractable return are invisible to this check.
 */
export interface MissingHandlerFinding extends BaseFinding {
    type: "missing-handler";
    /** The input names that this state is missing handlers for */
    inputs: string[];
}

/**
 * A structural issue found by one of the analysis checks.
 * Discriminated by the `type` field — narrow on `finding.type` to access
 * type-specific fields like `MissingHandlerFinding.inputs`.
 */
export type Finding = UnreachableFinding | OnEnterLoopFinding | MissingHandlerFinding;
