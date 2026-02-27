/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { buildStateGraphFromAst } from "./ast-graph-builder";
import type { Rule } from "eslint";
import type { CallExpression, ObjectExpression, Node } from "estree";

// =============================================================================
// Synthetic AST node helpers
//
// We construct minimal ESTree-compatible plain objects. No real parsing needed.
// ESTree types are structural, so a plain object with the right shape works.
// =============================================================================

const lit = (value: string | number | boolean): Node =>
    ({ type: "Literal", value, raw: JSON.stringify(value) }) as any;

const ident = (name: string): Node => ({ type: "Identifier", name }) as any;

const prop = (key: string, value: Node, computed = false): Node =>
    ({
        type: "Property",
        key: ident(key),
        value,
        kind: "init",
        computed,
        method: false,
        shorthand: false,
    }) as any;

const objExpr = (...properties: Node[]): ObjectExpression =>
    ({ type: "ObjectExpression", properties }) as any;

// Arrow function that returns a string literal — `() => "targetState"`
const conciseArrow = (returnValue: string): Node =>
    ({
        type: "ArrowFunctionExpression",
        expression: true,
        params: [],
        body: lit(returnValue),
    }) as any;

// Minimal createFsm(...) CallExpression
const makeCallExpr = (configArg: Node): CallExpression =>
    ({
        type: "CallExpression",
        callee: { type: "Identifier", name: "createFsm" },
        arguments: [configArg],
    }) as any;

// A config ObjectExpression with id, initialState, and states
const makeConfigObj = (id: string, initialState: string, statesProps: Node[]): ObjectExpression =>
    objExpr(
        prop("id", lit(id)),
        prop("initialState", lit(initialState)),
        prop("states", objExpr(...statesProps))
    );

// =============================================================================
// Mock RuleContext
//
// getScope() returns a scope with no variables by default.
// Override `variables` and `defs` per test when testing identifier resolution.
// =============================================================================

const makeContext = (scopeVariables: any[] = []): Rule.RuleContext => {
    const scope = {
        variables: scopeVariables,
        upper: null,
    };
    return {
        sourceCode: {
            getScope: () => scope,
        },
    } as any;
};

// =============================================================================
// Tests
// =============================================================================

