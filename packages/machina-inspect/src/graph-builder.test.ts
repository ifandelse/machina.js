/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { buildStateGraph } from "./graph-builder";
import { createFsm, createBehavioralFsm } from "machina";

// =============================================================================
// Fixtures
// =============================================================================

function makeSimpleConfig() {
    return {
        id: "traffic-light",
        initialState: "green",
        states: {
            green: { timeout: "yellow" },
            yellow: { timeout: "red" },
            red: { timeout: "green" },
        },
    };
}

function makeSingleStateConfig() {
    return {
        id: "single",
        initialState: "idle",
        states: {
            idle: {},
        },
    };
}

function makeEmptyStatesConfig() {
    return {
        id: "empty",
        initialState: "only",
        states: {
            only: {},
        },
    };
}

function makeConfigWithLifecycleHooks() {
    return {
        id: "with-hooks",
        initialState: "active",
        states: {
            active: {
                _onEnter({ ctx }: any) {
                    ctx.entered = true;
                },
                _onExit({ ctx }: any) {
                    ctx.exited = true;
                },
                stop: "idle",
            },
            idle: {
                start: "active",
            },
        },
    };
}

function makeChildFsm() {
    return createFsm({
        id: "child-upload",
        initialState: "idle",
        states: {
            idle: { begin: "uploading" },
            uploading: { done: "idle" },
        },
    });
}

// =============================================================================
// buildStateGraph
// =============================================================================

