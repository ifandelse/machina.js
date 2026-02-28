/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { createFsm, createBehavioralFsm } from "machina";
import {
    createPrng,
    randomInt,
    extractInputs,
    walkAll,
    WalkFailureError,
    type InvariantArgs,
} from "./walk";

// =============================================================================
// FSM fixtures
//
// Traffic light: green → yellow → red → green (cyclic, three inputs)
// Counter FSM:   idle ↔ counting, with context mutations per step
// Invariant-breaking FSM: always transitions to a "bad" state on "trigger"
// =============================================================================

const makeTrafficLight = () =>
    createFsm({
        id: "traffic-light",
        initialState: "green",
        context: { ticks: 0 },
        states: {
            green: {
                timeout: "yellow" as const,
                tick({ ctx }: any) {
                    ctx.ticks++;
                },
            },
            yellow: { timeout: "red" as const },
            red: { timeout: "green" as const },
        },
    });

const makeCounter = () =>
    createFsm({
        id: "counter",
        initialState: "idle",
        context: { count: 0 },
        states: {
            idle: {
                start: "counting" as const,
                reset({ ctx }: any) {
                    ctx.count = 0;
                },
            },
            counting: {
                increment({ ctx }: any) {
                    ctx.count++;
                },
                stop: "idle" as const,
            },
        },
    });

const makeAlwaysValid = () =>
    createFsm({
        id: "always-valid",
        initialState: "on",
        context: {},
        states: {
            on: { toggle: "off" as const },
            off: { toggle: "on" as const },
        },
    });

// A FSM that transitions to "exploded" when it receives "trigger".
// Used to test invariant violations.
const makeBombFsm = () =>
    createFsm({
        id: "bomb",
        initialState: "safe",
        context: {},
        states: {
            safe: { trigger: "exploded" as const, disarm() {} },
            exploded: { disarm() {} },
        },
    });

const makeBehavioralLight = () =>
    createBehavioralFsm({
        id: "bfsm-light",
        initialState: "green",
        states: {
            green: { timeout: "yellow" as const },
            yellow: { timeout: "red" as const },
            red: { timeout: "green" as const },
        },
    });

// =============================================================================
// Task 2: createPrng / randomInt
// =============================================================================

describe("createPrng", () => {
    describe("when called with a fixed seed", () => {
        let prng: () => number, first: number, second: number;

        beforeEach(() => {
            prng = createPrng(42);
            first = prng();
            second = prng();
        });

        it("should return floats in [0, 1)", () => {
            expect(first).toBeGreaterThanOrEqual(0);
            expect(first).toBeLessThan(1);
        });

        it("should produce different consecutive values", () => {
            expect(first).not.toBe(second);
        });
    });

    describe("when two PRNGs share the same seed", () => {
        let seqA: number[], seqB: number[];

        beforeEach(() => {
            seqA = [];
            seqB = [];
            const prngA = createPrng(8675309);
            const prngB = createPrng(8675309);
            for (let i = 0; i < 10; i++) {
                seqA.push(prngA());
                seqB.push(prngB());
            }
        });

        it("should produce identical sequences", () => {
            expect(seqA).toEqual(seqB);
        });
    });

    describe("when two PRNGs use different seeds", () => {
        let seqA: number[], seqB: number[];

        beforeEach(() => {
            seqA = [];
            seqB = [];
            const prngA = createPrng(1);
            const prngB = createPrng(2);
            for (let i = 0; i < 5; i++) {
                seqA.push(prngA());
                seqB.push(prngB());
            }
        });

        it("should produce different sequences", () => {
            expect(seqA).not.toEqual(seqB);
        });
    });
});

