/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { inspect, inspectGraph, buildStateGraph } from "./index";
import { createFsm, createBehavioralFsm } from "machina";

// =============================================================================
// Fixtures
// =============================================================================

// A clean traffic-light config — no structural issues
function makeCleanConfig() {
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

// A config with one unreachable state
function makeConfigWithUnreachable() {
    return {
        id: "broken-light",
        initialState: "green",
        states: {
            green: { timeout: "yellow" },
            yellow: { timeout: "green" },
            // "red" has no inbound edges — unreachable
            red: { timeout: "green" },
        },
    };
}

// A config with an unconditional _onEnter loop (A → B → A)
function makeConfigWithOnEnterLoop() {
    return {
        id: "bouncy-fsm",
        initialState: "a",
        states: {
            a: {
                _onEnter() {
                    return "b";
                },
            },
            b: {
                _onEnter() {
                    return "a";
                },
            },
        },
    };
}

// A realistic multi-state FSM with 10+ states, mix of string shorthands and
// function handlers, plus a child FSM
function makeChildFsmForRealistic() {
    return createFsm({
        id: "checkout-steps",
        initialState: "cart",
        states: {
            cart: { next: "address" as const },
            address: { next: "payment" as const, back: "cart" as const },
            payment: { next: "confirmation" as const, back: "address" as const },
            confirmation: {},
        },
    });
}

function makeRealisticConfig() {
    const child = makeChildFsmForRealistic();
    return {
        id: "shopping-app",
        initialState: "browsing",
        states: {
            browsing: {
                addToCart: "cart",
                search: "searching",
            },
            searching: {
                results: "browsing",
                noResults: "empty",
            },
            empty: {
                reset: "browsing",
            },
            cart: {
                checkout: "checkout",
                continueShopping: "browsing",
                _child: child as any,
            },
            checkout: {
                complete: "orderPlaced",
                cancel: "browsing",
            },
            orderPlaced: {
                again: "browsing",
            },
            // Intentionally unreachable states to test detection
            abandoned: {
                recover: "browsing",
            },
        },
    };
}

// =============================================================================
// inspect()
// =============================================================================

describe("inspect", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // Clean config
    // =========================================================================

    describe("when given a clean config with no structural issues", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect(makeCleanConfig() as any);
        });

        it("should return an empty findings array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Config with unreachable state
    // =========================================================================

    describe("when given a config with an unreachable state", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect(makeConfigWithUnreachable() as any);
        });

        it("should return one finding", () => {
            expect(result).toHaveLength(1);
        });

        it("should report the unreachable state", () => {
            expect(result[0].type).toBe("unreachable-state");
            expect(result[0].states).toContain("red");
        });
    });

    // =========================================================================
    // Config with _onEnter loop
    // =========================================================================

    describe("when given a config with an unconditional _onEnter loop", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect(makeConfigWithOnEnterLoop() as any);
        });

        it("should return a finding for the loop", () => {
            expect(result.some(f => f.type === "onenter-loop")).toBe(true);
        });
    });

    // =========================================================================
    // createFsm config
    // =========================================================================

    describe("when given a createFsm config directly", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect({
                id: "fsm-config-direct",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: { stop: "idle" },
                },
            } as any);
        });

        it("should return no unreachable-state or onenter-loop findings", () => {
            // Asymmetric handlers produce missing-handler suggestions (expected),
            // but no structural bugs like unreachable states or _onEnter loops.
            expect(result.filter(f => f.type !== "missing-handler")).toHaveLength(0);
        });
    });

    // =========================================================================
    // createBehavioralFsm config
    // =========================================================================

    describe("when given a createBehavioralFsm config", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect({
                id: "bfsm-config-direct",
                initialState: "offline",
                states: {
                    offline: { connect: "online" },
                    online: { disconnect: "offline" },
                },
            } as any);
        });

        it("should return no unreachable-state or onenter-loop findings", () => {
            // Asymmetric handlers produce missing-handler suggestions (expected),
            // but no structural bugs like unreachable states or _onEnter loops.
            expect(result.filter(f => f.type !== "missing-handler")).toHaveLength(0);
        });
    });

    // =========================================================================
    // Live Fsm instance
    // =========================================================================

    describe("when given a live Fsm instance", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            const fsm = createFsm({
                id: "live-fsm",
                initialState: "green" as const,
                states: {
                    green: { timeout: "yellow" as const },
                    yellow: { timeout: "red" as const },
                    red: { timeout: "green" as const },
                },
            });
            result = inspect(fsm as any);
        });

        it("should produce the same findings as the equivalent config", () => {
            const configResult = inspect(makeCleanConfig() as any);
            expect(result).toHaveLength(configResult.length);
        });
    });

    // =========================================================================
    // Live BehavioralFsm instance
    // =========================================================================

    describe("when given a live BehavioralFsm instance", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            const bfsm = createBehavioralFsm({
                id: "live-bfsm",
                initialState: "offline" as const,
                states: {
                    offline: { connect: "online" as const },
                    online: { disconnect: "offline" as const },
                },
            });
            result = inspect(bfsm as any);
        });

        it("should return no unreachable-state or onenter-loop findings", () => {
            // Asymmetric two-state FSMs produce missing-handler suggestions (expected).
            expect(result.filter(f => f.type !== "missing-handler")).toHaveLength(0);
        });
    });

    // =========================================================================
    // Config with child FSM
    // =========================================================================

    describe("when given a config with a child FSM that has an unreachable state", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            const child = createFsm({
                id: "child-with-orphan",
                initialState: "start" as const,
                states: {
                    start: { proceed: "end" as const },
                    end: {},
                    orphan: {},
                },
            });
            const parent = createFsm({
                id: "parent-with-child",
                initialState: "active" as const,
                states: {
                    active: {
                        _child: child as any,
                    },
                },
            });
            result = inspect(parent as any);
        });

        it("should return a finding for the child's unreachable state", () => {
            expect(result.some(f => f.states.includes("orphan"))).toBe(true);
        });

        it("should attribute the finding to the child FSM id", () => {
            const orphanFinding = result.find(f => f.states.includes("orphan"));
            expect(orphanFinding?.fsmId).toBe("child-with-orphan");
        });

        it("should set parentState on child findings", () => {
            const orphanFinding = result.find(f => f.states.includes("orphan"));
            expect(orphanFinding?.parentState).toBe("active");
        });
    });

    // =========================================================================
    // Realistic multi-state FSM
    // =========================================================================

    describe("when given a realistic 10+ state FSM with a child and mix of handler types", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            const config = makeRealisticConfig();
            const parent = createFsm(config as any);
            result = inspect(parent as any);
        });

        it("should find the unreachable state 'abandoned'", () => {
            expect(result.some(f => f.states.includes("abandoned"))).toBe(true);
        });

        it("should not report reachable states as unreachable", () => {
            const reachableStates = [
                "browsing",
                "searching",
                "empty",
                "cart",
                "checkout",
                "orderPlaced",
            ];
            for (const state of reachableStates) {
                expect(
                    result.some(f => f.states.includes(state) && f.type === "unreachable-state")
                ).toBe(false);
            }
        });
    });
});

