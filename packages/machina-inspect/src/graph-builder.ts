// =============================================================================
// graph-builder.ts — Build a StateGraph IR from an FSM config or live instance
//
// Two input shapes exist:
//   1. Config object (pre-instantiation) — _child values are raw FSM instances
//   2. Live instance (post-construction) — _child values are ChildLink wrappers
//      (BehavioralFsm mutates config.states in-place during wrapChildLinks())
//
// The MACHINA_TYPE symbol discriminates between config and live instance inputs,
// and between raw FSM instances and ChildLink wrappers on _child fields.
// =============================================================================

import { MACHINA_TYPE, type ChildLink } from "machina";
import { analyzeHandler } from "./handler-analyzer";
import type { StateGraph, StateNode, TransitionEdge, InspectInput } from "./types";

// Keys that are lifecycle/structural — not input handlers
const SPECIAL_KEYS = new Set(["_onEnter", "_onExit", "_child"]);

// Shape of what we need from a live FSM instance
interface FsmLike {
    id: string;
    initialState: string;
    states: Record<string, Record<string, unknown>>;
}

/**
 * Normalize the input to a consistent internal shape.
 * Config objects are passed through; live instances have their
 * public fields extracted.
 */
function normalizeInput(input: InspectInput): FsmLike {
    // Live instance: has MACHINA_TYPE stamped on it
    if (MACHINA_TYPE in (input as object)) {
        const instance = input as unknown as FsmLike & { [key: symbol]: string };
        return {
            id: instance.id,
            initialState: instance.initialState,
            states: instance.states,
        };
    }
    // Config object: read directly
    return input as FsmLike;
}

/**
 * Extract transition edges from a single handler value.
 * String shorthands produce one definite edge. Function handlers
 * are analyzed by the acorn-based handler-analyzer.
 */
function extractEdges(
    fromState: string,
    inputName: string,
    handlerValue: unknown
): TransitionEdge[] {
    if (typeof handlerValue === "string") {
        return [{ inputName, from: fromState, to: handlerValue, confidence: "definite" }];
    }

    if (typeof handlerValue === "function") {
        const targets = analyzeHandler(handlerValue as (...args: unknown[]) => unknown);
        return targets.map(({ target, confidence }) => ({
            inputName,
            from: fromState,
            to: target,
            confidence,
        }));
    }

    return [];
}

/**
 * Detect whether a _child value is a ChildLink wrapper (post-construction)
 * vs a raw FSM instance (pre-construction config path).
 *
 * ChildLink objects have a `canHandle` method and an `instance` field.
 * Raw FSM instances have MACHINA_TYPE stamped on them.
 */
function isChildLink(value: unknown): value is ChildLink {
    return (
        typeof value === "object" && value !== null && "canHandle" in value && "instance" in value
    );
}

/**
 * Detect a plain config object that looks like an FSM config (has `initialState`
 * and `states`). This covers eval'd user input in the explorer, where _child is
 * a bare object literal rather than a createFsm() instance.
 */
function isConfigShaped(value: unknown): value is FsmLike {
    return (
        typeof value === "object" && value !== null && "initialState" in value && "states" in value
    );
}

/**
 * Build a StateGraph from an FSM config or live instance.
 * Child FSMs declared via _child are recursively built into child graphs.
 *
 * @param input - A config object or a live Fsm/BehavioralFsm instance
 */
export function buildStateGraph(input: InspectInput): StateGraph {
    const fsm = normalizeInput(input);
    const nodes: Record<string, StateNode> = {};
    const children: Record<string, StateGraph> = {};

    for (const stateName of Object.keys(fsm.states)) {
        const stateObj = fsm.states[stateName];
        const edges: TransitionEdge[] = [];

        for (const key of Object.keys(stateObj)) {
            const value = stateObj[key];

            if (key === "_child") {
                // _child values come in three shapes:
                //   1. ChildLink wrapper (live instance post-construction)
                //   2. Raw FSM instance with MACHINA_TYPE (config passed a createFsm() result)
                //   3. Plain config object with initialState + states (e.g. from eval'd user input)
                if (isChildLink(value)) {
                    children[stateName] = buildStateGraph(
                        value.instance as unknown as InspectInput
                    );
                } else if (typeof value === "object" && value !== null && MACHINA_TYPE in value) {
                    children[stateName] = buildStateGraph(value as unknown as InspectInput);
                } else if (isConfigShaped(value)) {
                    children[stateName] = buildStateGraph(value as unknown as InspectInput);
                }
                continue;
            }

            if (SPECIAL_KEYS.has(key)) {
                // _onEnter / _onExit: analyze function handlers for bounce edges,
                // but label them with source "_onEnter" or "_onExit" so the
                // loop detector can find them.
                if (key === "_onEnter" && typeof value === "function") {
                    const targets = analyzeHandler(value as (...args: unknown[]) => unknown);
                    for (const { target, confidence } of targets) {
                        edges.push({
                            inputName: "_onEnter",
                            from: stateName,
                            to: target,
                            confidence,
                        });
                    }
                }
                continue;
            }

            // Regular input handlers (including catch-all "*")
            for (const edge of extractEdges(stateName, key, value)) {
                edges.push(edge);
            }
        }

        nodes[stateName] = { name: stateName, edges };
    }

    const graph: StateGraph = {
        fsmId: fsm.id,
        initialState: fsm.initialState,
        nodes,
        children,
    };

    return graph;
}