describe("randomInt", () => {
    describe("when called with max=4", () => {
        let result: number;

        beforeEach(() => {
            // A PRNG returning 0.75 → floor(0.75 * 4) = 3
            result = randomInt(() => 0.75, 4);
        });

        it("should return an integer in [0, max)", () => {
            expect(result).toBe(3);
        });
    });

    describe("when PRNG returns 0", () => {
        let result: number;

        beforeEach(() => {
            result = randomInt(() => 0, 4);
        });

        it("should return 0", () => {
            expect(result).toBe(0);
        });
    });
});

// =============================================================================
// Task 3: extractInputs + config validation
// =============================================================================

describe("extractInputs", () => {
    describe("when given a traffic light FSM", () => {
        let result: string[];

        beforeEach(() => {
            result = extractInputs(makeTrafficLight());
        });

        it("should return the correct input names", () => {
            expect(result).toEqual(expect.arrayContaining(["tick", "timeout"]));
            expect(result).toHaveLength(2);
        });

        it("should not include lifecycle hooks", () => {
            expect(result).not.toContain("_onEnter");
            expect(result).not.toContain("_onExit");
        });

        it("should not include _child or * keys", () => {
            expect(result).not.toContain("_child");
            expect(result).not.toContain("*");
        });
    });

    describe("when given a multi-state FSM with overlapping handler names", () => {
        let result: string[];

        beforeEach(() => {
            // counter FSM has "start", "reset", "increment", "stop"
            result = extractInputs(makeCounter());
        });

        it("should deduplicate input names across states", () => {
            // Each name appears only once
            const unique = [...new Set(result)];
            expect(result.length).toBe(unique.length);
        });

        it("should include inputs from all states", () => {
            expect(result).toEqual(expect.arrayContaining(["start", "reset", "increment", "stop"]));
        });
    });
});

describe("walkAll config validation", () => {
    describe("when walks is 0", () => {
        let error: Error | undefined;

        beforeEach(() => {
            error = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    walks: 0,
                    maxSteps: 5,
                    invariant: () => {},
                });
            } catch (err) {
                error = err as Error;
            }
        });

        it("should throw an error", () => {
            expect(error).toBeDefined();
        });

        it("should mention walks in the error message", () => {
            expect(error!.message).toContain("walks");
        });
    });

    describe("when maxSteps is 0", () => {
        let error: Error | undefined;

        beforeEach(() => {
            error = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    walks: 1,
                    maxSteps: 0,
                    invariant: () => {},
                });
            } catch (err) {
                error = err as Error;
            }
        });

        it("should throw an error", () => {
            expect(error).toBeDefined();
        });

        it("should mention maxSteps in the error message", () => {
            expect(error!.message).toContain("maxSteps");
        });
    });

    describe("when include and exclude are both provided", () => {
        let error: Error | undefined;

        beforeEach(() => {
            error = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    include: ["toggle"],
                    exclude: ["toggle"],
                    invariant: () => {},
                });
            } catch (err) {
                error = err as Error;
            }
        });

        it("should throw an error", () => {
            expect(error).toBeDefined();
        });

        it("should mention mutual exclusivity in the message", () => {
            expect(error!.message).toContain("mutually exclusive");
        });
    });

    describe("when exclude removes all available inputs", () => {
        let error: Error | undefined;

        beforeEach(() => {
            error = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    exclude: ["toggle"],
                    invariant: () => {},
                });
            } catch (err) {
                error = err as Error;
            }
        });

        it("should throw an error about empty input set", () => {
            expect(error).toBeDefined();
            expect(error!.message).toContain("no inputs available");
        });
    });

    describe("when include restricts to a valid subset", () => {
        let result: any;

        beforeEach(() => {
            result = walkAll(() => makeTrafficLight(), {
                include: ["timeout"],
                walks: 3,
                maxSteps: 5,
                invariant: () => {},
            });
        });

        it("should complete without error", () => {
            expect(result.walksCompleted).toBe(3);
        });
    });

    describe("when include contains an input not in the FSM", () => {
        let error: Error | undefined;

        beforeEach(() => {
            error = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    include: ["toggle", "E_GHOST_INPUT"],
                    invariant: () => {},
                });
            } catch (err) {
                error = err as Error;
            }
        });

        it("should throw an error", () => {
            expect(error).toBeDefined();
        });

        it("should name the unknown input in the error message", () => {
            expect(error!.message).toContain("E_GHOST_INPUT");
        });
    });
});