describe("buildStateGraph", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // String shorthand handlers
    // =========================================================================

    describe("when given a config with only string shorthand handlers", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph(makeSimpleConfig());
        });

        it("should set fsmId from config.id", () => {
            expect(result.fsmId).toBe("traffic-light");
        });

        it("should set initialState from config.initialState", () => {
            expect(result.initialState).toBe("green");
        });

        it("should contain a node for every state", () => {
            expect(Object.keys(result.nodes)).toEqual(
                expect.arrayContaining(["green", "yellow", "red"])
            );
        });

        it("should produce a definite edge for each string shorthand", () => {
            const greenEdges = result.nodes["green"].edges;
            expect(greenEdges).toEqual([
                { inputName: "timeout", from: "green", to: "yellow", confidence: "definite" },
            ]);
        });

        it("should produce correct edges for all states", () => {
            expect(result.nodes["yellow"].edges).toEqual([
                { inputName: "timeout", from: "yellow", to: "red", confidence: "definite" },
            ]);
            expect(result.nodes["red"].edges).toEqual([
                { inputName: "timeout", from: "red", to: "green", confidence: "definite" },
            ]);
        });

        it("should have no children", () => {
            expect(result.children).toEqual({});
        });
    });

    // =========================================================================
    // Lifecycle hooks (_onEnter / _onExit)
    // =========================================================================

    describe("when given a config with _onEnter and _onExit function handlers", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph(makeConfigWithLifecycleHooks());
        });

        it("should not produce edges for _onExit", () => {
            const activeEdges = result.nodes["active"].edges;
            const onExitEdges = activeEdges.filter(e => e.inputName === "_onExit");
            expect(onExitEdges).toHaveLength(0);
        });

        it("should still produce edges for regular handlers", () => {
            const activeEdges = result.nodes["active"].edges;
            const stopEdge = activeEdges.find(e => e.inputName === "stop");
            expect(stopEdge).toEqual({
                inputName: "stop",
                from: "active",
                to: "idle",
                confidence: "definite",
            });
        });
    });

    // =========================================================================
    // Child FSM recursion
    // =========================================================================

    describe("when given a config with _child", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            const child = makeChildFsm();
            const config = {
                id: "parent-fsm",
                initialState: "active",
                states: {
                    active: {
                        _child: child as any,
                        pause: "paused",
                    },
                    paused: { resume: "active" },
                },
            };
            const parent = createFsm(config as any);
            result = buildStateGraph(parent as any);
        });

        it("should build a child graph for the state with _child", () => {
            expect(result.children["active"]).toBeDefined();
        });

        it("should set the child graph fsmId from the child FSM id", () => {
            expect(result.children["active"].fsmId).toBe("child-upload");
        });

        it("should include the child FSM states in the child graph", () => {
            expect(Object.keys(result.children["active"].nodes)).toEqual(
                expect.arrayContaining(["idle", "uploading"])
            );
        });

        it("should produce correct edges in the child graph", () => {
            const childIdleEdges = result.children["active"].nodes["idle"].edges;
            expect(childIdleEdges).toEqual([
                { inputName: "begin", from: "idle", to: "uploading", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // Live Fsm instance
    // =========================================================================

    describe("when given a live Fsm instance", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            const fsm = createFsm({
                id: "traffic-light",
                initialState: "green" as const,
                states: {
                    green: { timeout: "yellow" as const },
                    yellow: { timeout: "red" as const },
                    red: { timeout: "green" as const },
                },
            });
            result = buildStateGraph(fsm as any);
        });

        it("should produce the same graph as the config input", () => {
            const configResult = buildStateGraph(makeSimpleConfig());
            expect(result.fsmId).toBe(configResult.fsmId);
            expect(result.initialState).toBe(configResult.initialState);
            expect(Object.keys(result.nodes)).toEqual(Object.keys(configResult.nodes));
        });

        it("should set fsmId from the instance id", () => {
            expect(result.fsmId).toBe("traffic-light");
        });
    });

    // =========================================================================
    // Live BehavioralFsm instance
    // =========================================================================

    describe("when given a live BehavioralFsm instance", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            const bfsm = createBehavioralFsm({
                id: "connection",
                initialState: "offline",
                states: {
                    offline: { connect: "online" },
                    online: { disconnect: "offline" },
                },
            });
            result = buildStateGraph(bfsm as any);
        });

        it("should set fsmId correctly", () => {
            expect(result.fsmId).toBe("connection");
        });

        it("should contain all states", () => {
            expect(Object.keys(result.nodes)).toEqual(
                expect.arrayContaining(["offline", "online"])
            );
        });

        it("should produce correct edges", () => {
            expect(result.nodes["offline"].edges).toEqual([
                { inputName: "connect", from: "offline", to: "online", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe("when given a single-state FSM config", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph(makeSingleStateConfig());
        });

        it("should produce one node", () => {
            expect(Object.keys(result.nodes)).toHaveLength(1);
        });

        it("should produce no edges", () => {
            expect(result.nodes["idle"].edges).toHaveLength(0);
        });

        it("should have no children", () => {
            expect(result.children).toEqual({});
        });
    });

    describe("when given a config with an empty state object", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph(makeEmptyStatesConfig());
        });

        it("should produce one node with no edges", () => {
            expect(result.nodes["only"].edges).toHaveLength(0);
        });
    });

    // =========================================================================
    // Catch-all "*" handler
    // =========================================================================

    describe("when a state has a catch-all '*' handler", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "with-catchall",
                initialState: "idle",
                states: {
                    idle: {
                        "*": "error",
                        start: "running",
                    },
                    running: {},
                    error: {},
                },
            } as any);
        });

        it("should produce an edge for the catch-all handler", () => {
            const catchAllEdge = result.nodes["idle"].edges.find(e => e.inputName === "*");
            expect(catchAllEdge).toEqual({
                inputName: "*",
                from: "idle",
                to: "error",
                confidence: "definite",
            });
        });
    });

    // =========================================================================
    // _onEnter string shorthand — not a function, no edge produced
    // =========================================================================

    describe("when _onEnter is a string shorthand (not a function)", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "string-onenter",
                initialState: "idle",
                states: {
                    idle: {
                        _onEnter: "running" as any,
                        go: "running",
                    },
                    running: {},
                },
            } as any);
        });

        it("should not produce an _onEnter edge for a string-valued _onEnter", () => {
            const onEnterEdges = result.nodes["idle"].edges.filter(e => e.inputName === "_onEnter");
            expect(onEnterEdges).toHaveLength(0);
        });

        it("should still produce the regular handler edge", () => {
            const goEdge = result.nodes["idle"].edges.find(e => e.inputName === "go");
            expect(goEdge).toBeDefined();
        });
    });

    // =========================================================================
    // _child that is neither a ChildLink nor has MACHINA_TYPE — ignored
    // =========================================================================

    describe("when _child is a plain object without MACHINA_TYPE", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "bad-child",
                initialState: "active",
                states: {
                    active: {
                        _child: { canHandle: () => false } as any,
                        go: "done",
                    },
                    done: {},
                },
            } as any);
        });

        it("should not build a child graph for the unrecognized _child value", () => {
            expect(result.children["active"]).toBeUndefined();
        });

        it("should still produce edges for regular handlers in that state", () => {
            const goEdge = result.nodes["active"].edges.find(e => e.inputName === "go");
            expect(goEdge).toBeDefined();
        });
    });

    // =========================================================================
    // Non-string, non-function handler value — produces no edge
    // =========================================================================

    describe("when a handler value is neither a string nor a function", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "weird-handler",
                initialState: "idle",
                states: {
                    idle: {
                        timeout: 42 as any,
                    },
                },
            } as any);
        });

        it("should produce no edges for the non-string non-function handler", () => {
            expect(result.nodes["idle"].edges).toHaveLength(0);
        });
    });

    // =========================================================================
    // Config where initialState does not exist in states
    // =========================================================================

    describe("when initialState does not exist in the states map", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "phantom-init",
                initialState: "nonexistent",
                states: {
                    idle: { go: "running" },
                    running: {},
                },
            } as any);
        });

        it("should still build nodes for all defined states", () => {
            expect(Object.keys(result.nodes)).toEqual(expect.arrayContaining(["idle", "running"]));
        });

        it("should set initialState from the config even if it does not match a node", () => {
            expect(result.initialState).toBe("nonexistent");
        });
    });

    // =========================================================================
    // Catch-all '*' as a function handler
    // =========================================================================

    describe("when a state has a catch-all '*' handler that is a function", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "fn-catchall",
                initialState: "idle",
                states: {
                    idle: {
                        "*": function () {
                            return "error";
                        },
                    },
                    error: {},
                },
            } as any);
        });

        it("should produce an edge with inputName '*'", () => {
            const catchAllEdge = result.nodes["idle"].edges.find(e => e.inputName === "*");
            expect(catchAllEdge).toBeDefined();
        });

        it("should extract the return target from the function", () => {
            const catchAllEdge = result.nodes["idle"].edges.find(e => e.inputName === "*");
            expect(catchAllEdge?.to).toBe("error");
        });

        it("should assign definite confidence for an unconditional function return", () => {
            const catchAllEdge = result.nodes["idle"].edges.find(e => e.inputName === "*");
            expect(catchAllEdge?.confidence).toBe("definite");
        });
    });

    // =========================================================================
    // _onEnter function handler that produces a bounce edge
    // =========================================================================

    describe("when _onEnter is a function that returns a state name", () => {
        let result: ReturnType<typeof buildStateGraph>;

        beforeEach(() => {
            result = buildStateGraph({
                id: "bouncy",
                initialState: "a",
                states: {
                    a: {
                        _onEnter() {
                            return "b";
                        },
                    },
                    b: {},
                },
            } as any);
        });

        it("should produce an _onEnter edge", () => {
            const onEnterEdge = result.nodes["a"].edges.find(e => e.inputName === "_onEnter");
            expect(onEnterEdge).toEqual({
                inputName: "_onEnter",
                from: "a",
                to: "b",
                confidence: "definite",
            });
        });
    });
});
