export default {};

// =============================================================================
// mermaid-generator.test.ts — Tests for the mermaid diagram generator
// =============================================================================

import { generateMermaid } from "./mermaid-generator";
import type { StateGraph } from "machina-inspect";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeGraph(overrides: Partial<StateGraph> = {}): StateGraph {
    return {
        fsmId: "test-fsm",
        initialState: "idle",
        nodes: {},
        children: {},
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mermaid-generator", () => {
    describe("generateMermaid", () => {
        describe("when given a simple two-state linear FSM", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "idle",
                    nodes: {
                        idle: {
                            name: "idle",
                            edges: [
                                {
                                    inputName: "start",
                                    from: "idle",
                                    to: "running",
                                    confidence: "definite",
                                },
                            ],
                        },
                        running: {
                            name: "running",
                            edges: [
                                {
                                    inputName: "stop",
                                    from: "running",
                                    to: "idle",
                                    confidence: "definite",
                                },
                            ],
                        },
                    },
                });
                const config = {
                    initialState: "idle",
                    states: {
                        idle: { start: "running" },
                        running: { stop: "idle" },
                    },
                };
                result = generateMermaid(graph, config);
            });

            it("should start with stateDiagram-v2", () => {
                expect(result.startsWith("stateDiagram-v2")).toBe(true);
            });

            it("should include the initial state arrow", () => {
                expect(result).toContain("[*] --> idle");
            });

            it("should include the start transition", () => {
                expect(result).toContain("idle --> running : start");
            });

            it("should include the stop transition", () => {
                expect(result).toContain("running --> idle : stop");
            });
        });

        describe("when a transition has possible confidence", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "on",
                    nodes: {
                        on: {
                            name: "on",
                            edges: [
                                {
                                    inputName: "toggle",
                                    from: "on",
                                    to: "off",
                                    confidence: "possible",
                                },
                            ],
                        },
                        off: { name: "off", edges: [] },
                    },
                });
                const config = { initialState: "on", states: { on: { toggle: "off" }, off: {} } };
                result = generateMermaid(graph, config);
            });

            it("should annotate the edge with (?)", () => {
                expect(result).toContain("on --> off : toggle (?)");
            });
        });

        describe("when a state has multiple outbound edges", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "checking",
                    nodes: {
                        checking: {
                            name: "checking",
                            edges: [
                                {
                                    inputName: "passed",
                                    from: "checking",
                                    to: "online",
                                    confidence: "definite",
                                },
                                {
                                    inputName: "failed",
                                    from: "checking",
                                    to: "offline",
                                    confidence: "definite",
                                },
                            ],
                        },
                        online: { name: "online", edges: [] },
                        offline: { name: "offline", edges: [] },
                    },
                });
                const config = {
                    initialState: "checking",
                    states: {
                        checking: { passed: "online", failed: "offline" },
                        online: {},
                        offline: {},
                    },
                };
                result = generateMermaid(graph, config);
            });

            it("should include both outbound edges", () => {
                expect(result).toContain("checking --> online : passed");
                expect(result).toContain("checking --> offline : failed");
            });
        });

        describe("when handlerNotes option is true", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "idle",
                    nodes: {
                        idle: {
                            name: "idle",
                            edges: [
                                {
                                    inputName: "start",
                                    from: "idle",
                                    to: "active",
                                    confidence: "definite",
                                },
                            ],
                        },
                        active: { name: "active", edges: [] },
                    },
                });
                const config = {
                    initialState: "idle",
                    states: {
                        idle: {
                            _onEnter: () => {},
                            start: "active",
                        },
                        active: {
                            _onExit: () => {},
                        },
                    },
                };
                result = generateMermaid(graph, config, { handlerNotes: true });
            });

            it("should include a single-line handler note for the state", () => {
                expect(result).toContain("note right of idle : _onEnter, start");
            });

            it("should include a handler note for the active state", () => {
                expect(result).toContain("note right of active : _onExit");
            });
        });

        describe("when handlerNotes option is false (default)", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "idle",
                    nodes: {
                        idle: { name: "idle", edges: [] },
                    },
                });
                const config = {
                    initialState: "idle",
                    states: { idle: { _onEnter: () => {}, start: "active" } },
                };
                result = generateMermaid(graph, config);
            });

            it("should not include note blocks", () => {
                expect(result).not.toContain("note right of");
            });
        });

        describe("when handlerNotes is true and _child key is present", () => {
            let result: string;

            beforeEach(() => {
                const childGraph = makeGraph({
                    fsmId: "child-fsm",
                    initialState: "a",
                    nodes: { a: { name: "a", edges: [] } },
                });
                const graph = makeGraph({
                    initialState: "parent",
                    nodes: {
                        parent: { name: "parent", edges: [] },
                    },
                    children: { parent: childGraph },
                });
                const config = {
                    initialState: "parent",
                    states: {
                        parent: {
                            _child: { states: { a: {} }, initialState: "a" },
                            someInput: "parent",
                        },
                    },
                };
                result = generateMermaid(graph, config, { handlerNotes: true });
            });

            it("should not include _child in handler notes", () => {
                // Composite states (those with child FSM subgraphs) suppress note blocks
                // entirely because mermaid silently ignores them. Assert the note block
                // is absent, not just that _child isn't in it.
                expect(result).not.toContain("note right of parent");
            });
        });

        describe("when a state name contains special characters", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "state-one",
                    nodes: {
                        "state-one": {
                            name: "state-one",
                            edges: [
                                {
                                    inputName: "go",
                                    from: "state-one",
                                    to: "state-two",
                                    confidence: "definite",
                                },
                            ],
                        },
                        "state-two": { name: "state-two", edges: [] },
                    },
                });
                const config = {
                    initialState: "state-one",
                    states: { "state-one": { go: "state-two" }, "state-two": {} },
                };
                result = generateMermaid(graph, config);
            });

            it("should escape state names to safe identifiers", () => {
                // Hyphens get replaced with underscores
                expect(result).toContain("state_one --> state_two");
            });

            it("should emit state declarations for names that need escaping", () => {
                expect(result).toContain('state "state-one" as state_one');
            });
        });

        describe("when a state name contains double-quotes", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: 'foo"bar',
                    nodes: {
                        'foo"bar': {
                            name: 'foo"bar',
                            edges: [
                                {
                                    inputName: "go",
                                    from: 'foo"bar',
                                    to: "baz",
                                    confidence: "definite",
                                },
                            ],
                        },
                        baz: { name: "baz", edges: [] },
                    },
                });
                const config = {
                    initialState: 'foo"bar',
                    states: { 'foo"bar': { go: "baz" }, baz: {} },
                };
                result = generateMermaid(graph, config);
            });

            it("should escape the double-quote in the state declaration label", () => {
                // The `state "label" as id` form must have the quote escaped or mermaid
                // syntax breaks — the raw quote would terminate the label string early.
                expect(result).toContain(String.raw`state "foo\"bar"`);
            });

            it("should not contain an unescaped quote in the declaration", () => {
                // Make sure the raw `foo"bar` isn't sitting inside a mermaid label unescaped
                expect(result).not.toContain('state "foo"bar"');
            });
        });

        describe("when the states object is empty", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "idle",
                    nodes: {},
                });
                const config = { initialState: "idle", states: {} };
                result = generateMermaid(graph, config);
            });

            it("should still produce a valid stateDiagram-v2 header", () => {
                expect(result).toContain("stateDiagram-v2");
            });

            it("should still emit the initial state arrow", () => {
                expect(result).toContain("[*] --> idle");
            });
        });

        describe("when a child FSM subgraph is present", () => {
            let result: string;

            beforeEach(() => {
                const childGraph: StateGraph = {
                    fsmId: "elevator-doors",
                    initialState: "closed",
                    nodes: {
                        closed: {
                            name: "closed",
                            edges: [
                                {
                                    inputName: "open",
                                    from: "closed",
                                    to: "open",
                                    confidence: "definite",
                                },
                            ],
                        },
                        open: {
                            name: "open",
                            edges: [
                                {
                                    inputName: "close",
                                    from: "open",
                                    to: "closed",
                                    confidence: "definite",
                                },
                            ],
                        },
                    },
                    children: {},
                };
                const graph = makeGraph({
                    initialState: "moving",
                    nodes: {
                        moving: { name: "moving", edges: [] },
                        stopped: { name: "stopped", edges: [] },
                    },
                    children: { stopped: childGraph },
                });
                const config = {
                    initialState: "moving",
                    states: {
                        moving: {},
                        stopped: {
                            _child: {
                                initialState: "closed",
                                states: { closed: { open: "open" }, open: { close: "closed" } },
                            },
                        },
                    },
                };
                result = generateMermaid(graph, config);
            });

            it("should render the child FSM as a state subgraph block", () => {
                expect(result).toContain("state stopped {");
            });

            it("should include child transitions inside the subgraph", () => {
                expect(result).toContain("closed --> open : open");
            });

            it("should include the child's initial state arrow", () => {
                expect(result).toContain("[*] --> closed");
            });
        });

        describe("when handlerNotes is true and a composite state has a child FSM", () => {
            let result: string;

            beforeEach(() => {
                const childGraph = makeGraph({
                    fsmId: "child-fsm",
                    initialState: "a",
                    nodes: { a: { name: "a", edges: [] } },
                    children: {},
                });
                const graph = makeGraph({
                    initialState: "parent",
                    nodes: {
                        parent: { name: "parent", edges: [] },
                    },
                    children: { parent: childGraph },
                });
                const config = {
                    initialState: "parent",
                    states: {
                        parent: {
                            _child: { states: { a: {} }, initialState: "a" },
                            someInput: "parent",
                        },
                    },
                };
                result = generateMermaid(graph, config, { handlerNotes: true });
            });

            it("should not emit a note block for the composite state", () => {
                // Mermaid silently drops note blocks for states that render as subgraphs,
                // so the generator must suppress them. This asserts the suppression directly.
                expect(result).not.toContain("note right of parent");
            });
        });

        describe("when handlerNotes is true and a state has no handler keys in config", () => {
            let result: string;

            beforeEach(() => {
                const graph = makeGraph({
                    initialState: "loading",
                    nodes: {
                        loading: { name: "loading", edges: [] },
                    },
                });
                const config = {
                    initialState: "loading",
                    // The state exists in the graph but the config entry has no handler keys.
                    // This exercises the `handlers.length > 0` false branch — no note emitted.
                    states: { loading: {} },
                };
                result = generateMermaid(graph, config, { handlerNotes: true });
            });

            it("should not emit a note block for the handler-less state", () => {
                expect(result).not.toContain("note right of loading");
            });
        });

        describe("when the child state is not present in config.states", () => {
            let result: string;

            beforeEach(() => {
                // The graph has a child FSM for "docked" but the config.states object
                // does not contain a "docked" key at all — getChildConfig returns {}
                // when parentState is falsy. The subgraph must still render without crashing.
                const childGraph = makeGraph({
                    fsmId: "pod-bay",
                    initialState: "sealed",
                    nodes: { sealed: { name: "sealed", edges: [] } },
                    children: {},
                });
                const graph = makeGraph({
                    initialState: "docked",
                    nodes: {
                        docked: { name: "docked", edges: [] },
                    },
                    children: { docked: childGraph },
                });
                const config = {
                    initialState: "docked",
                    // Intentionally omitting the "docked" key from states
                    states: {},
                };
                result = generateMermaid(graph, config);
            });

            it("should still render the subgraph block without crashing", () => {
                expect(result).toContain("state docked {");
            });

            it("should include the child initial state arrow inside the subgraph", () => {
                expect(result).toContain("[*] --> sealed");
            });
        });

        describe("when the _child config object has no states property", () => {
            let result: string;

            beforeEach(() => {
                // _child exists on the parent state but is missing the `states` key —
                // getChildConfig returns {} via the `"states" in child` false branch.
                // The subgraph must still render without crashing.
                const childGraph = makeGraph({
                    fsmId: "warp-drive",
                    initialState: "offline",
                    nodes: { offline: { name: "offline", edges: [] } },
                    children: {},
                });
                const graph = makeGraph({
                    initialState: "engaged",
                    nodes: {
                        engaged: { name: "engaged", edges: [] },
                    },
                    children: { engaged: childGraph },
                });
                const config = {
                    initialState: "engaged",
                    states: {
                        // _child present but missing the `states` key
                        engaged: { _child: { initialState: "offline" } },
                    },
                };
                result = generateMermaid(graph, config);
            });

            it("should still render the subgraph block without crashing", () => {
                expect(result).toContain("state engaged {");
            });

            it("should include the child initial state arrow", () => {
                expect(result).toContain("[*] --> offline");
            });
        });

        describe("when the config passed to generateMermaid has no states field", () => {
            let result: string;

            beforeEach(() => {
                // getConfigStates returns {} when `states` is absent from config.
                // This exercises the else branch of the `"states" in config` guard.
                const graph = makeGraph({
                    initialState: "orbit",
                    nodes: {
                        orbit: { name: "orbit", edges: [] },
                    },
                });
                // Deliberately omit `states` from the config object
                const config = { initialState: "orbit" } as Record<string, unknown>;
                result = generateMermaid(graph, config, { handlerNotes: true });
            });

            it("should produce a valid stateDiagram-v2 header", () => {
                expect(result).toContain("stateDiagram-v2");
            });

            it("should emit the initial state arrow", () => {
                expect(result).toContain("[*] --> orbit");
            });

            it("should not emit any note blocks when config states are unavailable", () => {
                expect(result).not.toContain("note right of");
            });
        });
    });
});
