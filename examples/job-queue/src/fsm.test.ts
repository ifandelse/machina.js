/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — Job Queue FSM tests
//
// Verifies the BehavioralFsm's state transitions, timer lifecycle, and the
// rehydrate() + resume pattern that is the core teaching moment of this example.
//
// Tests use Jest fake timers to control tick scheduling deterministically.
// Each test gets a fresh FSM instance via createJobQueueFsm() for isolation.
// =============================================================================

describe("Job Queue FSM (fsm.ts)", () => {
    let createJobQueueFsm: any;
    let fsm: any;
    let STEP_DURATION_MS: number;
    let TOTAL_STEPS: number;
    let FAILURE_CHANCE: number;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        const configMod = await import("./config");
        STEP_DURATION_MS = configMod.STEP_DURATION_MS;
        TOTAL_STEPS = configMod.TOTAL_STEPS;
        FAILURE_CHANCE = configMod.FAILURE_CHANCE;

        const mod = await import("./fsm");
        createJobQueueFsm = mod.createJobQueueFsm;
        fsm = createJobQueueFsm();
    });

    afterEach(() => {
        fsm.dispose();
        jest.useRealTimers();
    });

    // Helper: create a minimal JobClient for tests
    const makeJob = (overrides: Partial<any> = {}): any => ({
        id: 1,
        name: "Test Job",
        currentStep: 0,
        totalSteps: TOTAL_STEPS,
        timer: null,
        createdAt: new Date().toISOString(),
        restoredFromStorage: false,
        ...overrides,
    });

    // =========================================================================
    // Initial state
    // =========================================================================

    describe("queued state", () => {
        describe("when a job is initialized", () => {
            let job: any;

            beforeEach(() => {
                job = makeJob();
                fsm.handle(job, "initialize");
            });

            it("should place client in queued state", () => {
                expect(fsm.currentState(job)).toBe("queued");
            });
        });

        describe("when start is dispatched from queued", () => {
            let job: any;
            let transitionedEvents: any[];

            beforeEach(() => {
                job = makeJob();
                transitionedEvents = [];
                fsm.on("transitioned", (data: any) => transitionedEvents.push(data));
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
            });

            it("should transition to processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should emit a transitioned event", () => {
                expect(transitionedEvents.length).toBeGreaterThan(0);
            });
        });
    });

    // =========================================================================
    // processing → completed (happy path)
    // =========================================================================

    describe("processing state — happy path to completion", () => {
        describe("when ticks advance currentStep to totalSteps", () => {
            let job: any;

            beforeEach(() => {
                // Return 0.9 so random() >= FAILURE_CHANCE (0.15) — no random failure
                jest.spyOn(Math, "random").mockReturnValue(0.9);

                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");

                // Advance through all steps
                for (let i = 0; i < TOTAL_STEPS; i++) {
                    jest.advanceTimersByTime(STEP_DURATION_MS);
                }
            });

            it("should reach completed state", () => {
                expect(fsm.currentState(job)).toBe("completed");
            });

            it("should have currentStep equal to totalSteps", () => {
                expect(job.currentStep).toBe(TOTAL_STEPS);
            });

            it("should clear the timer on completion", () => {
                expect(job.timer).toBeNull();
            });
        });
    });

    // =========================================================================
    // processing → paused → processing
    // =========================================================================

    describe("processing state — pause and resume", () => {
        describe("when pause is dispatched from processing", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                fsm.handle(job, "pause");
            });

            it("should transition to paused", () => {
                expect(fsm.currentState(job)).toBe("paused");
            });

            it("should clear the timer when paused", () => {
                expect(job.timer).toBeNull();
            });
        });

        describe("when resume is dispatched from paused", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                fsm.handle(job, "pause");
                fsm.handle(job, "resume");
            });

            it("should transition back to processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should restart the tick timer", () => {
                expect(job.timer).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // processing → failed → processing (retry)
    // =========================================================================

    describe("failed state — retry path", () => {
        describe("when a tick causes a random failure", () => {
            let job: any;

            beforeEach(() => {
                // Return 0 so random() < FAILURE_CHANCE (0.15) — forces a failure
                jest.spyOn(Math, "random").mockReturnValue(0);

                job = makeJob({ currentStep: 2 });
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS);
            });

            it("should transition to failed", () => {
                expect(fsm.currentState(job)).toBe("failed");
            });

            it("should clear the timer on failure", () => {
                expect(job.timer).toBeNull();
            });
        });

        describe("when retry is dispatched from failed", () => {
            let job: any;

            beforeEach(() => {
                // Return 0 to force failure (0 < FAILURE_CHANCE = 0.15)
                const mockRandom = jest.spyOn(Math, "random");
                mockRandom.mockReturnValue(0); // fail on first tick

                job = makeJob({ currentStep: 2 });
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS);

                // Return 0.9 so subsequent ticks don't fail (0.9 >= FAILURE_CHANCE)
                mockRandom.mockReturnValue(0.9);
                fsm.handle(job, "retry");
            });

            it("should reset currentStep to 0", () => {
                expect(job.currentStep).toBe(0);
            });

            it("should transition to processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should restart the tick timer", () => {
                expect(job.timer).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // resume in processing state (post-rehydrate path)
    // =========================================================================

    describe("processing state — resume does not transition", () => {
        describe("when resume is dispatched while already in processing", () => {
            let job: any;
            let transitionedEvents: any[];

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                transitionedEvents = [];

                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");

                // Capture transitions AFTER the start transition
                transitionedEvents = [];
                fsm.on("transitioned", (data: any) => transitionedEvents.push(data));

                fsm.handle(job, "resume");
            });

            it("should stay in processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should not emit any transitioned event", () => {
                expect(transitionedEvents).toHaveLength(0);
            });

            it("should have an active timer", () => {
                expect(job.timer).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // timer cleared on _onExit from processing
    // =========================================================================

    describe("processing state — timer cleanup on exit", () => {
        describe("when the job pauses (exiting processing)", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");

                // Confirm timer is running
                expect(job.timer).not.toBeNull();

                fsm.handle(job, "pause");
            });

            it("should clear the timer via _onExit", () => {
                expect(job.timer).toBeNull();
            });
        });
    });

    // =========================================================================
    // rehydrate() — silent state restoration
    // =========================================================================

    describe("rehydrate()", () => {
        describe("when rehydrating a client into queued state", () => {
            let job: any;
            let handlingEvents: any[];

            beforeEach(() => {
                job = makeJob();
                handlingEvents = [];
                fsm.on("handling", (data: any) => handlingEvents.push(data));

                fsm.rehydrate(job, "queued");
            });

            it("should place client in queued state", () => {
                expect(fsm.currentState(job)).toBe("queued");
            });

            it("should not emit any handling events", () => {
                expect(handlingEvents).toHaveLength(0);
            });
        });

        describe("when rehydrating a client into processing state", () => {
            let job: any;
            let transitionedEvents: any[];

            beforeEach(() => {
                job = makeJob();
                transitionedEvents = [];
                fsm.on("transitioned", (data: any) => transitionedEvents.push(data));

                fsm.rehydrate(job, "processing");
            });

            it("should place client in processing state", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should not fire transitioned events", () => {
                expect(transitionedEvents).toHaveLength(0);
            });

            it("should not start the timer (_onEnter does not fire)", () => {
                // Timer should be null because rehydrate() is silent
                expect(job.timer).toBeNull();
            });
        });

        describe("when resume is dispatched after rehydrating into processing", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.rehydrate(job, "processing");
                fsm.handle(job, "resume");
            });

            it("should stay in processing state", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should start the tick timer", () => {
                expect(job.timer).not.toBeNull();
            });

            it("should advance currentStep when ticks fire", () => {
                jest.advanceTimersByTime(STEP_DURATION_MS);
                expect(job.currentStep).toBe(1);
            });
        });

        describe("when rehydrating with an unknown state name", () => {
            let job: any;
            let thrownError: Error | null;

            beforeEach(() => {
                job = makeJob();
                thrownError = null;

                try {
                    fsm.rehydrate(job, "nonexistent-state");
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            it("should throw an error", () => {
                expect(thrownError).not.toBeNull();
            });

            it("should include the unknown state name in the error message", () => {
                expect(thrownError?.message).toContain("nonexistent-state");
            });
        });
    });

    // =========================================================================
    // FAILURE_CHANCE boundary — verify it's actually used
    // =========================================================================

    describe("failure chance", () => {
        describe("when Math.random returns exactly FAILURE_CHANCE (boundary case)", () => {
            let job: any;

            beforeEach(() => {
                // random() returning FAILURE_CHANCE is NOT a failure (condition: < FAILURE_CHANCE)
                jest.spyOn(Math, "random").mockReturnValue(FAILURE_CHANCE);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS);
            });

            it("should not fail when random equals FAILURE_CHANCE exactly", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });
        });
    });
});