// =============================================================================
// inspectGraph()
// =============================================================================

describe("inspectGraph", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    describe("when given a pre-built graph from a clean config", () => {
        let result: ReturnType<typeof inspectGraph>;

        beforeEach(() => {
            const graph = buildStateGraph(makeCleanConfig() as any);
            result = inspectGraph(graph);
        });

        it("should return the same results as inspect()", () => {
            const inspectResult = inspect(makeCleanConfig() as any);
            expect(result).toEqual(inspectResult);
        });

        it("should return an empty array for a clean graph", () => {
            expect(result).toHaveLength(0);
        });
    });

    describe("when given a pre-built graph with an unreachable state", () => {
        let result: ReturnType<typeof inspectGraph>;

        beforeEach(() => {
            const graph = buildStateGraph(makeConfigWithUnreachable() as any);
            result = inspectGraph(graph);
        });

        it("should return the same findings as inspect()", () => {
            const inspectResult = inspect(makeConfigWithUnreachable() as any);
            expect(result).toEqual(inspectResult);
        });
    });

    describe("when given a pre-built graph with an _onEnter loop", () => {
        let result: ReturnType<typeof inspectGraph>;

        beforeEach(() => {
            const graph = buildStateGraph(makeConfigWithOnEnterLoop() as any);
            result = inspectGraph(graph);
        });

        it("should return the same findings as inspect()", () => {
            const inspectResult = inspect(makeConfigWithOnEnterLoop() as any);
            expect(result).toEqual(inspectResult);
        });

        it("should detect the onenter-loop finding", () => {
            expect(result.some(f => f.type === "onenter-loop")).toBe(true);
        });
    });
});

// =============================================================================
// inspect() — config triggering both finding types simultaneously
// =============================================================================

describe("inspect — combined findings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    describe("when the config has both an unreachable state and an _onEnter loop", () => {
        let result: ReturnType<typeof inspect>;

        beforeEach(() => {
            result = inspect({
                id: "double-trouble",
                initialState: "a",
                states: {
                    // _onEnter loop: a → b → a
                    a: {
                        _onEnter() {
                            return "b";
                        },
                    },
                    b: {
                        _onEnter() {
                            return "a";
                        },
                    },
                    // "orphan" is unreachable from "a"
                    orphan: {
                        go: "a",
                    },
                },
            } as any);
        });

        it("should return findings from both checks", () => {
            const types = result.map(f => f.type);
            expect(types).toContain("unreachable-state");
            expect(types).toContain("onenter-loop");
        });

        it("should attribute the unreachable finding to the orphan state", () => {
            const unreachable = result.find(f => f.type === "unreachable-state");
            expect(unreachable?.states).toContain("orphan");
        });
    });
});
