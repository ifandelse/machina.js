// =============================================================================
// Account Transfer — walkAll examples
//
// walkAll fills the gap that static matchers can't: it runs the FSM with
// randomized inputs and checks a user-supplied invariant after every
// transition. If the invariant fails, you get a WalkFailureError with the
// seed, input sequence, and state snapshot — enough to replay the exact walk
// that broke.
//
// Three examples, in order:
//   1. Minimal walkAll — factory + invariant, nothing else
//   2. Payload generators — supply meaningful payloads for specific inputs
//   3. Seed replay — reproduce a failure deterministically
// =============================================================================

import { walkAll, WalkFailureError } from "machina-test";
import { createAccountTransfer } from "./account-transfer";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Minimal walkAll
//
// The simplest possible walkAll call: a factory that returns a fresh FSM and
// an invariant that asserts a runtime property. walkAll handles input
// extraction, randomized selection, and event subscription automatically.
// ─────────────────────────────────────────────────────────────────────────────

describe("walkAll — minimal usage", () => {
    it("balance never goes negative across 200 random walks", () => {
        const result = walkAll(
            // Factory: each walk gets a fresh FSM with a $1000 starting balance
            () => createAccountTransfer(1000),
            {
                walks: 200,
                maxSteps: 20,
                seed: 42,
                invariant({ ctx }) {
                    const { balance } = ctx as { balance: number };
                    if (balance < 0) {
                        throw new Error(`balance went negative: ${balance}`);
                    }
                },
            }
        );

        // On success, walkAll returns the seed and walk count.
        // Log the seed — if this test ever breaks, paste it into the
        // seed field to get the exact same input sequence.
        expect(result.walksCompleted).toBe(200);
        expect(result.seed).toBe(42);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Payload generators
//
// Without generators, walkAll fires inputs with no payload — which means
// the "begin" handler always gets amount=0. That's boring. The `inputs`
// config lets you supply a generator per input name so randomized payloads
// exercise the real code paths.
// ─────────────────────────────────────────────────────────────────────────────

describe("walkAll — payload generators", () => {
    it("survives random transfer amounts without the balance going negative", () => {
        const result = walkAll(() => createAccountTransfer(500), {
            walks: 300,
            maxSteps: 30,
            seed: 7,
            // "begin" gets a random transfer amount between 0 and 200.
            // "reset" doesn't need a payload — omit it.
            inputs: {
                begin: () => Math.floor(Math.random() * 200),
            },
            invariant({ ctx }) {
                const { balance } = ctx as { balance: number };
                if (balance < 0) {
                    throw new Error(`balance went negative: ${balance}`);
                }
            },
        });

        expect(result.walksCompleted).toBe(300);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Seed replay
//
// The killer feature: when a walk fails, WalkFailureError carries the seed
// that produced the failing input sequence. Pass that seed back to walkAll
// and you get the exact same walk — same inputs, same order, same failure.
//
// This test deliberately introduces a bug (no overdraft guard) to show
// how seed replay works.
// ─────────────────────────────────────────────────────────────────────────────

describe("walkAll — seed replay on failure", () => {
    // A buggy factory: the guard in validating._onEnter is bypassed by
    // going straight to transferring. This WILL overdraw eventually.
    const createBuggyTransfer = () => {
        const fsm = createAccountTransfer(100);
        // Monkey-patch: skip the guard, always proceed to transferring.
        // In real code this would be a missing conditional in the handler.
        (fsm.states as any).validating._onEnter = () => {
            return "transferring";
        };
        return fsm;
    };

    it("captures the failure seed and replays the same walk", () => {
        // Payload generators must be deterministic for replay to work — the
        // seed controls which INPUT is picked, not what generators return.
        // Use a fixed amount that always exceeds the $100 starting balance.
        const makeConfig = (seed: number) => ({
            walks: 100,
            maxSteps: 20,
            seed,
            inputs: {
                begin: () => 150,
            },
            invariant({ ctx }: { ctx: unknown }) {
                const { balance } = ctx as { balance: number };
                if (balance < 0) {
                    throw new Error(`balance went negative: ${balance}`);
                }
            },
        });

        let firstError: WalkFailureError | undefined;

        // Run 1: let walkAll find the bug
        try {
            walkAll(createBuggyTransfer, makeConfig(1));
        } catch (err) {
            expect(err).toBeInstanceOf(WalkFailureError);
            firstError = err as WalkFailureError;
        }

        // The buggy FSM should have blown up
        expect(firstError).toBeDefined();

        // Run 2: replay with the captured seed — same failure, same step
        let replayError: WalkFailureError | undefined;
        try {
            walkAll(createBuggyTransfer, makeConfig(firstError!.seed));
        } catch (err) {
            replayError = err as WalkFailureError;
        }

        expect(replayError).toBeDefined();
        expect(replayError!.step).toBe(firstError!.step);
        expect(replayError!.state).toBe(firstError!.state);
        // Same seed → same input names in the same order
        expect(replayError!.inputSequence.map(r => r.input)).toEqual(
            firstError!.inputSequence.map(r => r.input)
        );
    });
});