// =============================================================================
// Task 4: walkAll core
// =============================================================================

describe("walkAll", () => {
    describe("when given a healthy FSM and a permissive invariant", () => {
        let result: any;

        beforeEach(() => {
            result = walkAll(() => makeTrafficLight(), {
                walks: 10,
                maxSteps: 20,
                seed: 42,
                invariant: () => {},
            });
        });

        it("should complete the configured number of walks", () => {
            expect(result.walksCompleted).toBe(10);
        });

        it("should return the provided seed", () => {
            expect(result.seed).toBe(42);
        });
    });

    describe("when the seed is not provided", () => {
        let result: any;

        beforeEach(() => {
            result = walkAll(() => makeAlwaysValid(), {
                walks: 1,
                maxSteps: 5,
                invariant: () => {},
            });
        });

        it("should return a numeric seed", () => {
            expect(typeof result.seed).toBe("number");
        });
    });

    describe("when the invariant is violated", () => {
        let thrownError: unknown;

        beforeEach(() => {
            thrownError = undefined;
            try {
                // Bomb FSM: invariant fails whenever we're in "exploded"
                walkAll(() => makeBombFsm(), {
                    walks: 50,
                    maxSteps: 10,
                    seed: 1,
                    invariant({ state }) {
                        if (state === "exploded") {
                            throw new Error("E_KABOOM: FSM should never explode");
                        }
                    },
                });
            } catch (err) {
                thrownError = err;
            }
        });

        it("should throw a WalkFailureError", () => {
            expect(thrownError).toBeInstanceOf(WalkFailureError);
        });

        it("should include the seed on the error", () => {
            const err = thrownError as WalkFailureError;
            expect(typeof err.seed).toBe("number");
        });

        it("should include a step number on the error", () => {
            const err = thrownError as WalkFailureError;
            expect(err.step).toBeGreaterThanOrEqual(1);
        });

        it("should include the state that caused the violation", () => {
            const err = thrownError as WalkFailureError;
            expect(err.state).toBe("exploded");
        });

        it("should include the input sequence up to the failing step", () => {
            const err = thrownError as WalkFailureError;
            expect(err.inputSequence.length).toBeGreaterThanOrEqual(1);
            expect(err.inputSequence[err.step - 1].input).toBe("trigger");
        });

        it("should include a human-readable error message", () => {
            const err = thrownError as WalkFailureError;
            expect(err.message).toContain("seed");
            expect(err.message).toContain("step");
        });
    });

    describe("when the invariant is called after each transition", () => {
        let invariantCallCount: number;

        beforeEach(() => {
            invariantCallCount = 0;
            // Traffic light: every timeout input causes a transition.
            // 3 walks × 3 steps each = at least 9 invariant calls.
            walkAll(() => makeTrafficLight(), {
                walks: 3,
                maxSteps: 3,
                seed: 99,
                include: ["timeout"],
                invariant: () => {
                    invariantCallCount++;
                },
            });
        });

        it("should call the invariant after every transition", () => {
            // 3 walks × 3 steps, all inputs are "timeout" which always transitions
            expect(invariantCallCount).toBe(9);
        });
    });

    describe("when invariant receives args", () => {
        let capturedArgs: InvariantArgs[];

        beforeEach(() => {
            capturedArgs = [];
            walkAll(() => makeTrafficLight(), {
                walks: 1,
                maxSteps: 2,
                seed: 7,
                include: ["timeout"],
                invariant(args) {
                    capturedArgs.push(args);
                },
            });
        });

        it("should pass state to the invariant", () => {
            expect(capturedArgs[0].state).toBeDefined();
        });

        it("should pass previousState to the invariant", () => {
            expect(capturedArgs[0].previousState).toBeDefined();
        });

        it("should pass compositeState to the invariant", () => {
            expect(typeof capturedArgs[0].compositeState).toBe("string");
        });

        it("should pass the ctx (context) to the invariant", () => {
            expect(capturedArgs[0].ctx).toBeDefined();
        });

        it("should pass the input name to the invariant", () => {
            expect(capturedArgs[0].input).toBe("timeout");
        });

        it("should pass a step number >= 1 to the invariant", () => {
            expect(capturedArgs[0].step).toBeGreaterThanOrEqual(1);
        });
    });

    describe("when a payload generator is configured for an input", () => {
        let generatorCalled: boolean, capturedPayload: unknown;

        beforeEach(() => {
            generatorCalled = false;
            capturedPayload = undefined;
            walkAll(() => makeTrafficLight(), {
                walks: 1,
                maxSteps: 3,
                seed: 5,
                include: ["timeout"],
                inputs: {
                    timeout: () => {
                        generatorCalled = true;
                        return { priority: "EMERGENCY" };
                    },
                },
                invariant({ payload }) {
                    capturedPayload = payload;
                },
            });
        });

        it("should call the payload generator for matching inputs", () => {
            expect(generatorCalled).toBe(true);
        });

        it("should pass the generated payload to the invariant", () => {
            expect(capturedPayload).toEqual({ priority: "EMERGENCY" });
        });
    });

    describe("when no payload generator is configured for an input", () => {
        let capturedPayload: unknown;
        const SENTINEL = Symbol("not-set");

        beforeEach(() => {
            capturedPayload = SENTINEL;
            walkAll(() => makeTrafficLight(), {
                walks: 1,
                maxSteps: 2,
                seed: 3,
                include: ["timeout"],
                invariant({ payload }) {
                    capturedPayload = payload;
                },
            });
        });

        it("should pass undefined as payload when no generator is configured", () => {
            expect(capturedPayload).toBeUndefined();
        });
    });

    describe("when the FSM is a BehavioralFsm with a client factory", () => {
        let result: any;

        beforeEach(() => {
            result = walkAll(() => makeBehavioralLight(), {
                walks: 5,
                maxSteps: 6,
                seed: 42,
                client: () => ({}),
                invariant: () => {},
            });
        });

        it("should complete all walks", () => {
            expect(result.walksCompleted).toBe(5);
        });

        it("should return the provided seed", () => {
            expect(result.seed).toBe(42);
        });
    });

    describe("when the invariant returns false", () => {
        let thrownError: unknown;

        beforeEach(() => {
            thrownError = undefined;
            try {
                // Toggle FSM always transitions — the invariant immediately returns false
                walkAll(() => makeAlwaysValid(), {
                    walks: 1,
                    maxSteps: 5,
                    seed: 1,
                    invariant: () => false,
                });
            } catch (err) {
                thrownError = err;
            }
        });

        it("should throw a WalkFailureError", () => {
            expect(thrownError).toBeInstanceOf(WalkFailureError);
        });

        it("should include the step number in the error", () => {
            expect((thrownError as WalkFailureError).step).toBeGreaterThanOrEqual(1);
        });
    });

    describe("when the invariant returns true", () => {
        let result: any;

        beforeEach(() => {
            result = undefined;
            result = walkAll(() => makeAlwaysValid(), {
                walks: 2,
                maxSteps: 3,
                seed: 1,
                invariant: () => true,
            });
        });

        it("should complete all walks without throwing", () => {
            expect(result.walksCompleted).toBe(2);
        });
    });

    describe("when the invariant returns undefined (void)", () => {
        let result: any;

        beforeEach(() => {
            result = undefined;
            result = walkAll(() => makeAlwaysValid(), {
                walks: 2,
                maxSteps: 3,
                seed: 1,
                invariant: () => undefined,
            });
        });

        it("should complete all walks without throwing", () => {
            expect(result.walksCompleted).toBe(2);
        });
    });

    describe("when checking the step number on the first transition", () => {
        let firstStep: number;

        beforeEach(() => {
            firstStep = -1;
            // toggle always transitions, so the very first handle() call fires transitioned.
            // Capture step from the first invariant invocation only.
            walkAll(() => makeAlwaysValid(), {
                walks: 1,
                maxSteps: 3,
                seed: 1,
                include: ["toggle"],
                invariant({ step }) {
                    if (firstStep === -1) {
                        firstStep = step;
                    }
                },
            });
        });

        it("should report the first transition as step 1 (1-indexed, not 0)", () => {
            expect(firstStep).toBe(1);
        });
    });

    describe("when a BehavioralFsm walk violates the invariant", () => {
        let thrownError: unknown;
        const makeBehavioralBomb = () =>
            createBehavioralFsm({
                id: "bfsm-bomb",
                initialState: "safe",
                states: {
                    safe: { detonate: "exploded" as const, disarm() {} },
                    exploded: { disarm() {} },
                },
            });

        beforeEach(() => {
            thrownError = undefined;
            try {
                walkAll(() => makeBehavioralBomb(), {
                    walks: 30,
                    maxSteps: 10,
                    seed: 1,
                    client: () => ({}),
                    invariant({ state }) {
                        if (state === "exploded") {
                            throw new Error("E_BFSM_KABOOM");
                        }
                    },
                });
            } catch (err) {
                thrownError = err;
            }
        });

        it("should throw a WalkFailureError", () => {
            expect(thrownError).toBeInstanceOf(WalkFailureError);
        });

        it("should report the violating state", () => {
            expect((thrownError as WalkFailureError).state).toBe("exploded");
        });
    });
});

