/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { analyzeHandler } from "./handler-analyzer";

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
