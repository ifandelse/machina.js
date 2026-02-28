/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import type { StateGraph } from "machina-inspect";
import { canReach } from "./reachability";

// ---------------------------------------------------------------------------
// Helpers — build minimal StateGraph fixtures without spinning up real FSMs
// ---------------------------------------------------------------------------

const makeGraph = (
    nodes: Record<string, { edges: { to: string; from?: string; inputName?: string }[] }>,
    initialState: string,
    fsmId = "test-fsm"
): StateGraph => ({
    fsmId,
    initialState,
    nodes: Object.fromEntries(
        Object.entries(nodes).map(([name, { edges }]) => [
            name,
            {
                name,
                edges: edges.map(({ to, from = name, inputName = "input" }) => ({
                    from,
                    to,
                    inputName,
                    confidence: "definite" as const,
                })),
            },
        ])
    ),
    children: {},
});

// ---------------------------------------------------------------------------
// canReach
// ---------------------------------------------------------------------------

describe("canReach", () => {
    describe("when source equals target", () => {
        let result: boolean;

        beforeEach(() => {
            const graph = makeGraph({ dormant: { edges: [] } }, "dormant");
            result = canReach(graph, "dormant", "dormant");
        });

        it("should return true without traversing any edges", () => {
            expect(result).toBe(true);
        });
    });

    describe("when a direct edge from source to target exists", () => {
        let result: boolean;

        beforeEach(() => {
            // dormant → active
            const graph = makeGraph(
                {
                    dormant: { edges: [{ to: "active" }] },
                    active: { edges: [] },
                },
                "dormant"
            );
            result = canReach(graph, "dormant", "active");
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when target is reachable via a multi-hop path", () => {
        let result: boolean;

        beforeEach(() => {
            // alpha → beta → gamma
            const graph = makeGraph(
                {
                    alpha: { edges: [{ to: "beta" }] },
                    beta: { edges: [{ to: "gamma" }] },
                    gamma: { edges: [] },
                },
                "alpha"
            );
            result = canReach(graph, "alpha", "gamma");
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when the graph contains a cycle and target is unreachable", () => {
        let result: boolean;

        beforeEach(() => {
            // alpha → beta → alpha (cycle), no path to gamma
            const graph = makeGraph(
                {
                    alpha: { edges: [{ to: "beta" }] },
                    beta: { edges: [{ to: "alpha" }] },
                    gamma: { edges: [] },
                },
                "alpha"
            );
            result = canReach(graph, "alpha", "gamma");
        });

        it("should return false without entering an infinite loop", () => {
            expect(result).toBe(false);
        });
    });

    describe("when the source state is not in the graph", () => {
        let result: boolean;

        beforeEach(() => {
            const graph = makeGraph({ dormant: { edges: [] } }, "dormant");
            result = canReach(graph, "nonexistent", "dormant");
        });

        it("should return false without throwing", () => {
            expect(result).toBe(false);
        });
    });

    describe("when the target state is not in the graph", () => {
        let result: boolean;

        beforeEach(() => {
            const graph = makeGraph(
                {
                    dormant: { edges: [{ to: "active" }] },
                    active: { edges: [] },
                },
                "dormant"
            );
            result = canReach(graph, "dormant", "phantom");
        });

        it("should return false without throwing", () => {
            expect(result).toBe(false);
        });
    });

    describe("when the graph is disconnected and source has no path to target", () => {
        let result: boolean;

        beforeEach(() => {
            // dormant → active, but error is isolated
            const graph = makeGraph(
                {
                    dormant: { edges: [{ to: "active" }] },
                    active: { edges: [] },
                    error: { edges: [] },
                },
                "dormant"
            );
            result = canReach(graph, "dormant", "error");
        });

        it("should return false", () => {
            expect(result).toBe(false);
        });
    });

    describe("when edges include 'possible' confidence", () => {
        let result: boolean;

        beforeEach(() => {
            // Possible edges are still followed — topology, not runtime certainty
            const graph: StateGraph = {
                fsmId: "possible-edges-fsm",
                initialState: "idle",
                nodes: {
                    idle: {
                        name: "idle",
                        edges: [
                            {
                                from: "idle",
                                to: "running",
                                inputName: "start",
                                confidence: "possible",
                            },
                        ],
                    },
                    running: { name: "running", edges: [] },
                },
                children: {},
            };
            result = canReach(graph, "idle", "running");
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when a node in the queue has no entry in graph.nodes", () => {
        let result: boolean;

        beforeEach(() => {
            // An edge references a target that exists in the node's edge list but
            // has no corresponding entry in graph.nodes. This exercises the
            // defensive `!node` continue branch in the BFS loop.
            const graph: StateGraph = {
                fsmId: "ghost-node-fsm",
                initialState: "start",
                nodes: {
                    start: {
                        name: "start",
                        edges: [
                            { from: "start", to: "ghost", inputName: "go", confidence: "definite" },
                        ],
                    },
                    // "ghost" is referenced in edges but has no node entry —
                    // the edge guard `edge.to in graph.nodes` on line 50 prevents
                    // it from being enqueued, so the !node branch is unreachable
                    // via the normal queue path. To hit it directly we inject a
                    // node whose key is present but whose value is undefined.
                },
                children: {},
            };
            // Force the undefined-node scenario by deleting after assignment
            (graph.nodes as any)["phantom"] = undefined;
            // Manually queue "phantom" by giving "start" an edge to it
            graph.nodes["start"]!.edges.push({
                from: "start",
                to: "phantom",
                inputName: "vanish",
                confidence: "definite",
            });
            result = canReach(graph, "start", "end");
        });

        it("should return false without throwing", () => {
            expect(result).toBe(false);
        });
    });

    describe("when source has a self-loop and target is a different reachable state", () => {
        let result: boolean;

        beforeEach(() => {
            // Self-loop on "waiting" plus an edge to "done". The self-loop
            // should be visited once and not re-enqueued, and "done" should
            // still be found.
            const graph = makeGraph(
                {
                    waiting: { edges: [{ to: "waiting" }, { to: "done" }] },
                    done: { edges: [] },
                },
                "waiting"
            );
            result = canReach(graph, "waiting", "done");
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when source has a self-loop and target does not exist", () => {
        let result: boolean;

        beforeEach(() => {
            // Exercises that a self-loop doesn't re-enqueue the visited source
            // and BFS terminates cleanly with false
            const graph = makeGraph(
                {
                    waiting: { edges: [{ to: "waiting" }] },
                },
                "waiting"
            );
            result = canReach(graph, "waiting", "done");
        });

        it("should return false without infinite loop", () => {
            expect(result).toBe(false);
        });
    });

    describe("when the graph has a diamond shape (two paths to same target)", () => {
        let result: boolean;

        beforeEach(() => {
            // start → left → end
            // start → right → end
            // Both paths converge on "end". The visited set should prevent
            // "end" from being enqueued twice.
            const graph = makeGraph(
                {
                    start: { edges: [{ to: "left" }, { to: "right" }] },
                    left: { edges: [{ to: "end" }] },
                    right: { edges: [{ to: "end" }] },
                    end: { edges: [] },
                },
                "start"
            );
            result = canReach(graph, "start", "end");
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });
});
