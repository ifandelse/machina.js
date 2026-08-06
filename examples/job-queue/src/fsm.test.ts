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
    // dehydrate() / rehydrate(snapshot) — the snapshot round trip this example
    // now demonstrates (main.ts's persist/restore path). The `queued.pause`
    // handler defers until "processing" specifically to give these tests (and
    // the real localStorage round trip) a pending deferred input to preserve —
    // something a bare state string can't carry.
    // =========================================================================

    describe("dehydrate()/rehydrate(snapshot) round trip", () => {
        describe("when a queued job has a pending pre-emptive pause", () => {
            let job: any;
            let snapshot: any;

            beforeEach(() => {
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "pause"); // deferred until "processing" — stays queued
                snapshot = fsm.dehydrate(job);
            });

            it("should still report the queued state", () => {
                expect(fsm.currentState(job)).toBe("queued");
            });

            it("should capture the deferred pause targeting processing", () => {
                expect(snapshot).toEqual({
                    state: "queued",
                    deferred: [{ inputName: "pause", args: [], untilState: "processing" }],
                });
            });
        });

        describe("when a snapshot with a pending deferred pause is rehydrated onto a new client and started", () => {
            let originalJob: any;
            let restoredJob: any;

            beforeEach(() => {
                originalJob = makeJob();
                fsm.handle(originalJob, "initialize");
                fsm.handle(originalJob, "pause"); // deferred until "processing"

                // Round-trip through JSON, exactly like main.ts's localStorage
                // write/read — proves the snapshot is plain, serializable data,
                // not a live reference into the original job's tracking.
                const snapshot = JSON.parse(JSON.stringify(fsm.dehydrate(originalJob)));

                restoredJob = makeJob({ id: 2, name: "Restored Job" });
                fsm.rehydrate(restoredJob, snapshot);
                fsm.handle(restoredJob, "start");
            });

            it("should replay the deferred pause upon entering processing, landing in paused", () => {
                expect(fsm.currentState(restoredJob)).toBe("paused");
            });

            it("should not leave a tick timer running", () => {
                expect(restoredJob.timer).toBeNull();
            });

            it("should leave the original job's own state untouched", () => {
                expect(fsm.currentState(originalJob)).toBe("queued");
            });
        });
    });

    // =========================================================================
    // rehydrate(snapshot) — pre-migration localStorage compatibility
    //
    // STORAGE_KEY was not bumped when PersistedJob switched from a bare
    // `state` string to a `snapshot` object (config.ts), so a returning
    // visitor's existing localStorage entry has no `snapshot` field at all —
    // `persisted.snapshot` reads as `undefined`. This pins that main.ts's
    // restoreFromStorage() try/catch (main.ts:143-185) actually catches this:
    // rehydrate() throws, the job is never registered, and the caller's catch
    // block is what wipes storage and shows the "starting fresh" warning. See
    // review-report-persistence-follow-ups.md Should-Fix #1 — this currently
    // works because planSnapshotWrites() crashes destructuring `undefined`,
    // not because of any deliberate validation, so this test exists to catch
    // a future "helpful" guard silently changing that failure mode.
    // =========================================================================

    describe("rehydrate(snapshot) — pre-migration localStorage compatibility", () => {
        describe("when a persisted job predates the snapshot migration and has no snapshot field", () => {
            let job: any;
            let thrownError: Error | null;

            beforeEach(() => {
                job = makeJob();
                thrownError = null;

                try {
                    fsm.rehydrate(job, undefined as any);
                } catch (err) {
                    thrownError = err as Error;
                }
            });

            it("should throw rather than silently leaving the job in a bad state", () => {
                expect(thrownError).toBeInstanceOf(TypeError);
            });

            it("should leave the job unregistered so the caller's catch block can recover", () => {
                expect(fsm.currentState(job)).toBeUndefined();
            });
        });
    });

    // =========================================================================
    // dehydrate()/rehydrate(snapshot) round trip through every remaining state
    //
    // The queued+deferred-pause case above is the only one the original round
    // trip test covered. main.ts now uses the snapshot form exclusively for
    // EVERY job regardless of state, so each remaining state gets its own
    // round trip here, restoring onto a brand-new client object the same way
    // main.ts's restoreFromStorage() does.
    // =========================================================================

    describe("dehydrate()/rehydrate(snapshot) round trip through every remaining state", () => {
        describe("when a job snapshotted while processing is restored onto a new client and resumed", () => {
            let restoredJob: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                const originalJob = makeJob({ currentStep: 2 });
                fsm.handle(originalJob, "initialize");
                fsm.handle(originalJob, "start");

                const snapshot = JSON.parse(JSON.stringify(fsm.dehydrate(originalJob)));

                restoredJob = makeJob({ id: 2, name: "Restored Job", currentStep: 2 });
                fsm.rehydrate(restoredJob, snapshot);
                fsm.handle(restoredJob, "resume");
            });

            it("should restore the job into processing", () => {
                expect(fsm.currentState(restoredJob)).toBe("processing");
            });

            it("should restart the tick timer", () => {
                expect(restoredJob.timer).not.toBeNull();
            });

            it("should keep advancing currentStep from where the snapshot left off", () => {
                jest.advanceTimersByTime(STEP_DURATION_MS);
                expect(restoredJob.currentStep).toBe(3);
            });
        });

        describe("when a job snapshotted while paused is restored onto a new client", () => {
            let restoredJob: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                const originalJob = makeJob();
                fsm.handle(originalJob, "initialize");
                fsm.handle(originalJob, "start");
                fsm.handle(originalJob, "pause");

                const snapshot = JSON.parse(JSON.stringify(fsm.dehydrate(originalJob)));

                restoredJob = makeJob({ id: 2, name: "Restored Job" });
                fsm.rehydrate(restoredJob, snapshot);
            });

            it("should restore the job into paused", () => {
                expect(fsm.currentState(restoredJob)).toBe("paused");
            });

            it("should not start a tick timer", () => {
                expect(restoredJob.timer).toBeNull();
            });
        });

        describe("when a job snapshotted while failed is restored onto a new client and retried", () => {
            let restoredJob: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0); // force failure
                const originalJob = makeJob({ currentStep: 3 });
                fsm.handle(originalJob, "initialize");
                fsm.handle(originalJob, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS); // processing -> failed

                const snapshot = JSON.parse(JSON.stringify(fsm.dehydrate(originalJob)));

                restoredJob = makeJob({ id: 2, name: "Restored Job", currentStep: 3 });
                fsm.rehydrate(restoredJob, snapshot);
                fsm.handle(restoredJob, "retry");
            });

            it("should reset currentStep to 0", () => {
                expect(restoredJob.currentStep).toBe(0);
            });

            it("should transition to processing", () => {
                expect(fsm.currentState(restoredJob)).toBe("processing");
            });
        });

        describe("when a job snapshotted while completed is restored onto a new client", () => {
            let restoredJob: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                const originalJob = makeJob({ currentStep: TOTAL_STEPS - 1 });
                fsm.handle(originalJob, "initialize");
                fsm.handle(originalJob, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS); // processing -> completed

                const snapshot = JSON.parse(JSON.stringify(fsm.dehydrate(originalJob)));

                restoredJob = makeJob({ id: 2, name: "Restored Job", currentStep: TOTAL_STEPS });
                fsm.rehydrate(restoredJob, snapshot);
            });

            it("should restore the job into completed", () => {
                expect(fsm.currentState(restoredJob)).toBe("completed");
            });

            it("should not have a tick timer running", () => {
                expect(restoredJob.timer).toBeNull();
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

    // =========================================================================
    // rehydrate() — all remaining persisted states
    // =========================================================================

    describe("rehydrate() into paused state", () => {
        describe("when a client is rehydrated into paused", () => {
            let job: any;
            let transitionedEvents: any[];

            beforeEach(() => {
                job = makeJob();
                transitionedEvents = [];
                fsm.on("transitioned", (data: any) => transitionedEvents.push(data));
                fsm.rehydrate(job, "paused");
            });

            it("should place client in paused state", () => {
                expect(fsm.currentState(job)).toBe("paused");
            });

            it("should not emit transitioned events", () => {
                expect(transitionedEvents).toHaveLength(0);
            });

            it("should not start a timer", () => {
                expect(job.timer).toBeNull();
            });
        });

        describe("when resume is dispatched after rehydrating into paused", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.rehydrate(job, "paused");
                fsm.handle(job, "resume");
            });

            it("should transition to processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should start the tick timer via _onEnter", () => {
                expect(job.timer).not.toBeNull();
            });
        });
    });

    describe("rehydrate() into failed state", () => {
        describe("when a client is rehydrated into failed", () => {
            let job: any;
            let handlingEvents: any[];

            beforeEach(() => {
                job = makeJob({ currentStep: 3 });
                handlingEvents = [];
                fsm.on("handling", (data: any) => handlingEvents.push(data));
                fsm.rehydrate(job, "failed");
            });

            it("should place client in failed state", () => {
                expect(fsm.currentState(job)).toBe("failed");
            });

            it("should not emit handling events", () => {
                expect(handlingEvents).toHaveLength(0);
            });

            it("should not modify currentStep", () => {
                expect(job.currentStep).toBe(3);
            });
        });

        describe("when retry is dispatched after rehydrating into failed", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob({ currentStep: 3 });
                fsm.rehydrate(job, "failed");
                fsm.handle(job, "retry");
            });

            it("should reset currentStep to 0", () => {
                expect(job.currentStep).toBe(0);
            });

            it("should transition to processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });
        });
    });

    // =========================================================================
    // startTicker guard — timer already running when startTicker is called
    // =========================================================================

    describe("startTicker guard — existing timer cleared before restart", () => {
        describe("when resume is dispatched while already in processing with an active timer", () => {
            let job: any;
            let timerBeforeResume: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                // Timer is running. Capture the handle to verify it gets replaced.
                timerBeforeResume = job.timer;
                fsm.handle(job, "resume");
            });

            it("should remain in processing", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should replace the old timer with a new one", () => {
                expect(job.timer).not.toBeNull();
                expect(job.timer).not.toBe(timerBeforeResume);
            });
        });
    });

    // =========================================================================
    // Boundary: job with currentStep already at totalSteps when tick fires
    // =========================================================================

    describe("tick handler — currentStep already at totalSteps when tick fires", () => {
        describe("when a job starts with currentStep equal to totalSteps", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob({ currentStep: TOTAL_STEPS });
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");
                jest.advanceTimersByTime(STEP_DURATION_MS);
            });

            it("should complete on the first tick", () => {
                expect(fsm.currentState(job)).toBe("completed");
            });

            it("should clear the timer on completion", () => {
                expect(job.timer).toBeNull();
            });
        });
    });

    // =========================================================================
    // Multiple jobs — independent state tracking via WeakMap
    // =========================================================================

    describe("multiple jobs — independent state tracking", () => {
        describe("when two jobs are processed concurrently and one fails", () => {
            let jobA: any;
            let jobB: any;
            let mockRandom: any;

            beforeEach(() => {
                mockRandom = jest.spyOn(Math, "random");
                jobA = makeJob({ id: 1, name: "Ghostbusters Job" });
                jobB = makeJob({ id: 2, name: "Ferris Bueller Job" });

                // Both start in processing
                fsm.handle(jobA, "initialize");
                fsm.handle(jobB, "initialize");
                fsm.handle(jobA, "start");
                fsm.handle(jobB, "start");

                // On next tick, jobA fails, jobB succeeds
                // We need to control which job's tick calls get which random value.
                // The tick handler calls Math.random() once per tick, so we alternate.
                let callCount = 0;
                mockRandom.mockImplementation(() => {
                    callCount++;
                    // jobA ticks first (it was started first), jobB ticks second
                    return callCount % 2 === 1 ? 0 : 0.9;
                });

                jest.advanceTimersByTime(STEP_DURATION_MS);
            });

            it("should fail jobA", () => {
                expect(fsm.currentState(jobA)).toBe("failed");
            });

            it("should keep jobB in processing", () => {
                expect(fsm.currentState(jobB)).toBe("processing");
            });

            it("should clear jobA timer and keep jobB timer active", () => {
                expect(jobA.timer).toBeNull();
                expect(jobB.timer).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // Multiple rapid pause/resume cycles
    // =========================================================================

    describe("multiple rapid pause/resume cycles", () => {
        describe("when a job is paused and resumed three times in succession", () => {
            let job: any;

            beforeEach(() => {
                jest.spyOn(Math, "random").mockReturnValue(0.9);
                job = makeJob();
                fsm.handle(job, "initialize");
                fsm.handle(job, "start");

                fsm.handle(job, "pause");
                fsm.handle(job, "resume");
                fsm.handle(job, "pause");
                fsm.handle(job, "resume");
                fsm.handle(job, "pause");
                fsm.handle(job, "resume");
            });

            it("should end up in processing after the final resume", () => {
                expect(fsm.currentState(job)).toBe("processing");
            });

            it("should have an active timer after the final resume", () => {
                expect(job.timer).not.toBeNull();
            });

            it("should still advance currentStep when ticks fire", () => {
                jest.advanceTimersByTime(STEP_DURATION_MS);
                expect(job.currentStep).toBe(1);
            });
        });
    });
});