// =============================================================================
// Task 5: Seed reproducibility
// =============================================================================

describe("walkAll seed reproducibility", () => {
    describe("when the same seed is used twice", () => {
        let firstSequence: string[], secondSequence: string[];

        beforeEach(() => {
            const SEED = 90210;

            const record = (seq: string[]) =>
                walkAll(() => makeTrafficLight(), {
                    walks: 3,
                    maxSteps: 5,
                    seed: SEED,
                    invariant({ input }) {
                        seq.push(input);
                    },
                });

            firstSequence = [];
            secondSequence = [];
            record(firstSequence);
            record(secondSequence);
        });

        it("should produce identical input sequences", () => {
            expect(firstSequence).toEqual(secondSequence);
        });
    });

    describe("when replaying a failed walk using the error seed", () => {
        let firstError: WalkFailureError, secondError: WalkFailureError;

        beforeEach(() => {
            const runBomb = (seed: number): WalkFailureError => {
                try {
                    walkAll(() => makeBombFsm(), {
                        walks: 50,
                        maxSteps: 10,
                        seed,
                        invariant({ state }) {
                            if (state === "exploded") {
                                throw new Error("E_REPLAY_KABOOM");
                            }
                        },
                    });
                } catch (err) {
                    return err as WalkFailureError;
                }
                // If it doesn't throw with seed=1, adjust — but it always should
                throw new Error("Expected WalkFailureError but walkAll succeeded");
            };

            firstError = runBomb(1);
            secondError = runBomb(firstError.seed);
        });

        it("should fail at the same step", () => {
            expect(secondError.step).toBe(firstError.step);
        });

        it("should produce the same input sequence", () => {
            expect(secondError.inputSequence).toEqual(firstError.inputSequence);
        });

        it("should fail in the same state", () => {
            expect(secondError.state).toBe(firstError.state);
        });
    });
});

