/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { checkMissingHandlers } from "./missing-handler";
import { inspect } from "../inspect";
import type { StateGraph } from "../types";

// =============================================================================
// Fixtures
// =============================================================================

function makeGraph(
    fsmId: string,
    initialState: string,
    nodes: Record<
        string,
        {
            edges: Array<{
                inputName: string;
                from: string;
                to: string;
                confidence: "definite" | "possible";
            }>;
        }
    >,
    children: Record<string, StateGraph> = {}
): StateGraph {
    return {
        fsmId,
        initialState,
        nodes: Object.fromEntries(
            Object.entries(nodes).map(([name, { edges }]) => [name, { name, edges }])
        ),
        children,
    };
}

// =============================================================================
// checkMissingHandlers
// =============================================================================

describe("checkMissingHandlers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // All states handle the same inputs — no findings
    // =========================================================================

    describe("when all states handle the same set of inputs", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const graph = makeGraph("traffic-light", "green", {
                green: {
                    edges: [
                        {
                            inputName: "timeout",
                            from: "green",
                            to: "yellow",
                            confidence: "definite",
                        },
                    ],
                },
                yellow: {
                    edges: [
                        { inputName: "timeout", from: "yellow", to: "red", confidence: "definite" },
                    ],
                },
                red: {
                    edges: [
                        { inputName: "timeout", from: "red", to: "green", confidence: "definite" },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // One state missing a handler that another handles
    // =========================================================================

    describe("when one state is missing a handler that another state has", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const graph = makeGraph("door-fsm", "closed", {
                closed: {
                    edges: [
                        { inputName: "open", from: "closed", to: "open", confidence: "definite" },
                        { inputName: "lock", from: "closed", to: "locked", confidence: "definite" },
                    ],
                },
                // "open" state handles "close" but not "lock"
                open: {
                    edges: [
                        { inputName: "close", from: "open", to: "closed", confidence: "definite" },
                    ],
                },
                locked: {
                    edges: [
                        {
                            inputName: "unlock",
                            from: "locked",
                            to: "closed",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return findings for states with missing handlers", () => {
            expect(result.length).toBeGreaterThan(0);
        });

        it("should include the 'open' state in findings", () => {
            const openFinding = result.find(f => f.states.includes("open"));
            expect(openFinding).toBeDefined();
        });

        it("should list missing inputs on the finding", () => {
            const openFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("open"));
            expect(openFinding?.inputs).toEqual(expect.arrayContaining(["lock"]));
        });

        it("should set the finding type to missing-handler", () => {
            const openFinding = result.find(f => f.states.includes("open"));
            expect(openFinding?.type).toBe("missing-handler");
        });

        it("should set the correct fsmId", () => {
            const openFinding = result.find(f => f.states.includes("open"));
            expect(openFinding?.fsmId).toBe("door-fsm");
        });

        it("should not set parentState for top-level findings", () => {
            const openFinding = result.find(f => f.states.includes("open"));
            expect(openFinding?.parentState).toBeUndefined();
        });
    });

    // =========================================================================
    // State with * catch-all is skipped entirely
    // =========================================================================

    describe("when a state has a * catch-all handler", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const graph = makeGraph("wildcard-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "start", from: "idle", to: "running", confidence: "definite" },
                        { inputName: "ping", from: "idle", to: "idle", confidence: "definite" },
                    ],
                },
                // "running" handles everything via * — should NOT be flagged
                running: {
                    edges: [
                        { inputName: "*", from: "running", to: "idle", confidence: "definite" },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should not report the state with a * catch-all", () => {
            const runningFinding = result.find(f => f.states.includes("running"));
            expect(runningFinding).toBeUndefined();
        });
    });

    // =========================================================================
    // State handles a subset of the global input union
    // =========================================================================

    describe("when a state handles a strict subset of all known inputs", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // "terminal" only handles "reset" but not "start" or "pause"
            const graph = makeGraph("multi-input-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "start", from: "idle", to: "running", confidence: "definite" },
                        { inputName: "pause", from: "idle", to: "paused", confidence: "definite" },
                    ],
                },
                running: {
                    edges: [
                        {
                            inputName: "pause",
                            from: "running",
                            to: "paused",
                            confidence: "definite",
                        },
                        { inputName: "reset", from: "running", to: "idle", confidence: "definite" },
                    ],
                },
                paused: {
                    edges: [
                        {
                            inputName: "start",
                            from: "paused",
                            to: "running",
                            confidence: "definite",
                        },
                        { inputName: "reset", from: "paused", to: "idle", confidence: "definite" },
                    ],
                },
                // "terminal" only handles "reset" — missing "start" and "pause"
                terminal: {
                    edges: [
                        {
                            inputName: "reset",
                            from: "terminal",
                            to: "idle",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should find a missing-handler finding for the terminal state", () => {
            const terminalFinding = result.find(f => f.states.includes("terminal"));
            expect(terminalFinding).toBeDefined();
        });

        it("should list all missing inputs for the terminal state", () => {
            const terminalFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("terminal"));
            expect(terminalFinding?.inputs).toEqual(expect.arrayContaining(["start", "pause"]));
        });

        it("should not include the input the terminal state already handles", () => {
            const terminalFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("terminal"));
            expect(terminalFinding?.inputs).not.toContain("reset");
        });
    });

    // =========================================================================
    // Single-state FSM — no comparison possible, no findings
    // =========================================================================

    describe("when the FSM has only one state", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const graph = makeGraph("solo-fsm", "only", {
                only: {
                    edges: [
                        {
                            inputName: "ping",
                            from: "only",
                            to: "only",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return no findings", () => {
            // The only state's inputs == global union — nothing is missing.
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Child FSM with missing handler
    // =========================================================================

    describe("when a child FSM has a state missing handlers", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const childGraph = makeGraph("sub-fsm", "loading", {
                loading: {
                    edges: [
                        {
                            inputName: "done",
                            from: "loading",
                            to: "loaded",
                            confidence: "definite",
                        },
                        {
                            inputName: "fail",
                            from: "loading",
                            to: "error",
                            confidence: "definite",
                        },
                    ],
                },
                loaded: {
                    edges: [
                        { inputName: "done", from: "loaded", to: "loaded", confidence: "definite" },
                        // "loaded" does not handle "fail"
                    ],
                },
                error: {
                    edges: [
                        { inputName: "fail", from: "error", to: "error", confidence: "definite" },
                        // "error" does not handle "done"
                    ],
                },
            });
            const parentGraph = makeGraph(
                "parent-fsm",
                "ready",
                {
                    ready: { edges: [] },
                },
                { ready: childGraph }
            );
            result = checkMissingHandlers(parentGraph);
        });

        it("should report findings from the child FSM", () => {
            expect(result.some(f => f.fsmId === "sub-fsm")).toBe(true);
        });

        it("should attribute the finding to the child FSM's id", () => {
            const childFinding = result.find(f => f.fsmId === "sub-fsm");
            expect(childFinding?.fsmId).toBe("sub-fsm");
        });

        it("should set parentState to the parent state owning the child", () => {
            const childFinding = result.find(f => f.fsmId === "sub-fsm");
            expect(childFinding?.parentState).toBe("ready");
        });
    });

    // =========================================================================
    // State with only _onEnter edges is missing all real inputs
    // =========================================================================

    describe("when a state has only _onEnter edges and no named input handlers", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // "bounce" only has an _onEnter edge — _onEnter is excluded from
            // the input union, so "bounce" is seen as handling zero real inputs.
            // The global union includes "start" from "idle", so "bounce" is flagged.
            const graph = makeGraph("bounce-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "start", from: "idle", to: "bounce", confidence: "definite" },
                    ],
                },
                bounce: {
                    edges: [
                        {
                            inputName: "_onEnter",
                            from: "bounce",
                            to: "idle",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should report the state with only _onEnter edges as missing named input handlers", () => {
            const bounceFinding = result.find(f => f.states.includes("bounce"));
            expect(bounceFinding).toBeDefined();
        });

        it("should list the missing named inputs", () => {
            const bounceFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("bounce"));
            expect(bounceFinding?.inputs).toContain("start");
        });
    });

    // =========================================================================
    // inspect() integration — config with missing handler returns the finding
    // =========================================================================

    describe("when inspect() is called on a config with a missing handler", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect({
                id: "inspect-integration-fsm",
                initialState: "idle",
                states: {
                    idle: { start: "running" as any },
                    // "running" has no "start" handler
                    running: { stop: "idle" as any },
                },
            } as any);
        });

        it("should include a missing-handler finding", () => {
            expect(result.some(f => f.type === "missing-handler")).toBe(true);
        });

        it("should attribute the finding to the correct FSM", () => {
            const mhFinding = result.find(f => f.type === "missing-handler");
            expect(mhFinding?.fsmId).toBe("inspect-integration-fsm");
        });
    });

    // =========================================================================
    // Empty states object — allInputs.size === 0, early return
    // =========================================================================

    describe("when the FSM has no states at all", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            const graph = makeGraph("empty-fsm", "nowhere", {});
            result = checkMissingHandlers(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // All states have only _onEnter edges — allInputs.size === 0, early return
    // =========================================================================

    describe("when every state has only _onEnter edges and no named inputs exist anywhere", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // Both states only have _onEnter — _onEnter is excluded from allInputs,
            // so the global input union is empty. Early return fires.
            const graph = makeGraph("all-lifecycle-fsm", "alpha", {
                alpha: {
                    edges: [
                        {
                            inputName: "_onEnter",
                            from: "alpha",
                            to: "beta",
                            confidence: "definite",
                        },
                    ],
                },
                beta: {
                    edges: [
                        {
                            inputName: "_onEnter",
                            from: "beta",
                            to: "alpha",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Large FSM — many states, only one missing a single handler
    // =========================================================================

    describe("when a large FSM has many states and only one is missing one handler", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // 5 states all handling "ping" and "reset", except "terminal" which
            // only handles "ping". Only "terminal" should be flagged.
            const graph = makeGraph("galaxy-brain-fsm", "alpha", {
                alpha: {
                    edges: [
                        { inputName: "ping", from: "alpha", to: "alpha", confidence: "definite" },
                        { inputName: "reset", from: "alpha", to: "beta", confidence: "definite" },
                    ],
                },
                beta: {
                    edges: [
                        { inputName: "ping", from: "beta", to: "beta", confidence: "definite" },
                        { inputName: "reset", from: "beta", to: "gamma", confidence: "definite" },
                    ],
                },
                gamma: {
                    edges: [
                        { inputName: "ping", from: "gamma", to: "gamma", confidence: "definite" },
                        { inputName: "reset", from: "gamma", to: "delta", confidence: "definite" },
                    ],
                },
                delta: {
                    edges: [
                        { inputName: "ping", from: "delta", to: "delta", confidence: "definite" },
                        {
                            inputName: "reset",
                            from: "delta",
                            to: "terminal",
                            confidence: "definite",
                        },
                    ],
                },
                // "terminal" only handles "ping" — missing "reset"
                terminal: {
                    edges: [
                        {
                            inputName: "ping",
                            from: "terminal",
                            to: "terminal",
                            confidence: "definite",
                        },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return exactly one finding", () => {
            expect(result).toHaveLength(1);
        });

        it("should flag only the terminal state", () => {
            expect(result[0].states).toEqual(["terminal"]);
        });

        it("should list only the missing reset input", () => {
            const finding = result.find(f => f.type === "missing-handler");
            expect(finding?.inputs).toEqual(["reset"]);
        });
    });

    // =========================================================================
    // Multiple states each missing different inputs (asymmetric)
    // =========================================================================

    describe("when multiple states are each missing different inputs from each other", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // "red" handles only "go", "blue" handles only "stop", "green" handles both
            const graph = makeGraph("rgb-fsm", "green", {
                green: {
                    edges: [
                        { inputName: "go", from: "green", to: "red", confidence: "definite" },
                        { inputName: "stop", from: "green", to: "blue", confidence: "definite" },
                    ],
                },
                red: {
                    edges: [{ inputName: "go", from: "red", to: "green", confidence: "definite" }],
                },
                blue: {
                    edges: [
                        { inputName: "stop", from: "blue", to: "green", confidence: "definite" },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should return findings for both asymmetric states", () => {
            expect(result).toHaveLength(2);
        });

        it("should flag red as missing stop", () => {
            const redFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("red"));
            expect(redFinding?.inputs).toEqual(["stop"]);
        });

        it("should flag blue as missing go", () => {
            const blueFinding = result
                .filter(f => f.type === "missing-handler")
                .find(f => f.states.includes("blue"));
            expect(blueFinding?.inputs).toEqual(["go"]);
        });
    });

    // =========================================================================
    // State with * PLUS named handlers — entire state skipped
    // =========================================================================

    describe("when a state has both a * catch-all and named handlers", () => {
        let result: ReturnType<typeof checkMissingHandlers>;

        beforeEach(() => {
            // "running" has "*" AND "stop" — because it has "*", it's skipped entirely,
            // even though the other states handle "start" which "running" also handles via "*".
            const graph = makeGraph("mixed-catch-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "start", from: "idle", to: "running", confidence: "definite" },
                        { inputName: "ping", from: "idle", to: "idle", confidence: "definite" },
                    ],
                },
                running: {
                    edges: [
                        { inputName: "*", from: "running", to: "idle", confidence: "definite" },
                        { inputName: "stop", from: "running", to: "idle", confidence: "definite" },
                    ],
                },
            });
            result = checkMissingHandlers(graph);
        });

        it("should not flag the state that has a * alongside named handlers", () => {
            const runningFinding = result.find(f => f.states.includes("running"));
            expect(runningFinding).toBeUndefined();
        });
    });
});