describe("buildStateGraphFromAst", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // Config argument is an ObjectExpression — basic two-state graph
    // =========================================================================

    describe("when the config argument is an ObjectExpression with two states", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("test-fsm", "idle", [
                prop("idle", objExpr(prop("start", lit("running")))),
                prop("running", objExpr(prop("stop", lit("idle")))),
            ]);
            const callNode = makeCallExpr(config);
            result = buildStateGraphFromAst(makeContext(), callNode);
        });

        it("should return a StateGraph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should set fsmId correctly", () => {
            expect(result?.fsmId).toBe("test-fsm");
        });

        it("should set initialState correctly", () => {
            expect(result?.initialState).toBe("idle");
        });

        it("should create nodes for both states", () => {
            expect(Object.keys(result?.nodes ?? {})).toEqual(
                expect.arrayContaining(["idle", "running"])
            );
        });

        it("should produce a definite edge from idle via start to running", () => {
            const idleEdges = result?.nodes["idle"]?.edges ?? [];
            expect(idleEdges).toEqual([
                { inputName: "start", from: "idle", to: "running", confidence: "definite" },
            ]);
        });

        it("should produce a definite edge from running via stop to idle", () => {
            const runningEdges = result?.nodes["running"]?.edges ?? [];
            expect(runningEdges).toEqual([
                { inputName: "stop", from: "running", to: "idle", confidence: "definite" },
            ]);
        });

        it("should return an empty children map", () => {
            expect(result?.children).toEqual({});
        });
    });

    // =========================================================================
    // Config argument is an Identifier resolving to a const ObjectExpression
    // =========================================================================

    describe("when the config argument is an Identifier resolved via mock scope", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("scope-fsm", "idle", [
                prop("idle", objExpr(prop("go", lit("done")))),
                prop("done", objExpr()),
            ]);

            // Simulate `const myConfig = { ... }` in scope
            const scopeVariables = [
                {
                    name: "myConfig",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: config,
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "myConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext(scopeVariables), callNode);
        });

        it("should resolve the identifier and return a StateGraph", () => {
            expect(result).not.toBeNull();
        });

        it("should have the correct fsmId", () => {
            expect(result?.fsmId).toBe("scope-fsm");
        });

        it("should produce an edge for the go handler", () => {
            const idleEdges = result?.nodes["idle"]?.edges ?? [];
            expect(idleEdges).toEqual([
                { inputName: "go", from: "idle", to: "done", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // Identifier not found in scope → null
    // =========================================================================

    describe("when the config argument is an Identifier with no matching variable in scope", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "unknownConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext([]), callNode);
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Config argument is a CallExpression (not resolvable) → null
    // =========================================================================

    describe("when the config argument is a CallExpression (not an object or identifier)", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [
                    {
                        type: "CallExpression",
                        callee: { type: "Identifier", name: "buildConfig" },
                        arguments: [],
                    } as any,
                ],
            } as any;

            result = buildStateGraphFromAst(makeContext(), callNode);
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // State property with string literal handler → definite edge
    // =========================================================================

    describe("when a state property has a string literal handler", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("literal-fsm", "a", [
                prop("a", objExpr(prop("next", lit("b")))),
                prop("b", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should produce a definite edge", () => {
            const edge = result?.nodes["a"]?.edges[0];
            expect(edge?.confidence).toBe("definite");
            expect(edge?.to).toBe("b");
        });
    });

    // =========================================================================
    // State property with ArrowFunctionExpression → definite edge via walkHandlerAst
    // =========================================================================

    describe("when a state property has an ArrowFunctionExpression returning a string", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("arrow-fsm", "idle", [
                prop("idle", objExpr(prop("start", conciseArrow("running")))),
                prop("running", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should produce a definite edge via walkHandlerAst", () => {
            const edge = result?.nodes["idle"]?.edges[0];
            expect(edge?.confidence).toBe("definite");
            expect(edge?.to).toBe("running");
            expect(edge?.inputName).toBe("start");
        });
    });

    // =========================================================================
    // State with * key → edge with inputName "*"
    // =========================================================================

    describe("when a state has a * catch-all handler", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // Use a string key property with key name "*"
            const starProp: Node = {
                type: "Property",
                key: lit("*"),
                value: lit("idle"),
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("wildcard-fsm", "idle", [
                prop("idle", objExpr(prop("start", lit("running")))),
                prop("running", { type: "ObjectExpression", properties: [starProp] } as any),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should produce an edge with inputName '*'", () => {
            const runningEdges = result?.nodes["running"]?.edges ?? [];
            expect(runningEdges.some(e => e.inputName === "*")).toBe(true);
        });
    });

    // =========================================================================
    // State with a spread property → spread skipped, other props still produce edges
    // =========================================================================

    describe("when a state has a spread property mixed with regular properties", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const spreadElement: Node = {
                type: "SpreadElement",
                argument: { type: "Identifier", name: "extraHandlers" },
            } as any;

            const stateProps: Node = {
                type: "ObjectExpression",
                properties: [
                    spreadElement,
                    {
                        type: "Property",
                        key: { type: "Identifier", name: "stop" },
                        value: lit("idle"),
                        kind: "init",
                        computed: false,
                        method: false,
                        shorthand: false,
                    } as any,
                ],
            } as any;

            const config = makeConfigObj("spread-fsm", "idle", [
                prop("idle", objExpr(prop("start", lit("running")))),
                prop("running", stateProps),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should skip the spread and still produce edges from literal handlers", () => {
            const runningEdges = result?.nodes["running"]?.edges ?? [];
            expect(runningEdges).toEqual([
                { inputName: "stop", from: "running", to: "idle", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // _onEnter with function returning a string → _onEnter edge
    // =========================================================================

    describe("when a state has an _onEnter handler returning a string", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("bounce-fsm", "loading", [
                prop("loading", objExpr(prop("_onEnter", conciseArrow("ready")))),
                prop("ready", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should produce an _onEnter edge", () => {
            const loadingEdges = result?.nodes["loading"]?.edges ?? [];
            expect(loadingEdges).toEqual([
                { inputName: "_onEnter", from: "loading", to: "ready", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // _onExit produces no edges
    // =========================================================================

    describe("when a state has an _onExit handler", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("exit-fsm", "active", [
                prop(
                    "active",
                    objExpr(prop("stop", lit("idle")), prop("_onExit", conciseArrow("anywhere")))
                ),
                prop("idle", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should not produce any edge for _onExit", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges.every(e => e.inputName !== "_onExit")).toBe(true);
        });

        it("should still produce edges for other handlers", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges).toEqual([
                { inputName: "stop", from: "active", to: "idle", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // callNode.arguments.length === 0 → null
    // =========================================================================

    describe("when the call has no arguments", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [],
            } as any;
            result = buildStateGraphFromAst(makeContext(), callNode);
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // id property missing → null
    // =========================================================================

    describe("when the config has no id property", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("initialState", lit("idle")),
                prop("states", objExpr(prop("idle", objExpr())))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // id is a non-literal (computed) → null
    // =========================================================================

    describe("when the id property is a non-string literal (e.g. an Identifier)", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("id", ident("FSM_ID_VAR")),
                prop("initialState", lit("idle")),
                prop("states", objExpr(prop("idle", objExpr())))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // initialState property missing → null
    // =========================================================================

    describe("when the config has no initialState property", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("id", lit("no-init-fsm")),
                prop("states", objExpr(prop("idle", objExpr())))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // initialState is a non-literal → null
    // =========================================================================

    describe("when the initialState property is a non-string literal", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("id", lit("dynamic-init-fsm")),
                prop("initialState", ident("INITIAL_STATE")),
                prop("states", objExpr(prop("idle", objExpr())))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // states property missing → null
    // =========================================================================

    describe("when the config has no states property", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("id", lit("no-states-fsm")),
                prop("initialState", lit("idle"))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // states is not an ObjectExpression → null
    // =========================================================================

    describe("when the states property is not an ObjectExpression", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config: ObjectExpression = objExpr(
                prop("id", lit("bad-states-fsm")),
                prop("initialState", lit("idle")),
                prop("states", ident("STATES_MAP"))
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Spread in the top-level states object → spread skipped, rest processed
    // =========================================================================

    describe("when the states object contains a spread element", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const spreadElement: Node = {
                type: "SpreadElement",
                argument: { type: "Identifier", name: "extraStates" },
            } as any;

            const statesObj: ObjectExpression = {
                type: "ObjectExpression",
                properties: [
                    spreadElement as any,
                    {
                        type: "Property",
                        key: { type: "Identifier", name: "idle" },
                        value: objExpr(prop("go", lit("done"))),
                        kind: "init",
                        computed: false,
                        method: false,
                        shorthand: false,
                    } as any,
                    {
                        type: "Property",
                        key: { type: "Identifier", name: "done" },
                        value: objExpr(),
                        kind: "init",
                        computed: false,
                        method: false,
                        shorthand: false,
                    } as any,
                ],
            } as any;

            const config: ObjectExpression = objExpr(
                prop("id", lit("spread-states-fsm")),
                prop("initialState", lit("idle")),
                {
                    type: "Property",
                    key: ident("states"),
                    value: statesObj,
                    kind: "init",
                    computed: false,
                    method: false,
                    shorthand: false,
                } as any
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should include the literal states despite the spread", () => {
            expect(Object.keys(result?.nodes ?? {})).toEqual(
                expect.arrayContaining(["idle", "done"])
            );
        });

        it("should produce edges from the literal states", () => {
            expect(result?.nodes["idle"]?.edges).toEqual([
                { inputName: "go", from: "idle", to: "done", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // Computed state key in states object → skipped silently
    // =========================================================================

    describe("when a state has a computed key in the states object", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const computedStateProp: Node = {
                type: "Property",
                key: { type: "Identifier", name: "DYNAMIC_STATE" },
                value: objExpr(),
                kind: "init",
                computed: true,
                method: false,
                shorthand: false,
            } as any;

            const statesObj: ObjectExpression = {
                type: "ObjectExpression",
                properties: [
                    {
                        type: "Property",
                        key: { type: "Identifier", name: "idle" },
                        value: objExpr(prop("start", lit("running"))),
                        kind: "init",
                        computed: false,
                        method: false,
                        shorthand: false,
                    } as any,
                    computedStateProp as any,
                ],
            } as any;

            const config: ObjectExpression = objExpr(
                prop("id", lit("computed-key-fsm")),
                prop("initialState", lit("idle")),
                {
                    type: "Property",
                    key: ident("states"),
                    value: statesObj,
                    kind: "init",
                    computed: false,
                    method: false,
                    shorthand: false,
                } as any
            );
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should include only the literal-keyed state", () => {
            expect(Object.keys(result?.nodes ?? {})).toEqual(["idle"]);
        });
    });

    // =========================================================================
    // Computed handler key inside a state → skipped silently
    // =========================================================================

    describe("when a state has a computed handler key", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const computedHandlerProp: Node = {
                type: "Property",
                key: { type: "Identifier", name: "EVENT_KEY" },
                value: lit("running"),
                kind: "init",
                computed: true,
                method: false,
                shorthand: false,
            } as any;

            const stateObj: ObjectExpression = {
                type: "ObjectExpression",
                properties: [
                    {
                        type: "Property",
                        key: { type: "Identifier", name: "stop" },
                        value: lit("idle"),
                        kind: "init",
                        computed: false,
                        method: false,
                        shorthand: false,
                    } as any,
                    computedHandlerProp as any,
                ],
            } as any;

            const config = makeConfigObj("computed-handler-fsm", "active", [
                {
                    type: "Property",
                    key: ident("active"),
                    value: stateObj,
                    kind: "init",
                    computed: false,
                    method: false,
                    shorthand: false,
                } as any,
                prop("idle", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should produce edges only from the non-computed handler", () => {
            expect(result?.nodes["active"]?.edges).toEqual([
                { inputName: "stop", from: "active", to: "idle", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // _child handler → skipped silently, no edges produced
    // =========================================================================

    describe("when a state has a _child handler", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("parent-fsm", "active", [
                prop(
                    "active",
                    objExpr(prop("stop", lit("idle")), prop("_child", ident("childFsm")))
                ),
                prop("idle", objExpr()),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should not produce any edge for _child", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges.every(e => e.inputName !== "_child")).toBe(true);
        });

        it("should still produce edges for other handlers", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges).toEqual([
                { inputName: "stop", from: "active", to: "idle", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // State value is not an ObjectExpression → node created with empty edges
    // =========================================================================

    describe("when a state value is not an ObjectExpression", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("non-obj-state-fsm", "idle", [
                // idle's value is a string literal, not an object
                {
                    type: "Property",
                    key: ident("idle"),
                    value: lit("notAnObject"),
                    kind: "init",
                    computed: false,
                    method: false,
                    shorthand: false,
                } as any,
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should create the node with empty edges rather than crashing", () => {
            expect(result?.nodes["idle"]).toEqual({ name: "idle", edges: [] });
        });
    });

    // =========================================================================
    // Handler value is neither string nor function → extractEdges returns []
    // =========================================================================

    describe("when a state handler value is neither a string literal nor a function", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // Use a numeric literal as the handler value — not a string, not a function
            const config = makeConfigObj("numeric-handler-fsm", "idle", [
                prop("idle", objExpr(prop("go", lit(42)))),
            ]);
            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should produce no edges for the numeric handler", () => {
            expect(result?.nodes["idle"]?.edges).toHaveLength(0);
        });
    });

    // =========================================================================
    // Identifier resolving to a `let` binding → null (only const is supported)
    // =========================================================================

    describe("when the config identifier resolves to a let binding", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("let-fsm", "idle", [
                prop("idle", objExpr(prop("go", lit("done")))),
                prop("done", objExpr()),
            ]);

            const scopeVariables = [
                {
                    name: "letConfig",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: config,
                                parent: { kind: "let" },
                            },
                        },
                    ],
                },
            ];

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "letConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext(scopeVariables), callNode);
        });

        it("should return null for let bindings", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Identifier resolves but init is not an ObjectExpression → null
    // =========================================================================

    describe("when the config identifier resolves to a variable whose init is not an ObjectExpression", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const scopeVariables = [
                {
                    name: "arrayConfig",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                // init is an ArrayExpression, not an ObjectExpression
                                init: { type: "ArrayExpression", elements: [] },
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "arrayConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext(scopeVariables), callNode);
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Identifier resolves but def.type is not "Variable" → null
    // =========================================================================

    describe("when the config identifier resolves to a non-Variable definition", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const scopeVariables = [
                {
                    name: "paramConfig",
                    defs: [
                        {
                            type: "Parameter",
                            node: {
                                init: null,
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "paramConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext(scopeVariables), callNode);
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Variable found in upper scope (scope chain walk)
    // =========================================================================

    describe("when the config identifier is found in an outer scope via scope chain", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const config = makeConfigObj("outer-scope-fsm", "idle", [
                prop("idle", objExpr(prop("launch", lit("orbit")))),
                prop("orbit", objExpr()),
            ]);

            // The variable lives in the upper scope, not the immediate scope
            const outerScope = {
                variables: [
                    {
                        name: "outerConfig",
                        defs: [
                            {
                                type: "Variable",
                                node: {
                                    init: config,
                                    parent: { kind: "const" },
                                },
                            },
                        ],
                    },
                ],
                upper: null,
            };

            const innerScope = {
                variables: [],
                upper: outerScope,
            };

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "outerConfig" } as any],
            } as any;

            const context = {
                sourceCode: {
                    getScope: () => innerScope,
                },
            } as any;

            result = buildStateGraphFromAst(context, callNode);
        });

        it("should resolve the identifier from the outer scope and return a graph", () => {
            expect(result).not.toBeNull();
        });

        it("should have the correct fsmId", () => {
            expect(result?.fsmId).toBe("outer-scope-fsm");
        });
    });

    // =========================================================================
    // _child: inline CallExpression → child graph built and attached
    // =========================================================================

    describe("when a state has an inline _child createFsm() call", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // The child FSM is defined inline as the _child value
            const childCallNode: CallExpression = makeCallExpr(
                makeConfigObj("warp-core", "stable", [
                    prop("stable", objExpr(prop("overheat", lit("critical")))),
                    prop("critical", objExpr(prop("cool", lit("stable")))),
                ])
            );

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: childCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("enterprise", "active", [
                prop("active", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("eject", lit("ejected"))],
                } as any),
                prop("ejected", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should attach the child graph under the parent state name", () => {
            expect(result?.children["active"]).toBeDefined();
        });

        it("should build child nodes correctly", () => {
            const childNodes = Object.keys(result?.children["active"]?.nodes ?? {});
            expect(childNodes).toEqual(expect.arrayContaining(["stable", "critical"]));
        });

        it("should set child fsmId correctly", () => {
            expect(result?.children["active"]?.fsmId).toBe("warp-core");
        });

        it("should still produce parent state edges alongside the child", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges).toEqual([
                { inputName: "eject", from: "active", to: "ejected", confidence: "definite" },
            ]);
        });

        it("should leave the children map empty for states without _child", () => {
            expect(result?.children["ejected"]).toBeUndefined();
        });
    });

    // =========================================================================
    // _child: const Identifier reference → child graph built via scope resolution
    // =========================================================================

    describe("when a state has a _child that is a const identifier referencing a createFsm call", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // The child FSM call node — this is the AST node that the `const childFsm = createFsm(...)` init points to
            const childCallNode: CallExpression = makeCallExpr(
                makeConfigObj("deflector-shield", "online", [
                    prop("online", objExpr(prop("disable", lit("offline")))),
                    prop("offline", objExpr(prop("enable", lit("online")))),
                ])
            );

            // Simulate `const childFsm = createFsm({...})` in scope
            const scopeVariables = [
                {
                    name: "childFsm",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: childCallNode,
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: ident("childFsm"),
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("galaxy-class", "cruising", [
                prop("cruising", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("warp", lit("warping"))],
                } as any),
                prop("warping", objExpr(prop("drop", lit("cruising")))),
            ]);

            result = buildStateGraphFromAst(makeContext(scopeVariables), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should resolve the child identifier and attach the child graph", () => {
            expect(result?.children["cruising"]).toBeDefined();
        });

        it("should build child graph with correct fsmId", () => {
            expect(result?.children["cruising"]?.fsmId).toBe("deflector-shield");
        });

        it("should build child graph with correct nodes", () => {
            const childNodes = Object.keys(result?.children["cruising"]?.nodes ?? {});
            expect(childNodes).toEqual(expect.arrayContaining(["online", "offline"]));
        });
    });

    // =========================================================================
    // _child: unresolvable identifier (cross-module / not in scope) → children empty
    // =========================================================================

    describe("when a state has a _child identifier that cannot be resolved from scope", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: ident("importedChildFsm"), // not in scope — simulates cross-module import
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("borg-cube", "assimilating", [
                prop("assimilating", { type: "ObjectExpression", properties: [childProp] } as any),
                prop("dormant", objExpr()),
            ]);

            // Empty scope — the identifier won't resolve
            result = buildStateGraphFromAst(makeContext([]), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should leave children empty for the unresolvable state", () => {
            expect(result?.children).toEqual({});
        });
    });

    // =========================================================================
    // _child: let binding → skipped, children empty
    // =========================================================================

    describe("when a state has a _child identifier that resolves to a let binding", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const childCallNode: CallExpression = makeCallExpr(
                makeConfigObj("mutable-child", "ready", [prop("ready", objExpr())])
            );

            // `let` binding — should be rejected because it may be reassigned
            const scopeVariables = [
                {
                    name: "letChild",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: childCallNode,
                                parent: { kind: "let" },
                            },
                        },
                    ],
                },
            ];

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: ident("letChild"),
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("risky-parent", "armed", [
                prop("armed", { type: "ObjectExpression", properties: [childProp] } as any),
            ]);

            result = buildStateGraphFromAst(makeContext(scopeVariables), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should skip the let-bound child and leave children empty", () => {
            expect(result?.children).toEqual({});
        });
    });

    // =========================================================================
    // _child: non-machina call expression → skipped
    // =========================================================================

    describe("when a state has a _child that is a non-machina CallExpression", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const nonMachinaCall: Node = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "buildChildFsm" },
                arguments: [],
            } as any;

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: nonMachinaCall,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("parent-with-helper-child", "active", [
                prop("active", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("stop", lit("idle"))],
                } as any),
                prop("idle", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should skip the non-machina child and leave children empty", () => {
            expect(result?.children).toEqual({});
        });

        it("should still produce edges for other handlers in the same state", () => {
            const activeEdges = result?.nodes["active"]?.edges ?? [];
            expect(activeEdges).toEqual([
                { inputName: "stop", from: "active", to: "idle", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // Circular _child reference → recursion guard prevents infinite loop
    // =========================================================================

    describe("when two FSMs have circular _child references to each other", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // We can't actually create a circular object reference with plain objects,
            // but we can simulate the visited-set guard by reusing the same callNode
            // object as both parent and child — the visited set will catch the repeat.
            //
            // childCall is passed as the _child value and also as the root call,
            // so when the builder recurses into it and tries to recurse again
            // (because its _child points back to the same node), visited blocks it.

            // Build the "inner" call node that will represent the circular child
            const innerConfig = makeConfigObj("child-fsm", "c1", [prop("c1", objExpr())]);
            const innerCallNode: CallExpression = makeCallExpr(innerConfig);

            // Build a _child property pointing at innerCallNode
            const childPropForParent: Node = {
                type: "Property",
                key: ident("_child"),
                value: innerCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            // Now build innerCallNode's config to also point _child back at itself
            // (simulates: const a = createFsm({states: {x: {_child: a}}}))
            const selfRefProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: innerCallNode, // circular: points at the same CallExpression node object
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            // Patch the inner config's state to include a self-referential _child
            const c1State = (innerConfig.properties as any[]).find(
                (p: any) => p.key?.name === "states"
            );
            (c1State.value.properties as any[]) = [
                {
                    type: "Property",
                    key: ident("c1"),
                    value: { type: "ObjectExpression", properties: [selfRefProp] } as any,
                    kind: "init",
                    computed: false,
                    method: false,
                    shorthand: false,
                },
            ];

            const outerConfig = makeConfigObj("parent-fsm", "active", [
                prop("active", {
                    type: "ObjectExpression",
                    properties: [childPropForParent],
                } as any),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(outerConfig));
        });

        it("should return a graph without crashing", () => {
            expect(result).not.toBeNull();
        });

        it("should attach the first-level child", () => {
            expect(result?.children["active"]).toBeDefined();
        });

        it("should not recursively attach the self-referential child (circuit breaker fires)", () => {
            // The child FSM itself should have an empty children map
            // because the visited set blocked the circular recursion
            expect(result?.children["active"]?.children).toEqual({});
        });
    });

    // =========================================================================
    // Nested children — child of child resolved recursively
    // =========================================================================

    describe("when a child FSM itself has a _child (nested children)", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // Grandchild FSM: createFsm({ id: "deflector", ... })
            const grandchildCallNode: CallExpression = makeCallExpr(
                makeConfigObj("deflector", "online", [
                    prop("online", objExpr(prop("disable", lit("offline")))),
                    prop("offline", objExpr()),
                ])
            );

            const grandchildProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: grandchildCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            // Child FSM: has its own _child (the grandchild)
            const childCallNode: CallExpression = makeCallExpr(
                makeConfigObj("shields", "raised", [
                    prop("raised", {
                        type: "ObjectExpression",
                        properties: [grandchildProp, prop("lower", lit("lowered"))],
                    } as any),
                    prop("lowered", objExpr()),
                ])
            );

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: childCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            // Parent FSM: has the child
            const config = makeConfigObj("bridge", "red-alert", [
                prop("red-alert", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("stand-down", lit("yellow-alert"))],
                } as any),
                prop("yellow-alert", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should attach the child graph under the parent state", () => {
            expect(result?.children["red-alert"]).toBeDefined();
            expect(result?.children["red-alert"]?.fsmId).toBe("shields");
        });

        it("should recursively attach the grandchild under the child state", () => {
            expect(result?.children["red-alert"]?.children["raised"]).toBeDefined();
            expect(result?.children["red-alert"]?.children["raised"]?.fsmId).toBe("deflector");
        });

        it("should build grandchild nodes correctly", () => {
            const grandchildNodes = Object.keys(
                result?.children["red-alert"]?.children["raised"]?.nodes ?? {}
            );
            expect(grandchildNodes).toEqual(expect.arrayContaining(["online", "offline"]));
        });
    });

    // =========================================================================
    // _child: inline createBehavioralFsm() call → isMachinaCall returns true via
    // the "createBehavioralFsm" arm of the OR check (not the "createFsm" arm)
    // =========================================================================

    describe("when a state has an inline _child createBehavioralFsm() call", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const childCallNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createBehavioralFsm" },
                arguments: [
                    makeConfigObj("holodeck-safety", "active", [
                        prop("active", objExpr(prop("disengage", lit("bypassed")))),
                        prop("bypassed", objExpr(prop("engage", lit("active")))),
                    ]),
                ],
            } as any;

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: childCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("holodeck", "running", [
                prop("running", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("end", lit("offline"))],
                } as any),
                prop("offline", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should recognise createBehavioralFsm as a machina call and build the child graph", () => {
            expect(result?.children["running"]).toBeDefined();
        });

        it("should set the child fsmId from the createBehavioralFsm config", () => {
            expect(result?.children["running"]?.fsmId).toBe("holodeck-safety");
        });

        it("should build child nodes from the createBehavioralFsm config", () => {
            const childNodes = Object.keys(result?.children["running"]?.nodes ?? {});
            expect(childNodes).toEqual(expect.arrayContaining(["active", "bypassed"]));
        });
    });

    // =========================================================================
    // _child: CallExpression with a MemberExpression callee → isMachinaCall
    // returns false at the callee.type !== "Identifier" branch (line 150), then
    // childValue.type === "Identifier" is also false → resolveChildNode returns null
    // =========================================================================

    describe("when a state has a _child whose value is a CallExpression with a MemberExpression callee", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            const memberCall: Node = {
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    object: { type: "Identifier", name: "machina" },
                    property: { type: "Identifier", name: "createFsm" },
                    computed: false,
                },
                arguments: [],
            } as any;

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: memberCall,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("ten-forward", "open", [
                prop("open", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("close", lit("closed"))],
                } as any),
                prop("closed", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should skip the MemberExpression-callee child and leave children empty", () => {
            expect(result?.children).toEqual({});
        });

        it("should still produce edges for other handlers in the same state", () => {
            expect(result?.nodes["open"]?.edges).toEqual([
                { inputName: "close", from: "open", to: "closed", confidence: "definite" },
            ]);
        });
    });

    // =========================================================================
    // _child identifier resolves to a const whose init is not a machina call —
    // resolveChildCallExpression finds a non-null init but isMachinaCall returns
    // false (the `if (init && isMachinaCall(init))` false-branch on line 135)
    // =========================================================================

    describe("when a _child identifier resolves to a const whose initializer is not a machina factory call", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // Simulate `const frobnitz = someOtherFactory({...})` — valid const,
            // valid init, but NOT a createFsm/createBehavioralFsm call
            const nonMachinaInit: Node = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createRobotFsm" },
                arguments: [],
            } as any;

            const scopeVariables = [
                {
                    name: "frobnitz",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: nonMachinaInit,
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: ident("frobnitz"),
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("maquis-base", "hidden", [
                prop("hidden", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("reveal", lit("exposed"))],
                } as any),
                prop("exposed", objExpr()),
            ]);

            result = buildStateGraphFromAst(makeContext(scopeVariables), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should skip the non-machina-initializer child and leave children empty", () => {
            expect(result?.children).toEqual({});
        });
    });

    // =========================================================================
    // resolveConstInit: variable found, def is Variable/const, but init is null —
    // the `def.node.init ?? null` null-coalescing branch (line 90)
    // =========================================================================

    describe("when a config identifier resolves to a const declaration with a null initializer", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // Syntactically impossible in JS (`const x;` is a syntax error), but
            // the ESLint scope walker types allow it. The `?? null` branch on line 90
            // handles this defensively and we need to cover it.
            const scopeVariables = [
                {
                    name: "ghostConfig",
                    defs: [
                        {
                            type: "Variable",
                            node: {
                                init: null, // null init — the branch under test
                                parent: { kind: "const" },
                            },
                        },
                    ],
                },
            ];

            const callNode: CallExpression = {
                type: "CallExpression",
                callee: { type: "Identifier", name: "createFsm" } as any,
                arguments: [{ type: "Identifier", name: "ghostConfig" } as any],
            } as any;

            result = buildStateGraphFromAst(makeContext(scopeVariables), callNode);
        });

        it("should return null when the const has no initializer", () => {
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // Mixed: some states have resolvable _child, some don't
    // =========================================================================

    describe("when multiple states exist and only some have a resolvable _child", () => {
        let result: ReturnType<typeof buildStateGraphFromAst>;

        beforeEach(() => {
            // State A has an inline child FSM
            const childCallNode: CallExpression = makeCallExpr(
                makeConfigObj("turbolift", "moving", [
                    prop("moving", objExpr(prop("stop", lit("stopped")))),
                    prop("stopped", objExpr()),
                ])
            );

            const childProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: childCallNode,
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            // State B has an unresolvable _child (cross-module import not in scope)
            const unresolvableProp: Node = {
                type: "Property",
                key: ident("_child"),
                value: ident("importedTransporter"),
                kind: "init",
                computed: false,
                method: false,
                shorthand: false,
            } as any;

            const config = makeConfigObj("deck-systems", "deck-a", [
                prop("deck-a", {
                    type: "ObjectExpression",
                    properties: [childProp, prop("beam-out", lit("deck-b"))],
                } as any),
                prop("deck-b", {
                    type: "ObjectExpression",
                    properties: [unresolvableProp, prop("beam-in", lit("deck-a"))],
                } as any),
            ]);

            result = buildStateGraphFromAst(makeContext([]), makeCallExpr(config));
        });

        it("should return a graph (not null)", () => {
            expect(result).not.toBeNull();
        });

        it("should attach child graph only for the resolvable state", () => {
            expect(result?.children["deck-a"]).toBeDefined();
            expect(result?.children["deck-b"]).toBeUndefined();
        });

        it("should produce parent edges for both states regardless of child resolution", () => {
            expect(result?.nodes["deck-a"]?.edges).toEqual([
                { inputName: "beam-out", from: "deck-a", to: "deck-b", confidence: "definite" },
            ]);
            expect(result?.nodes["deck-b"]?.edges).toEqual([
                { inputName: "beam-in", from: "deck-b", to: "deck-a", confidence: "definite" },
            ]);
        });
    });
});