// =============================================================================
// WalkFailureError — message format and non-Error cause
// =============================================================================

describe("WalkFailureError", () => {
    describe("when constructed with an Error cause", () => {
        let err: WalkFailureError;

        beforeEach(() => {
            err = new WalkFailureError({
                seed: 42,
                step: 3,
                inputSequence: [
                    { input: "tick", payload: undefined },
                    { input: "timeout", payload: { priority: "HIGH" } },
                    { input: "tick", payload: undefined },
                ],
                state: "yellow",
                previousState: "green",
                compositeState: "yellow",
                ctx: { ticks: 1 },
                cause: new Error("E_INVARIANT_BREACH: count went negative"),
            });
        });

        it("should set name to WalkFailureError", () => {
            expect(err.name).toBe("WalkFailureError");
        });

        it("should include the seed in the message", () => {
            expect(err.message).toContain("42");
        });

        it("should include the step number in the message", () => {
            expect(err.message).toContain("step 3");
        });

        it("should include the state transition in the message", () => {
            expect(err.message).toContain("green");
            expect(err.message).toContain("yellow");
        });

        it("should include the cause message in the message", () => {
            expect(err.message).toContain("E_INVARIANT_BREACH: count went negative");
        });

        it("should include the input sequence summary in the message", () => {
            expect(err.message).toContain("tick");
            expect(err.message).toContain("timeout");
        });

        it("should set all structured properties", () => {
            expect(err.seed).toBe(42);
            expect(err.step).toBe(3);
            expect(err.state).toBe("yellow");
            expect(err.previousState).toBe("green");
            expect(err.compositeState).toBe("yellow");
        });
    });

    describe("when constructed with a non-Error cause", () => {
        let err: WalkFailureError;

        beforeEach(() => {
            err = new WalkFailureError({
                seed: 7,
                step: 1,
                inputSequence: [{ input: "toggle", payload: undefined }],
                state: "off",
                previousState: "on",
                compositeState: "off",
                ctx: {},
                // Throwing a plain string hits the String(cause) branch in the constructor
                cause: "E_PLAIN_STRING_THROWN",
            });
        });

        it("should include the stringified cause in the message", () => {
            expect(err.message).toContain("E_PLAIN_STRING_THROWN");
        });
    });
});

