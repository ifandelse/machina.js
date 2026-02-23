/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — Traffic Intersection hierarchical FSM tests
//
// Uses jest fake timers to control advancement through timed states without
// actually waiting. Each test gets a fresh FSM instance via jest.resetModules()
// + dynamic import.
//
// What we're verifying:
//   - FSM starts in "ready" state, transitions to northSouthPhase on "start"
//   - Green phase advances to interruptibleGreen after GREEN_DURATION_MS
//   - pedestrianRequest during green is deferred, replayed at interruptibleGreen
//   - pedestrianRequest during interruptibleGreen shortens to yellow immediately
//   - A full autonomous cycle completes and returns to northSouthPhase.green
//   - Timer cleanup: no orphaned timers after disposal
// =============================================================================

describe("traffic intersection FSM (fsm.ts)", () => {
    let intersection: any;
    let GREEN_DURATION_MS: number,
        INTERRUPTIBLE_GREEN_DURATION_MS: number,
        YELLOW_DURATION_MS: number,
        CLEARANCE_DURATION_MS: number;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        const config = await import("./config");
        GREEN_DURATION_MS = config.GREEN_DURATION_MS;
        INTERRUPTIBLE_GREEN_DURATION_MS = config.INTERRUPTIBLE_GREEN_DURATION_MS;
        YELLOW_DURATION_MS = config.YELLOW_DURATION_MS;
        CLEARANCE_DURATION_MS = config.CLEARANCE_DURATION_MS;

        const mod = await import("./fsm");
        intersection = mod.intersection;
    });

    afterEach(() => {
        intersection.dispose();
        jest.useRealTimers();
    });

    // =========================================================================
    // Ready state (pre-start)
    // =========================================================================

    describe("when the FSM is first created (ready state)", () => {
        it("should start in ready state", () => {
            expect(intersection.compositeState()).toBe("ready");
            expect(intersection.currentState()).toBe("ready");
        });

        it("should transition to northSouthPhase.green on start input", () => {
            intersection.handle("start");
            expect(intersection.compositeState()).toBe("northSouthPhase.green");
            expect(intersection.currentState()).toBe("northSouthPhase");
        });
    });

    // =========================================================================
    // All subsequent tests operate on a started intersection.
    // The "start" input transitions ready → northSouthPhase.green.
    // =========================================================================

    describe("after the intersection is started", () => {
        beforeEach(() => {
            intersection.handle("start");
        });

        // =========================================================================
        // Green phase advances naturally after GREEN_DURATION_MS
        // =========================================================================

        describe("when GREEN_DURATION_MS elapses", () => {
            let compositeAfter: string;

            beforeEach(() => {
                jest.advanceTimersByTime(GREEN_DURATION_MS);
                compositeAfter = intersection.compositeState();
            });

            it("should transition to northSouthPhase.interruptibleGreen", () => {
                expect(compositeAfter).toBe("northSouthPhase.interruptibleGreen");
            });
        });

        // =========================================================================
        // interruptibleGreen advances to yellow after INTERRUPTIBLE_GREEN_DURATION_MS
        // =========================================================================

        describe("when GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS elapses", () => {
            let compositeAfter: string;

            beforeEach(() => {
                jest.advanceTimersByTime(GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS);
                compositeAfter = intersection.compositeState();
            });

            it("should transition to northSouthPhase.yellow", () => {
                expect(compositeAfter).toBe("northSouthPhase.yellow");
            });
        });

        // =========================================================================
        // defer() — pedestrianRequest during green deferred, replayed at interruptibleGreen
        // =========================================================================

        describe("when pedestrianRequest is sent during northSouthPhase.green", () => {
            let deferredEvents: any[];

            beforeEach(() => {
                deferredEvents = [];

                intersection.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                // Send while in green
                intersection.handle("pedestrianRequest");
            });

            it("should emit a deferred event for pedestrianRequest", () => {
                expect(deferredEvents.length).toBeGreaterThanOrEqual(1);
                expect(deferredEvents[0].inputName).toBe("pedestrianRequest");
            });

            it("should still be in northSouthPhase.green (not yet transitioned)", () => {
                expect(intersection.compositeState()).toBe("northSouthPhase.green");
            });

            describe("after GREEN_DURATION_MS elapses (child enters interruptibleGreen)", () => {
                let compositeAfterGreen: string;

                beforeEach(() => {
                    jest.advanceTimersByTime(GREEN_DURATION_MS);
                    // The deferred pedestrianRequest is replayed at interruptibleGreen entry,
                    // causing immediate transition to yellow
                    compositeAfterGreen = intersection.compositeState();
                });

                it("should have advanced past interruptibleGreen to yellow (deferred request replayed)", () => {
                    // The deferred pedestrianRequest shortens interruptibleGreen to yellow
                    expect(compositeAfterGreen).toBe("northSouthPhase.yellow");
                });
            });
        });

        // =========================================================================
        // pedestrianRequest during interruptibleGreen shortens phase immediately
        // =========================================================================

        describe("when pedestrianRequest is sent during northSouthPhase.interruptibleGreen", () => {
            let compositeAfter: string;

            beforeEach(() => {
                // Advance past green phase
                jest.advanceTimersByTime(GREEN_DURATION_MS);
                // Now in interruptibleGreen, send the request
                intersection.handle("pedestrianRequest");
                compositeAfter = intersection.compositeState();
            });

            it("should immediately transition to northSouthPhase.yellow", () => {
                expect(compositeAfter).toBe("northSouthPhase.yellow");
            });
        });

        // =========================================================================
        // Full autonomous cycle — parent transitions through all phases
        // =========================================================================

        describe("when a full cycle elapses (NS green → interruptibleGreen → yellow → red → clearance → EW green → ...)", () => {
            let compositeAtEwGreen: string, compositeAfterFullCycle: string;

            beforeEach(() => {
                // NS phase: green → interruptibleGreen → yellow → red
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                // red._onEnter fires setTimeout(0) → phaseComplete → parent transitions to clearanceNS.
                // runOnlyPendingTimers fires just the enqueued timers without cascading into new ones.
                jest.runOnlyPendingTimers();

                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                compositeAtEwGreen = intersection.compositeState();

                // EW phase: green → interruptibleGreen → yellow → red
                jest.advanceTimersByTime(
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS
                );
                jest.runOnlyPendingTimers();
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                compositeAfterFullCycle = intersection.compositeState();
            });

            it("should enter eastWestPhase.green after NS clearance", () => {
                expect(compositeAtEwGreen).toBe("eastWestPhase.green");
            });

            it("should return to northSouthPhase.green after a full cycle", () => {
                expect(compositeAfterFullCycle).toBe("northSouthPhase.green");
            });
        });

        // =========================================================================
        // clearanceNS — all-red during N/S → E/W transition
        // =========================================================================

        describe("when northSouthPhase completes and enters clearanceNS", () => {
            let compositeAtClearance: string;

            beforeEach(() => {
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                // runOnlyPendingTimers fires the setTimeout(0) from red._onEnter
                // (phaseComplete → parent transitions to clearanceNS) without cascading.
                jest.runOnlyPendingTimers();
                compositeAtClearance = intersection.compositeState();
            });

            it("should be in clearanceNS (all-red state)", () => {
                expect(compositeAtClearance).toBe("clearanceNS");
            });
        });

        // =========================================================================
        // No unhandled pedestrianRequest noise during clearance phases
        // =========================================================================

        describe("when pedestrianRequest is sent during clearanceNS", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                intersection.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                // Advance to clearanceNS
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                jest.runOnlyPendingTimers();

                // Send pedestrianRequest during clearance
                intersection.handle("pedestrianRequest");
            });

            it("should emit nohandler (neither parent clearance state nor child handles it)", () => {
                // clearanceNS has no _child and no pedestrianRequest handler
                expect(nohandlerEvents.length).toBeGreaterThanOrEqual(1);
                expect(nohandlerEvents[0].inputName).toBe("pedestrianRequest");
            });
        });

        // =========================================================================
        // dispose — stops handling after disposal
        // =========================================================================

        describe("when the FSM is disposed", () => {
            beforeEach(() => {
                intersection.dispose();
            });

            it("should make handle a no-op (no state change)", () => {
                intersection.handle("pedestrianRequest");
                // After dispose, compositeState may not be meaningful, but handle shouldn't throw
                expect(() => intersection.handle("pedestrianRequest")).not.toThrow();
            });
        });

        // =========================================================================
        // Hardening: dispose is fully inert (review report §7)
        // =========================================================================

        describe("when the FSM is disposed and handle is called", () => {
            let stateBefore: string, stateAfter: string;

            beforeEach(() => {
                stateBefore = intersection.compositeState();
                intersection.dispose();
                // Attempt to drive state changes via handle
                (intersection.handle as (input: string) => void)("pedestrianRequest");
                stateAfter = intersection.compositeState();
            });

            it("should not change compositeState after dispose", () => {
                expect(stateAfter).toBe(stateBefore);
            });
        });

        describe("when the FSM is disposed and a pending timer fires", () => {
            let stateAfterDispose: string, stateAfterTimer: string;

            beforeEach(() => {
                // Get deep enough into green that the green timer is queued
                // but hasn't fired yet — dispose mid-cycle.
                intersection.dispose();
                stateAfterDispose = intersection.compositeState();
                // Fire whatever timers were queued at dispose time
                jest.runOnlyPendingTimers();
                stateAfterTimer = intersection.compositeState();
            });

            it("should not change state when a queued timer fires after dispose", () => {
                // The green _onEnter timer calls fsm.handle("advance") which checks disposed.
                // State must remain frozen even after timers drain.
                expect(stateAfterTimer).toBe(stateAfterDispose);
            });
        });

        describe("when the FSM is disposed and canHandle is called", () => {
            let result: boolean;

            beforeEach(() => {
                intersection.dispose();
                result = intersection.canHandle("pedestrianRequest");
            });

            it("should return false", () => {
                expect(result).toBe(false);
            });
        });

        // =========================================================================
        // Hardening: multiple pedestrianRequests during green
        // =========================================================================

        describe("when pedestrianRequest is sent twice during northSouthPhase.green", () => {
            let deferredEvents: any[], stateAfterGreen: string;

            beforeEach(() => {
                deferredEvents = [];
                intersection.on("deferred", (data: any) => {
                    deferredEvents.push(data);
                });

                // Two presses during green — should defer twice
                intersection.handle("pedestrianRequest");
                intersection.handle("pedestrianRequest");

                // Advance past green — deferred replays happen at interruptibleGreen entry
                jest.advanceTimersByTime(GREEN_DURATION_MS);
                stateAfterGreen = intersection.compositeState();
            });

            it("should emit two deferred events", () => {
                expect(deferredEvents).toHaveLength(2);
            });

            it("should still arrive in yellow (not loop or crash from double replay)", () => {
                // The first replay triggers pedestrianRequest → yellow.
                // The second replay lands in yellow which has no pedestrianRequest handler → nohandler.
                // Either way, the FSM should be in yellow, not stuck or blown up.
                expect(stateAfterGreen).toBe("northSouthPhase.yellow");
            });
        });

        // =========================================================================
        // Hardening: pedestrianRequest during yellow → nohandler
        // =========================================================================

        describe("when pedestrianRequest is sent during northSouthPhase.yellow", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                intersection.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                // Advance into yellow
                jest.advanceTimersByTime(GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS);
                intersection.handle("pedestrianRequest");
            });

            it("should emit nohandler (yellow has no pedestrianRequest handler)", () => {
                expect(nohandlerEvents.length).toBeGreaterThanOrEqual(1);
                expect(nohandlerEvents[0].inputName).toBe("pedestrianRequest");
            });

            it("should remain in northSouthPhase.yellow", () => {
                expect(intersection.compositeState()).toBe("northSouthPhase.yellow");
            });
        });

        // =========================================================================
        // Hardening: compositeState() during clearance phases has no child suffix
        // =========================================================================

        describe("when the FSM is in clearanceNS", () => {
            let compositeState: string;

            beforeEach(() => {
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                jest.runOnlyPendingTimers();
                compositeState = intersection.compositeState();
            });

            it("should return exactly 'clearanceNS' with no child suffix", () => {
                // Clearance states have no active child — compositeState must be
                // the bare parent state name, not "clearanceNS.undefined" or similar.
                expect(compositeState).toBe("clearanceNS");
            });
        });

        describe("when the FSM is in clearanceEW", () => {
            let compositeState: string;

            beforeEach(() => {
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                // Drive NS phase to completion
                jest.advanceTimersByTime(nsChildTime);
                jest.runOnlyPendingTimers();
                // Exhaust clearanceNS
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                // Drive EW phase to completion
                jest.advanceTimersByTime(
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS
                );
                jest.runOnlyPendingTimers();
                compositeState = intersection.compositeState();
            });

            it("should return exactly 'clearanceEW' with no child suffix", () => {
                expect(compositeState).toBe("clearanceEW");
            });
        });

        // =========================================================================
        // Hardening: pedestrianRequest during clearanceEW → nohandler
        // =========================================================================

        describe("when pedestrianRequest is sent during clearanceEW", () => {
            let nohandlerEvents: any[];

            beforeEach(() => {
                nohandlerEvents = [];
                intersection.on("nohandler", (data: any) => {
                    nohandlerEvents.push(data);
                });

                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                jest.runOnlyPendingTimers();
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                jest.advanceTimersByTime(
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS
                );
                jest.runOnlyPendingTimers();

                // Now in clearanceEW — send the request
                intersection.handle("pedestrianRequest");
            });

            it("should emit nohandler (clearanceEW has no pedestrianRequest handler)", () => {
                expect(nohandlerEvents.length).toBeGreaterThanOrEqual(1);
                expect(nohandlerEvents[0].inputName).toBe("pedestrianRequest");
            });
        });

        // =========================================================================
        // Hardening: child auto-reset — NS child returns to green for second cycle
        // =========================================================================

        describe("when the FSM completes a full cycle and re-enters northSouthPhase", () => {
            let compositeAtSecondCycleStart: string;

            beforeEach(() => {
                // Complete NS phase
                const nsChildTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(nsChildTime);
                jest.runOnlyPendingTimers();
                // Complete clearanceNS
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                // Complete EW phase
                jest.advanceTimersByTime(
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS
                );
                jest.runOnlyPendingTimers();
                // Complete clearanceEW → back to northSouthPhase
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                compositeAtSecondCycleStart = intersection.compositeState();
            });

            it("should start at northSouthPhase.green (child was auto-reset)", () => {
                // If child auto-reset fails, the child would be stuck in "red" from
                // its previous cycle — compositeState would be "northSouthPhase.red".
                expect(compositeAtSecondCycleStart).toBe("northSouthPhase.green");
            });
        });

        // =========================================================================
        // Hardening: EW child auto-reset — ewPhaseCtrl starts at green
        // =========================================================================

        describe("when the FSM enters eastWestPhase for the second time", () => {
            let compositeAtSecondEwEntry: string;

            beforeEach(() => {
                // Full first cycle
                const childTime =
                    GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
                jest.advanceTimersByTime(childTime);
                jest.runOnlyPendingTimers();
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                jest.advanceTimersByTime(childTime);
                jest.runOnlyPendingTimers();
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                // Now in second NS phase — run it through to EW again
                jest.advanceTimersByTime(childTime);
                jest.runOnlyPendingTimers();
                jest.advanceTimersByTime(CLEARANCE_DURATION_MS);
                compositeAtSecondEwEntry = intersection.compositeState();
            });

            it("should start at eastWestPhase.green (EW child was auto-reset)", () => {
                expect(compositeAtSecondEwEntry).toBe("eastWestPhase.green");
            });
        });
    }); // end "after the intersection is started"

    // =========================================================================
    // Hardening: createIntersection() called twice — module-level variable stomp
    // (review report §3)
    //
    // The bug: module-level `intersectionFsm` is overwritten by the second call.
    // Clearance states in both instances close over `intersectionFsm`, so both
    // instances' clearance timers now drive only the second instance.
    // The first intersection gets stuck in clearanceNS permanently.
    //
    // This describe is intentionally at the top level so it does NOT inherit the
    // outer "after the intersection is started" beforeEach. Both instances must
    // be started from "ready" within this block.
    // =========================================================================

    describe("when createIntersection() is called a second time", () => {
        let firstIntersection: any, secondIntersection: any;
        let firstStateAfterClearance: string;

        beforeEach(async () => {
            // Use the factory function directly from the already-loaded module.
            const mod = await import("./fsm");
            firstIntersection = mod.intersection;
            secondIntersection = mod.createIntersection();

            // Both start in "ready" — kick them into northSouthPhase
            expect(firstIntersection.compositeState()).toBe("ready");
            expect(secondIntersection.compositeState()).toBe("ready");
            firstIntersection.handle("start");
            secondIntersection.handle("start");

            // Drive both intersections through NS phase into clearanceNS.
            // Both have their own child timers, so advanceTimersByTime fires both.
            const nsChildTime =
                GREEN_DURATION_MS + INTERRUPTIBLE_GREEN_DURATION_MS + YELLOW_DURATION_MS;
            jest.advanceTimersByTime(nsChildTime);
            jest.runOnlyPendingTimers(); // fires setTimeout(0) phaseComplete for both children

            // Fire the clearance timers. If the bug exists, both clearance timers
            // call intersectionFsm.handle("advance") on the SECOND instance only.
            // The first intersection should advance to eastWestPhase.green if correct,
            // or stay stuck in clearanceNS if the bug is present.
            jest.advanceTimersByTime(CLEARANCE_DURATION_MS);

            firstStateAfterClearance = firstIntersection.compositeState();
        });

        afterEach(() => {
            firstIntersection.dispose();
            secondIntersection.dispose();
        });

        it("should advance the first intersection out of clearanceNS on its own timer", () => {
            // Bug present: first intersection's clearance timer drives the SECOND instance,
            // leaving the first stuck in clearanceNS permanently.
            // Bug absent: first intersection advances to eastWestPhase.green.
            expect(firstStateAfterClearance).toBe("eastWestPhase.green");
        });

        it("should advance the second intersection independently", () => {
            // Regardless of the first intersection bug, the second instance should
            // also have advanced through its own clearance.
            expect(secondIntersection.compositeState()).toBe("eastWestPhase.green");
        });
    });
});
