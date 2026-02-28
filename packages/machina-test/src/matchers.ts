// =============================================================================
// matchers.ts — Custom matcher implementations for machina FSMs
//
// Each matcher follows the expect.extend() contract:
//   - Receives the subject as `received`
//   - Returns { pass: boolean, message: () => string }
//   - `message` is always the FAILURE message — jest/vitest call it only
//     when the assertion fails (accounting for .not inversion)
//
// Invalid state names produce matcher failures, not throws, so they appear
// as clean test failures in the runner rather than unhandled exceptions.
// =============================================================================

import { buildStateGraph, inspectGraph, type StateGraph } from "machina-inspect";
import type { MachinaInstance } from "machina";
import { canReach } from "./reachability";
import type { ReachabilityOptions } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the StateGraph for the received FSM instance.
 * `buildStateGraph` accepts both config objects and live instances;
 * here we always receive live instances (users pass `expect(fsm)`).
 */
const getGraph = (received: MachinaInstance): StateGraph => {
    return buildStateGraph(received);
};

/**
 * Produce the "invalid state" failure message. Used when a state name
 * passed to a matcher does not exist in the graph.
 */
const invalidStateMessage = (stateName: string, fsmId: string, graph: StateGraph): string => {
    const available = Object.keys(graph.nodes).join(", ");
    return `State '${stateName}' does not exist in FSM '${fsmId}'. Available states: ${available}.`;
};

// ---------------------------------------------------------------------------
// Matcher: toHaveNoUnreachableStates
// ---------------------------------------------------------------------------

/**
 * Passes when the FSM has no states that are unreachable from initialState.
 * Uses inspectGraph() to run all checks and filters for unreachable-state
 * findings, which includes recursive child graph analysis.
 */
const toHaveNoUnreachableStates = (received: MachinaInstance): jest.CustomMatcherResult => {
    const graph = getGraph(received);
    const findings = inspectGraph(graph).filter(f => f.type === "unreachable-state");

    const pass = findings.length === 0;

    const message = (): string => {
        if (pass) {
            // Negated assertion failed: .not.toHaveNoUnreachableStates() but all states reachable
            return `Expected FSM '${graph.fsmId}' to have unreachable states, but all states are reachable.`;
        }
        const stateList = findings.map(f => `'${f.states.join(", ")}'`).join(", ");
        return `Expected FSM '${graph.fsmId}' to have no unreachable states, but found: ${stateList}.`;
    };

    return { pass, message };
};

// ---------------------------------------------------------------------------
// Matcher: toAlwaysReach
// ---------------------------------------------------------------------------

/**
 * Passes when a path exists from `options.from` to `targetState` in the
 * FSM's top-level graph (BFS over all edges, definite and possible).
 */
const toAlwaysReach = (
    received: MachinaInstance,
    targetState: string,
    options: ReachabilityOptions
): jest.CustomMatcherResult => {
    const graph = getGraph(received);
    const { from } = options;

    // Invalid state names are reported as matcher failures for clean output
    if (!(from in graph.nodes)) {
        return {
            pass: false,
            message: () => invalidStateMessage(from, graph.fsmId, graph),
        };
    }

    if (!(targetState in graph.nodes)) {
        return {
            pass: false,
            message: () => invalidStateMessage(targetState, graph.fsmId, graph),
        };
    }

    const pass = canReach(graph, from, targetState);

    const message = (): string => {
        if (pass) {
            // Negated assertion failed: .not.toAlwaysReach but path exists
            return `Expected FSM '${graph.fsmId}' to have no path from '${from}' to '${targetState}', but a path exists.`;
        }
        return `Expected FSM '${graph.fsmId}' to have a path from '${from}' to '${targetState}', but no path exists.`;
    };

    return { pass, message };
};

// ---------------------------------------------------------------------------
// Matcher: toNeverReach
// ---------------------------------------------------------------------------

/**
 * Passes when NO path exists from `options.from` to `targetState`.
 * The logical inverse of toAlwaysReach.
 */
const toNeverReach = (
    received: MachinaInstance,
    targetState: string,
    options: ReachabilityOptions
): jest.CustomMatcherResult => {
    const graph = getGraph(received);
    const { from } = options;

    // Invalid state names are reported as matcher failures for clean output
    if (!(from in graph.nodes)) {
        return {
            pass: false,
            message: () => invalidStateMessage(from, graph.fsmId, graph),
        };
    }

    if (!(targetState in graph.nodes)) {
        return {
            pass: false,
            message: () => invalidStateMessage(targetState, graph.fsmId, graph),
        };
    }

    // pass: true means "no path exists" (the assertion that toNeverReach checks)
    const pass = !canReach(graph, from, targetState);

    const message = (): string => {
        if (pass) {
            // Negated assertion failed: .not.toNeverReach but no path exists
            return `Expected FSM '${graph.fsmId}' to have a path from '${from}' to '${targetState}', but no path exists.`;
        }
        return `Expected FSM '${graph.fsmId}' to have no path from '${from}' to '${targetState}', but a path exists.`;
    };

    return { pass, message };
};

export { toHaveNoUnreachableStates, toAlwaysReach, toNeverReach };