// =============================================================================
// PRNG edge cases
// =============================================================================

describe("createPrng edge cases", () => {
    describe("when seed is 0", () => {
        let result: number;

        beforeEach(() => {
            // mulberry32 adds 0x6d2b79f5 before first use, so seed=0 is valid
            result = createPrng(0)();
        });

        it("should return a float in [0, 1)", () => {
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(1);
        });
    });

    describe("when seed is Number.MAX_SAFE_INTEGER", () => {
        let result: number;

        beforeEach(() => {
            result = createPrng(Number.MAX_SAFE_INTEGER)();
        });

        it("should return a float in [0, 1)", () => {
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(1);
        });
    });
});

describe("randomInt edge cases", () => {
    describe("when max is 1", () => {
        let result: number;

        beforeEach(() => {
            // Any PRNG value in [0, 1) * 1 → floor is always 0 — only valid index
            result = randomInt(() => 0.9999, 1);
        });

        it("should always return 0", () => {
            expect(result).toBe(0);
        });
    });
});

// =============================================================================
// extractInputs edge cases
// =============================================================================

describe("extractInputs edge cases", () => {
    describe("when FSM has only a single state", () => {
        let result: string[];

        beforeEach(() => {
            const fsm = createFsm({
                id: "solo",
                initialState: "only",
                context: {},
                states: {
                    only: { ping() {} },
                },
            });
            result = extractInputs(fsm);
        });

        it("should extract the single input", () => {
            expect(result).toEqual(["ping"]);
        });
    });

    describe("when FSM state has only reserved keys", () => {
        let result: string[];

        beforeEach(() => {
            // Pass a raw states object containing only reserved keys to isolate the
            // RESERVED_KEYS filter logic without the type system forcing a real input name in
            result = extractInputs({
                states: {
                    waiting: { _onEnter() {}, _onExit() {}, _child: {}, "*": () => {} },
                },
            });
        });

        it("should return an empty array", () => {
            expect(result).toEqual([]);
        });
    });
});

