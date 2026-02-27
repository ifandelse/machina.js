/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { analyzeHandler, walkHandlerAst, type AstFunctionNode } from "./handler-analyzer";

// Module-scope function needed by the bound-function test — linter requires
// functions used as bind targets to live at the outer scope.
function returnsStringForBinding() {
    return "bound";
}

// =============================================================================
// analyzeHandler
// =============================================================================

describe("analyzeHandler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // =========================================================================
    // Unconditional (definite) returns
    // =========================================================================

    describe("when the handler has a single unconditional return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(() => {
                return "stateB";
            });
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("stateB");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    describe("when the handler is an arrow function with implicit return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            // Arrow functions with block bodies are tested above.
            // We can only test explicit return in arrow functions with blocks
            // since implicit returns produce no ReturnStatement node.
            result = analyzeHandler(function () {
                return "running";
            });
        });

        it("should extract the returned state name", () => {
            expect(result[0].target).toBe("running");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    // =========================================================================
    // Conditional (possible) returns
    // =========================================================================

    describe("when the handler has a conditional return inside an if statement", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                if (args.ctx.x) {
                    return "stateB";
                }
            });
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("stateB");
        });

        it("should assign possible confidence", () => {
            expect(result[0].confidence).toBe("possible");
        });
    });

    describe("when the handler has multiple returns (early return + final return)", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                if (args.ctx.x) {
                    return "a";
                }
                return "b";
            });
        });

        it("should return two targets", () => {
            expect(result).toHaveLength(2);
        });

        it("should include both target states", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["a", "b"]));
        });

        it("should assign possible confidence to both", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });
    });

    describe("when the handler has a ternary return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                return args.ctx.x ? "a" : "b";
            });
        });

        it("should return two targets", () => {
            expect(result).toHaveLength(2);
        });

        it("should include both ternary branch states", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["a", "b"]));
        });

        it("should assign possible confidence to both", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });
    });

    // =========================================================================
    // No return / void returns
    // =========================================================================

    describe("when the handler has no return statement", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                args.ctx.count++;
            });
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    describe("when the handler returns void (no value)", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function () {
                return;
            });
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Non-string returns (ignored)
    // =========================================================================

    describe("when the handler returns a variable (non-string literal)", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                return args.ctx.nextState;
            });
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    describe("when the handler returns a number literal", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function () {
                return 42 as any;
            });
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Switch statement (conditional)
    // =========================================================================

    describe("when the handler returns inside a switch statement", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                switch (args.ctx.severity) {
                    case "high":
                        return "critical";
                    case "low":
                        return "warning";
                    default:
                        return "normal";
                }
            });
        });

        it("should return three targets", () => {
            expect(result).toHaveLength(3);
        });

        it("should mark all as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });

        it("should include all switch case targets", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["critical", "warning", "normal"]));
        });
    });

    // =========================================================================
    // _onEnter unconditional bounce
    // =========================================================================

    describe("when an _onEnter handler has an unconditional bounce", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            // Simulates an _onEnter that always bounces to another state
            result = analyzeHandler(function () {
                return "initializing";
            });
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the bounce target", () => {
            expect(result[0].target).toBe("initializing");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    // =========================================================================
    // Nested functions (should not pick up returns from inner functions)
    // =========================================================================

    describe("when the handler contains a nested function with its own return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                const helper = function () {
                    return "innerState";
                };
                args.ctx.helperResult = helper();
                // No outer return — should produce no targets
            });
        });

        it("should return an empty array (nested function returns are not the handler's return)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Concise arrow functions (expression body — no ReturnStatement in AST)
    // =========================================================================

    describe("when the handler is a concise arrow function returning a string literal", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            // ts-jest compiles `() => "stateB"` to an ArrowFunctionExpression
            // with expression: true and a Literal body — no ReturnStatement.
            result = analyzeHandler((() => "stateB") as unknown as (...args: unknown[]) => unknown);
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("stateB");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    describe("when the handler is a concise arrow function returning a non-string expression", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            // `() => someVar` — concise arrow with a non-literal body.
            // No state target extractable, should return empty array without crashing.
            const someVar = "ignored";
            result = analyzeHandler((() => someVar) as unknown as (...args: unknown[]) => unknown);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // LogicalExpression short-circuit returns
    // =========================================================================

    describe("when the handler uses logical short-circuit to return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                return (args.ctx.ready && "online") as any;
            });
        });

        it("should return the string literal from the logical expression", () => {
            // The right side of && is a string literal — the walker finds it
            // inside the LogicalExpression and marks it as possible.
            expect(result).toHaveLength(1);
        });

        it("should assign possible confidence", () => {
            expect(result[0].confidence).toBe("possible");
        });

        it("should extract the correct target state", () => {
            expect(result[0].target).toBe("online");
        });
    });

    // =========================================================================
    // Native / bound functions — [native code] detection
    // =========================================================================

    describe("when the handler is a bound function", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            // Bound functions stringify to "function () { [native code] }" in V8
            result = analyzeHandler(
                returnsStringForBinding.bind(null) as unknown as (...args: unknown[]) => unknown
            );
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    describe("when the handler is a native function", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(Object.keys as unknown as (...args: unknown[]) => unknown);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // TryStatement — returns inside try/catch are conditional
    // =========================================================================

    describe("when the handler returns inside a try block", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                try {
                    // JSON.parse can throw — try body is not unconditionally returning
                    const data = JSON.parse(args.ctx.payload);
                    if (data) {
                        return "connected";
                    }
                } catch {
                    return "error";
                }
            });
        });

        it("should return two targets", () => {
            expect(result).toHaveLength(2);
        });

        it("should mark all returns from try/catch as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });

        it("should include both target states", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["connected", "error"]));
        });
    });

    // =========================================================================
    // Return inside a loop body — for/while
    // =========================================================================

    describe("when the handler returns inside a for-of loop", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                for (const item of args.ctx.items) {
                    if (item.done) {
                        return "finished";
                    }
                }
            });
        });

        it("should find the string return inside the loop", () => {
            const targets = result.map(r => r.target);
            expect(targets).toContain("finished");
        });

        it("should mark the loop return as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });
    });

    describe("when the handler returns inside a while loop", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                let attempts = 0;
                while (attempts < args.ctx.maxRetries) {
                    attempts++;
                    if (args.ctx.ready) {
                        return "running";
                    }
                }
            });
        });

        it("should find the string return inside the while loop", () => {
            const targets = result.map(r => r.target);
            expect(targets).toContain("running");
        });
    });

    // =========================================================================
    // Nested arrow function — returns from inner scope must not be collected
    // =========================================================================

    describe("when the handler contains a nested arrow function with its own return", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                const picker = () => "innerState";
                args.ctx.next = picker();
                // No outer return
            });
        });

        it("should return an empty array (nested arrow returns are not the handler's return)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Deeply nested conditionals
    // =========================================================================

    describe("when the handler has an if nested inside another if", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function (args: any) {
                if (args.ctx.ready) {
                    if (args.ctx.authenticated) {
                        return "dashboard";
                    }
                }
            });
        });

        it("should find the deeply nested return", () => {
            const targets = result.map(r => r.target);
            expect(targets).toContain("dashboard");
        });

        it("should mark the deeply nested return as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });
    });

    // =========================================================================
    // Template literal return — ignored per spec
    // =========================================================================

    describe("when the handler returns a template literal", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            const state = "running";
            result = analyzeHandler(function () {
                return `${state}` as any;
            });
        });

        it("should return an empty array (template literals are not static string literals)", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Boolean / object return — ignored (non-string literal)
    // =========================================================================

    describe("when the handler returns a boolean literal", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler(function () {
                return true as any;
            });
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Concise arrow returning a number — non-string concise body
    // =========================================================================

    describe("when the handler is a concise arrow function returning a number literal", () => {
        let result: ReturnType<typeof analyzeHandler>;

        beforeEach(() => {
            result = analyzeHandler((() => 42) as unknown as (...args: unknown[]) => unknown);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });
});

// =============================================================================
// walkHandlerAst — accepts a pre-parsed AST node directly
//
// These tests construct synthetic ESTree-compatible nodes by hand to verify
// that walkHandlerAst produces the same results as analyzeHandler for
// equivalent function bodies, without going through fn.toString() + acorn.
// =============================================================================

describe("walkHandlerAst", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    // Helper: build a minimal ArrowFunctionExpression node with a concise
    // (expression) body — equivalent to `() => "targetState"`.
    const makeConciseArrow = (returnValue: string): AstFunctionNode => ({
        type: "ArrowFunctionExpression",
        expression: true,
        params: [],
        body: {
            type: "Literal",
            value: returnValue,
        } as any,
    });

    // Helper: build a FunctionExpression with a single unconditional return.
    // Equivalent to `function() { return "targetState"; }`.
    const makeFunctionWithReturn = (returnValue: string): AstFunctionNode => ({
        type: "FunctionExpression",
        expression: false,
        params: [],
        body: {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: {
                        type: "Literal",
                        value: returnValue,
                    },
                },
            ],
        } as any,
    });

    // Helper: build a FunctionExpression with a return inside an IfStatement.
    // Equivalent to `function() { if (x) { return "targetState"; } }`.
    const makeFunctionWithConditionalReturn = (returnValue: string): AstFunctionNode => ({
        type: "FunctionExpression",
        expression: false,
        params: [],
        body: {
            type: "BlockStatement",
            body: [
                {
                    type: "IfStatement",
                    test: { type: "Identifier", name: "x" },
                    consequent: {
                        type: "BlockStatement",
                        body: [
                            {
                                type: "ReturnStatement",
                                argument: { type: "Literal", value: returnValue },
                            },
                        ],
                    },
                    alternate: null,
                },
            ],
        } as any,
    });

    // =========================================================================
    // Concise arrow with string literal body → one definite target
    // =========================================================================

    describe("when given a concise ArrowFunctionExpression returning a string literal", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            result = walkHandlerAst(makeConciseArrow("warp-speed"));
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("warp-speed");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    // =========================================================================
    // FunctionExpression with single unconditional return → one definite target
    // =========================================================================

    describe("when given a FunctionExpression with a single unconditional return", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            result = walkHandlerAst(makeFunctionWithReturn("hyperspace"));
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("hyperspace");
        });

        it("should assign definite confidence", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    // =========================================================================
    // FunctionExpression with conditional return → one possible target
    // =========================================================================

    describe("when given a FunctionExpression with a conditional return inside an IfStatement", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            result = walkHandlerAst(makeFunctionWithConditionalReturn("shields-up"));
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should return the correct target state", () => {
            expect(result[0].target).toBe("shields-up");
        });

        it("should assign possible confidence", () => {
            expect(result[0].confidence).toBe("possible");
        });
    });

    // =========================================================================
    // FunctionExpression with no string return → empty array
    // =========================================================================

    describe("when given a FunctionExpression with no string return", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "FunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "ReturnStatement",
                            argument: null,
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // Concise arrow with non-string body → empty array (no false edges)
    // =========================================================================

    describe("when given a concise ArrowFunctionExpression returning a non-string expression", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "ArrowFunctionExpression",
                expression: true,
                params: [],
                body: {
                    type: "Identifier",
                    name: "someVar",
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // FunctionExpression with multiple unconditional string returns
    // → isSoleReturn is false → all targets get "possible" confidence
    // =========================================================================

    describe("when given a FunctionExpression with two unconditional string returns", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            // Two top-level return statements (unreachable second one, but AST has both).
            // isSoleReturn = false, so all returns become "possible".
            const node: AstFunctionNode = {
                type: "FunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "ReturnStatement",
                            argument: { type: "Literal", value: "enterprise" },
                        },
                        {
                            type: "ReturnStatement",
                            argument: { type: "Literal", value: "voyager" },
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return two targets", () => {
            expect(result).toHaveLength(2);
        });

        it("should assign possible confidence to both when there are multiple returns", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });

        it("should include both target state names", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["enterprise", "voyager"]));
        });
    });

    // =========================================================================
    // FunctionExpression with a switch statement → conditional returns
    // =========================================================================

    describe("when given a FunctionExpression with returns inside a switch statement", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "FunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "SwitchStatement",
                            discriminant: { type: "Identifier", name: "x" },
                            cases: [
                                {
                                    type: "SwitchCase",
                                    test: { type: "Literal", value: 1 },
                                    consequent: [
                                        {
                                            type: "ReturnStatement",
                                            argument: { type: "Literal", value: "warp" },
                                        },
                                    ],
                                },
                                {
                                    type: "SwitchCase",
                                    test: null,
                                    consequent: [
                                        {
                                            type: "ReturnStatement",
                                            argument: { type: "Literal", value: "impulse" },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return two targets", () => {
            expect(result).toHaveLength(2);
        });

        it("should mark all switch-case returns as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });

        it("should include both case target states", () => {
            const targets = result.map(r => r.target);
            expect(targets).toEqual(expect.arrayContaining(["warp", "impulse"]));
        });
    });

    // =========================================================================
    // FunctionExpression that only throws — no returns at all → empty array
    // =========================================================================

    describe("when given a FunctionExpression that only throws and never returns", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "FunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "ThrowStatement",
                            argument: {
                                type: "NewExpression",
                                callee: { type: "Identifier", name: "Error" },
                                arguments: [{ type: "Literal", value: "E_COLD_CALZONE" }],
                            },
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return an empty array", () => {
            expect(result).toHaveLength(0);
        });
    });

    // =========================================================================
    // ArrowFunctionExpression with a block body (not concise) — expression: false
    // → checkConciseArrow returns undefined, falls through to general walker
    // =========================================================================

    describe("when given a block-body ArrowFunctionExpression (not concise)", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "ArrowFunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "ReturnStatement",
                            argument: { type: "Literal", value: "deep-space-nine" },
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should return one target", () => {
            expect(result).toHaveLength(1);
        });

        it("should extract the correct target state", () => {
            expect(result[0].target).toBe("deep-space-nine");
        });

        it("should assign definite confidence for a sole unconditional return", () => {
            expect(result[0].confidence).toBe("definite");
        });
    });

    // =========================================================================
    // FunctionExpression with deeply nested if-inside-if returns
    // =========================================================================

    describe("when given a FunctionExpression with an if nested inside another if", () => {
        let result: ReturnType<typeof walkHandlerAst>;

        beforeEach(() => {
            const node: AstFunctionNode = {
                type: "FunctionExpression",
                expression: false,
                params: [],
                body: {
                    type: "BlockStatement",
                    body: [
                        {
                            type: "IfStatement",
                            test: { type: "Identifier", name: "a" },
                            consequent: {
                                type: "BlockStatement",
                                body: [
                                    {
                                        type: "IfStatement",
                                        test: { type: "Identifier", name: "b" },
                                        consequent: {
                                            type: "BlockStatement",
                                            body: [
                                                {
                                                    type: "ReturnStatement",
                                                    argument: {
                                                        type: "Literal",
                                                        value: "bajor",
                                                    },
                                                },
                                            ],
                                        },
                                        alternate: null,
                                    },
                                ],
                            },
                            alternate: null,
                        },
                    ],
                } as any,
            };
            result = walkHandlerAst(node);
        });

        it("should find the deeply nested return", () => {
            const targets = result.map(r => r.target);
            expect(targets).toContain("bajor");
        });

        it("should mark the deeply nested return as possible", () => {
            expect(result.every(r => r.confidence === "possible")).toBe(true);
        });
    });
});
