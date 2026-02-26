/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { checkUnreachable } from "./unreachable";
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
// checkUnreachable
// =============================================================================

describe("checkUnreachable", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // All states reachable
    // =========================================================================

    describe("when all states are reachable from initialState", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("hal-9000", "idle", {
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
            result = checkUnreachable(graph);
        });

        it("should return an empty findings array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // One unreachable state
    // =========================================================================

    describe("when one state has no inbound path from initialState", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("signal-fsm", "green", {
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
                yellow: { edges: [] },
                // "red" has no inbound edges — it's unreachable
                red: {
                    edges: [
                        { inputName: "timeout", from: "red", to: "green", confidence: "definite" },
                    ],
                },
            });
            result = checkUnreachable(graph);
        });

        it("should return one finding", () => {
            expect(result).toHaveLength(1);
        });

        it("should report the correct unreachable state", () => {
            expect(result[0].states).toEqual(["red"]);
        });

        it("should set the correct fsmId", () => {
            expect(result[0].fsmId).toBe("signal-fsm");
        });

        it("should set the finding type to unreachable-state", () => {
            expect(result[0].type).toBe("unreachable-state");
        });

        it("should include the state name in the message", () => {
            expect(result[0].message).toContain("red");
        });

        it("should not set parentState for top-level findings", () => {
            expect(result[0].parentState).toBeUndefined();
        });
    });

    // =========================================================================
    // Multiple unreachable states
    // =========================================================================

    describe("when multiple states are unreachable", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("orphan-fsm", "start", {
                start: { edges: [] },
                // Neither "orphanA" nor "orphanB" can be reached
                orphanA: { edges: [] },
                orphanB: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should return one finding per unreachable state", () => {
            expect(result).toHaveLength(2);
        });

        it("should include both unreachable state names in the findings", () => {
            const unreachableStates = result.map(f => f.states[0]);
            expect(unreachableStates).toEqual(expect.arrayContaining(["orphanA", "orphanB"]));
        });
    });

    // =========================================================================
    // Reachable via "possible" edge
    // =========================================================================

    describe("when a state is reachable only through a possible (conditional) edge", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("maybe-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "go", from: "idle", to: "active", confidence: "possible" },
                    ],
                },
                active: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should not report the state as unreachable", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Single-state FSM
    // =========================================================================

    describe("when the FSM has only one state (initialState)", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("loner-fsm", "only", {
                only: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should return no findings", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Child FSM with unreachable state
    // =========================================================================

    describe("when a child FSM has an unreachable state", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const childGraph = makeGraph("downloader", "idle", {
                idle: {
                    edges: [
                        {
                            inputName: "start",
                            from: "idle",
                            to: "downloading",
                            confidence: "definite",
                        },
                    ],
                },
                downloading: { edges: [] },
                // "abandoned" is unreachable in the child FSM
                abandoned: { edges: [] },
            });
            const parentGraph = makeGraph(
                "main-fsm",
                "ready",
                {
                    ready: { edges: [] },
                },
                { ready: childGraph }
            );
            result = checkUnreachable(parentGraph);
        });

        it("should return a finding for the unreachable child state", () => {
            expect(result.some(f => f.states.includes("abandoned"))).toBe(true);
        });

        it("should set parentState to the parent state that owns the child", () => {
            const childFinding = result.find(f => f.states.includes("abandoned"));
            expect(childFinding?.parentState).toBe("ready");
        });

        it("should set fsmId to the child FSM id", () => {
            const childFinding = result.find(f => f.states.includes("abandoned"));
            expect(childFinding?.fsmId).toBe("downloader");
        });
    });

    // =========================================================================
    // initialState not in nodes — BFS never starts, all states unreachable
    // =========================================================================

    describe("when initialState does not exist in the nodes map", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("phantom-fsm", "ghost", {
                idle: {
                    edges: [
                        { inputName: "go", from: "idle", to: "running", confidence: "definite" },
                    ],
                },
                running: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should report all states as unreachable when initialState is missing", () => {
            expect(result).toHaveLength(2);
        });

        it("should include all state names in the findings", () => {
            const states = result.map(f => f.states[0]);
            expect(states).toEqual(expect.arrayContaining(["idle", "running"]));
        });
    });

    // =========================================================================
    // Edge pointing to a state not in nodes — does not crash, skipped cleanly
    // =========================================================================

    describe("when an edge targets a state not present in the nodes map", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("dangling-edge-fsm", "idle", {
                idle: {
                    edges: [
                        { inputName: "go", from: "idle", to: "running", confidence: "definite" },
                        // This edge points to a state that doesn't exist in nodes
                        {
                            inputName: "teleport",
                            from: "idle",
                            to: "nowhere",
                            confidence: "definite",
                        },
                    ],
                },
                running: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should not crash when an edge points outside the node map", () => {
            expect(result).toBeDefined();
        });

        it("should not report reachable states as unreachable", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // State reachable only through a multi-hop chain of possible edges
    // =========================================================================

    describe("when a state is reachable only through a multi-hop chain of possible edges", () => {
        let result: ReturnType<typeof checkUnreachable>;

        beforeEach(() => {
            const graph = makeGraph("multi-hop-fsm", "start", {
                start: {
                    edges: [
                        { inputName: "go", from: "start", to: "middle", confidence: "possible" },
                    ],
                },
                middle: {
                    edges: [{ inputName: "go", from: "middle", to: "end", confidence: "possible" }],
                },
                end: { edges: [] },
            });
            result = checkUnreachable(graph);
        });

        it("should not report any state as unreachable", () => {
            expect(result).toHaveLength(0);
        });
    });
});