// =============================================================================
// walkAll boundary conditions
// =============================================================================

describe("walkAll boundary conditions", () => {
    describe("when walks is 1 (minimum)", () => {
        let result: any;

        beforeEach(() => {
            result = walkAll(() => makeAlwaysValid(), {
                walks: 1,
                maxSteps: 5,
                seed: 123,
                invariant: () => {},
            });
        });

        it("should complete exactly 1 walk", () => {
            expect(result.walksCompleted).toBe(1);
        });
    });

    describe("when maxSteps is 1 (minimum)", () => {
        let invariantCallCount: number;

        beforeEach(() => {
            invariantCallCount = 0;
            // toggle always transitions, so 1 step = 1 invariant call
            walkAll(() => makeAlwaysValid(), {
                walks: 1,
                maxSteps: 1,
                seed: 1,
                include: ["toggle"],
                invariant: () => {
                    invariantCallCount++;
                },
            });
        });

        it("should call invariant exactly once", () => {
            expect(invariantCallCount).toBe(1);
        });
    });

    describe("when invariant throws an Error", () => {
        let thrownError: unknown;

        beforeEach(() => {
            thrownError = undefined;
            try {
                walkAll(() => makeAlwaysValid(), {
                    walks: 1,
                    maxSteps: 5,
                    seed: 1,
                    include: ["toggle"],
                    invariant: () => {
                        throw new Error("E_INVARIANT_DETONATED");
                    },
                });
            } catch (err) {
                thrownError = err;
            }
        });

        it("should wrap it in a WalkFailureError", () => {
            expect(thrownError).toBeInstanceOf(WalkFailureError);
        });

        it("should include the cause message in the WalkFailureError message", () => {
            expect((thrownError as WalkFailureError).message).toContain("E_INVARIANT_DETONATED");
        });
    });

    describe("when a second transition fires after violation is already set", () => {
        let invariantCallCount: number;

        beforeEach(() => {
            invariantCallCount = 0;
            // FSM with _onEnter bounce: entering "middle" immediately bounces to "end"
            // This causes two transitioned events for one handle() call.
            // The second transitioned handler invocation must hit the `violation !== null`
            // early return if violation was set by the first.
            const makeBounceFsm = () =>
                createFsm({
                    id: "bounce",
                    initialState: "start",
                    context: {},
                    states: {
                        start: { go: "middle" as const },
                        middle: {
                            _onEnter() {
                                return "end" as const;
                            },
                        },
                        end: {},
                    },
                });

            try {
                walkAll(() => makeBounceFsm(), {
                    walks: 1,
                    maxSteps: 3,
                    seed: 1,
                    include: ["go"],
                    invariant({ state }) {
                        invariantCallCount++;
                        // Fail on "middle" — the bounce to "end" should NOT call invariant again
                        // once violation is set (early return branch in transitioned handler)
                        if (state === "middle") {
                            return false;
                        }
                    },
                });
            } catch (error_) {
                // WalkFailureError is expected — we only care about invariantCallCount
                const _ignored: unknown = error_;
            }
        });

        it("should not call invariant again after violation is set", () => {
            // The bounce from middle → end fires a second transitioned event,
            // but the early return prevents a second invariant call
            expect(invariantCallCount).toBe(1);
        });
    });

    describe("when BehavioralFsm is used without providing a client factory", () => {
        let result: any;

        beforeEach(() => {
            // Omitting `client` hits the `config.client ? config.client() : ({} as TClient)` else branch
            result = walkAll(() => makeBehavioralLight(), {
                walks: 2,
                maxSteps: 4,
                seed: 99,
                invariant: () => {},
            });
        });

        it("should complete all walks using the default empty client", () => {
            expect(result.walksCompleted).toBe(2);
        });
    });
});

