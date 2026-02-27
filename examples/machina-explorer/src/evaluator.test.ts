/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// evaluator.test.ts — Tests for the config evaluator
// =============================================================================

import { evaluateConfig } from "./evaluator";

describe("evaluator", () => {
    describe("evaluateConfig", () => {
        describe("when given a valid bare object literal", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig(`{
                    initialState: "red",
                    states: {
                        red: { next: "green" },
                        green: { next: "red" },
                    }
                }`);
            });

            it("should return ok: true", () => {
                expect(result.ok).toBe(true);
            });

            it("should include the parsed config", () => {
                expect(result.ok && (result.config as any).initialState).toBe("red");
            });

            it("should default the id to 'fsm' when not provided", () => {
                expect(result.ok && (result.config as any).id).toBe("fsm");
            });
        });

        describe("when the config includes an id field", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig(`{
                    id: "HAL-9000",
                    initialState: "operational",
                    states: {
                        operational: { malfunction: "failsafe" },
                        failsafe: {},
                    }
                }`);
            });

            it("should return ok: true", () => {
                expect(result.ok).toBe(true);
            });

            it("should preserve the provided id", () => {
                expect(result.ok && (result.config as any).id).toBe("HAL-9000");
            });
        });

        describe("when given a source with a syntax error", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig("{ initialState: 'red' states: {} }");
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should return an error message starting with 'Syntax error:'", () => {
                expect(!result.ok && result.error).toMatch(/^Syntax error:/);
            });
        });

        describe("when the config is missing initialState", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig(`{ states: { idle: {} } }`);
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should return a validation error for initialState", () => {
                expect(!result.ok && result.error).toMatch(/initialState/);
            });
        });

        describe("when the config is missing states", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig(`{ initialState: "idle" }`);
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should return a validation error for states", () => {
                expect(!result.ok && result.error).toMatch(/states/);
            });
        });

        describe("when the source evaluates to a non-object", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                result = evaluateConfig(`42`);
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should describe the type in the error message", () => {
                expect(!result.ok && result.error).toMatch(/number/);
            });
        });

        describe("when the source uses an explicit return statement", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                // Wrapped `return (...)` will fail; fallback path should handle it
                result = evaluateConfig(`return {
                    initialState: "active",
                    states: { active: {} }
                }`);
            });

            it("should return ok: true via the fallback path", () => {
                expect(result.ok).toBe(true);
            });

            it("should parse the config correctly", () => {
                expect(result.ok && (result.config as any).initialState).toBe("active");
            });
        });

        describe("when the raw fallback throws a non-Error value", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                // `return (throw 42)` is a syntax error, so the wrapped path fails.
                // The raw path `new Function("throw 42")()` throws the number 42,
                // which is not an Error instance — exercises the String(rawErr) branch.
                result = evaluateConfig("throw 42");
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should stringify the non-Error throw value in the error message", () => {
                expect(!result.ok && result.error).toMatch(/^Syntax error: 42/);
            });
        });

        describe("when the config has an explicit empty string id", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                // ??= only assigns on null/undefined — an empty string id must be preserved,
                // not overwritten with "fsm". This tests the ??= NOT firing.
                result = evaluateConfig(`{
                    id: "",
                    initialState: "standby",
                    states: { standby: {} }
                }`);
            });

            it("should return ok: true", () => {
                expect(result.ok).toBe(true);
            });

            it("should preserve the empty string id without defaulting to 'fsm'", () => {
                expect(result.ok && (result.config as any).id).toBe("");
            });
        });

        describe("when the source evaluates to null", () => {
            let result: ReturnType<typeof evaluateConfig>;

            beforeEach(() => {
                // null passes the `typeof value !== "object"` check but fails the
                // `value === null` guard — exercises the null branch of validateShape.
                result = evaluateConfig("null");
            });

            it("should return ok: false", () => {
                expect(result.ok).toBe(false);
            });

            it("should report the type as 'object' in the error message", () => {
                expect(!result.ok && result.error).toMatch(/got object/);
            });
        });
    });
});
