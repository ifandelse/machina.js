/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { checkOnEnterLoops } from "./onenter-loop";
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
// checkOnEnterLoops
// =============================================================================

describe("checkOnEnterLoops", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // No _onEnter handlers
    // =========================================================================

    describe("when the graph has no _onEnter edges", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("clean-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "start", from: "idle", to: "running", confidence: "definite" },
                    ],
                },
                running: {
                    edges: [
                        { inputName: "stop", from: "running", to: "idle", confidence: "definite" },
                    ],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // _onEnter chain with no cycle
    // =========================================================================

    describe("when _onEnter edges form a chain but no cycle", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("chain-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "c", confidence: "definite" }],
                },
                c: { edges: [] },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Unconditional 2-node cycle (A→B→A)
    // =========================================================================

    describe("when there is an unconditional _onEnter cycle between two states", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("ping-pong-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "a", confidence: "definite" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return one finding", () => {
            expect(result).toHaveLength(1);
        });

        it("should set the finding type to onenter-loop", () => {
            expect(result[0].type).toBe("onenter-loop");
        });

        it("should include both states in the finding", () => {
            expect(result[0].states).toEqual(expect.arrayContaining(["a", "b"]));
        });

        it("should set fsmId correctly", () => {
            expect(result[0].fsmId).toBe("ping-pong-fsm");
        });
    });

    // =========================================================================
    // Unconditional 3-node cycle (A→B→C→A)
    // =========================================================================

    describe("when there is an unconditional _onEnter cycle across three states", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("triangle-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "c", confidence: "definite" }],
                },
                c: {
                    edges: [{ inputName: "_onEnter", from: "c", to: "a", confidence: "definite" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return one finding", () => {
            expect(result).toHaveLength(1);
        });

        it("should include all three states in the finding", () => {
            expect(result[0].states).toEqual(expect.arrayContaining(["a", "b", "c"]));
        });
    });

    // =========================================================================
    // Conditional-only cycle (all "possible" — NOT a bug)
    // =========================================================================

    describe("when _onEnter edges form a cycle but all are possible (conditional)", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("maybe-loop-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "possible" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "a", confidence: "possible" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings (conditional cycles are intentional patterns)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Mixed cycle (some definite, some possible — NOT reported)
    // =========================================================================

    describe("when a _onEnter cycle has mixed confidence (some definite, some possible)", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("mixed-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "a", confidence: "possible" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings (mixed cycles are not reported)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Self-loop (A→A) — not a real loop in the runtime
    // =========================================================================

    describe("when a state has an _onEnter edge targeting itself", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("self-loop-fsm", "a", {
                // _onEnter that returns own state — runtime no-op (same-state guard)
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "a", confidence: "definite" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings (self-loops are runtime no-ops)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Child FSM with _onEnter loop
    // =========================================================================

    describe("when a child FSM has an _onEnter loop", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const childGraph = makeGraph("child-loop-fsm", "x", {
                x: {
                    edges: [{ inputName: "_onEnter", from: "x", to: "y", confidence: "definite" }],
                },
                y: {
                    edges: [{ inputName: "_onEnter", from: "y", to: "x", confidence: "definite" }],
                },
            });
            const parentGraph = makeGraph(
                "parent-fsm",
                "active",
                {
                    active: { edges: [] },
                },
                { active: childGraph }
            );
            result = checkOnEnterLoops(parentGraph);
        });

        it("should return a finding for the child loop", () => {
            expect(result.some(f => f.fsmId === "child-loop-fsm")).toBe(true);
        });

        it("should set parentState to the owning parent state", () => {
            const childFinding = result.find(f => f.fsmId === "child-loop-fsm");
            expect(childFinding?.parentState).toBe("active");
        });

        it("should include the cycling states", () => {
            const childFinding = result.find(f => f.fsmId === "child-loop-fsm");
            expect(childFinding?.states).toEqual(expect.arrayContaining(["x", "y"]));
        });
    });

    // =========================================================================
    // Multiple independent cycles in the same graph
    // =========================================================================

    describe("when the graph contains two independent unconditional _onEnter cycles", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            // Cycle 1: a ↔ b  |  Cycle 2: c ↔ d  |  e is isolated (no _onEnter)
            const graph = makeGraph("twin-cycles-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "a", confidence: "definite" }],
                },
                c: {
                    edges: [{ inputName: "_onEnter", from: "c", to: "d", confidence: "definite" }],
                },
                d: {
                    edges: [{ inputName: "_onEnter", from: "d", to: "c", confidence: "definite" }],
                },
                e: { edges: [] },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return one finding per independent cycle", () => {
            expect(result).toHaveLength(2);
        });

        it("should report both cycles with the correct fsmId", () => {
            expect(result.every(f => f.fsmId === "twin-cycles-fsm")).toBe(true);
        });
    });

    // =========================================================================
    // Long cycle (5-node: A→B→C→D→E→A)
    // =========================================================================

    describe("when there is an unconditional _onEnter cycle across five states", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            const graph = makeGraph("pentagon-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "_onEnter", from: "b", to: "c", confidence: "definite" }],
                },
                c: {
                    edges: [{ inputName: "_onEnter", from: "c", to: "d", confidence: "definite" }],
                },
                d: {
                    edges: [{ inputName: "_onEnter", from: "d", to: "e", confidence: "definite" }],
                },
                e: {
                    edges: [{ inputName: "_onEnter", from: "e", to: "a", confidence: "definite" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return one finding for the five-state cycle", () => {
            expect(result).toHaveLength(1);
        });

        it("should include all five states in the finding", () => {
            expect(result[0].states).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e"]));
        });
    });

    // =========================================================================
    // State with no _onEnter edges — DFS visits it but finds no outbound edges
    // =========================================================================

    describe("when some states have _onEnter edges and some do not", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            // "b" has no _onEnter edges — DFS visits it but onEnterEdges[b] is undefined
            const graph = makeGraph("partial-onenter-fsm", "a", {
                a: {
                    edges: [{ inputName: "_onEnter", from: "a", to: "b", confidence: "definite" }],
                },
                b: { edges: [{ inputName: "go", from: "b", to: "a", confidence: "definite" }] },
                c: { edges: [] },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings (no _onEnter cycle exists)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // _onEnter edge mixed with definite non-_onEnter edges — only _onEnter matters
    // =========================================================================

    describe("when a cycle exists only through non-_onEnter definite edges", () => {
        let result: ReturnType<typeof checkOnEnterLoops>;

        beforeEach(() => {
            // The A↔B cycle is through "timeout", not "_onEnter" — not a loop bug
            const graph = makeGraph("regular-cycle-fsm", "a", {
                a: {
                    edges: [{ inputName: "timeout", from: "a", to: "b", confidence: "definite" }],
                },
                b: {
                    edges: [{ inputName: "timeout", from: "b", to: "a", confidence: "definite" }],
                },
            });
            result = checkOnEnterLoops(graph);
        });

        it("should return no findings (cycles through non-_onEnter inputs are not loops)", () => {
            expect(result).toHaveLength(0);
        });
    });
});