// =============================================================================
// _onEnter bounce — invariant fires for each intermediate transition
// =============================================================================

describe("walkAll with _onEnter bounce chains", () => {
    describe("when _onEnter causes a bounce to a third state", () => {
        let capturedStates: string[];

        beforeEach(() => {
            capturedStates = [];
            // start → go → middle (_onEnter bounces to end)
            // Expected transitions: start→middle (fires invariant), middle→end (fires invariant)
            const makeBouncer = () =>
                createFsm({
                    id: "bouncer",
                    initialState: "start",
                    context: {},
                    states: {
                        start: { go: "middle" as const },
                        middle: {
                            _onEnter() {
                                return "end" as const;
                            },
                        },
                        end: {},
                    },
                });

            walkAll(() => makeBouncer(), {
                walks: 1,
                maxSteps: 1,
                seed: 1,
                include: ["go"],
                invariant({ state }) {
                    capturedStates.push(state);
                },
            });
        });

        it("should fire invariant for each transition in the bounce chain", () => {
            // Both middle and end should appear — invariant fires twice for one handle() call
            expect(capturedStates).toContain("middle");
            expect(capturedStates).toContain("end");
        });
    });
});

// =============================================================================
// Concurrent walkAll calls — factory isolation
// =============================================================================

describe("walkAll concurrent call isolation", () => {
    describe("when two walkAll calls run with the same seed", () => {
        let sequenceA: string[], sequenceB: string[];

        beforeEach(() => {
            sequenceA = [];
            sequenceB = [];

            walkAll(() => makeTrafficLight(), {
                walks: 2,
                maxSteps: 5,
                seed: 314159,
                invariant({ input }) {
                    sequenceA.push(input);
                },
            });

            walkAll(() => makeTrafficLight(), {
                walks: 2,
                maxSteps: 5,
                seed: 314159,
                invariant({ input }) {
                    sequenceB.push(input);
                },
            });
        });

        it("should produce identical input sequences", () => {
            expect(sequenceA).toEqual(sequenceB);
        });
    });
});

// =============================================================================
// BehavioralFsm — complex client factory objects
// =============================================================================

describe("walkAll with BehavioralFsm and complex client factory", () => {
    describe("when client factory returns an object with existing properties", () => {
        let result: any, capturedCtxTypes: string[];

        beforeEach(() => {
            capturedCtxTypes = [];
            result = walkAll(() => makeBehavioralLight(), {
                walks: 2,
                maxSteps: 3,
                seed: 1701,
                client: () => ({ userId: "E_USER_KIRK", sessionStart: Date.now(), flags: [] }),
                invariant({ ctx }) {
                    // Verify the client carries its initial properties through the walk
                    capturedCtxTypes.push(typeof (ctx as any).userId);
                },
            });
        });

        it("should complete all walks", () => {
            expect(result.walksCompleted).toBe(2);
        });

        it("should pass the client object as ctx to the invariant", () => {
            expect(capturedCtxTypes.every(t => t === "string")).toBe(true);
        });
    });
});

// =============================================================================
// Task 6: Import from machina-test package entry point
// =============================================================================

describe("walkAll export from machina-test", () => {
    describe("when imported from the package entry point", () => {
        let importedWalkAll: typeof walkAll;

        beforeEach(async () => {
            // Dynamic import ensures we test the actual package export path
            const mod = await import("./index");
            importedWalkAll = (mod as any).walkAll;
        });

        it("should export walkAll as a function", () => {
            expect(typeof importedWalkAll).toBe("function");
        });

        it("should be callable and return a result", () => {
            const result = importedWalkAll(() => makeAlwaysValid(), {
                walks: 1,
                maxSteps: 2,
                invariant: () => {},
            });
            expect(result.walksCompleted).toBe(1);
        });
    });
});
