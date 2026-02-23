/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// fsm.test.ts — Connectivity FSM edge case and hardening tests
//
// fsm.ts exports a module-level singleton. We use jest.resetModules() +
// dynamic import in each beforeEach to get a fresh FSM instance per test.
//
// checkHealth (from health.ts) is mocked via jest.doMock so the FSM never
// waits on real timers. setInterval and clearInterval are mocked via jest.fn()
// to keep tests fast and deterministic.
// =============================================================================

const mockCheckHealth = jest.fn();
const mockSetSimulationMode = jest.fn();
const mockSetInterval = jest.fn();
const mockClearInterval = jest.fn();

describe("connectivity FSM (fsm.ts)", () => {
    let fsm: any, MAX_CHECKS: number, initialHeartbeatCb: () => void;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        // Mock the health module before importing fsm.
        // jest.doMock (not jest.mock) works with jest.resetModules() because
        // it's not hoisted — it runs inline and applies to the next import.
        jest.doMock("./health", () => ({
            checkHealth: mockCheckHealth,
            setSimulationMode: mockSetSimulationMode,
        }));

        // Default: return a pending promise so checking._onEnter doesn't crash.
        // Individual tests override with mockResolvedValueOnce / mockRejectedValueOnce.
        mockCheckHealth.mockReturnValue(new Promise(() => {}));

        // Replace timer globals so we control interval firing
        globalThis.setInterval = mockSetInterval as any;
        globalThis.clearInterval = mockClearInterval as any;

        // Capture the heartbeat callback that online._onEnter passes to
        // setInterval during FSM creation. mockImplementationOnce ensures
        // only this first call is intercepted — subsequent setInterval
        // calls (retry timers, etc.) fall through to default jest.fn().
        mockSetInterval.mockImplementationOnce((cb: () => void) => {
            initialHeartbeatCb = cb;
            return 500;
        });

        const mod = await import("./fsm");
        fsm = mod.fsm;
        MAX_CHECKS = mod.MAX_CHECKS;
    });

    afterEach(() => {
        // Dispose the FSM to avoid timer leaks between tests
        fsm.dispose();
    });

    // =========================================================================
    // Initial state
    // =========================================================================

    describe("initial state", () => {
        describe("when the FSM is first created", () => {
            it("should start in the online state", () => {
                expect(fsm.currentState()).toBe("online");
            });

            it("should have MAX_CHECKS set to 5", () => {
                expect(MAX_CHECKS).toBe(5);
            });
        });
    });

    // =========================================================================
    // online state — connectionLost input
    // =========================================================================

    describe("online state", () => {
        describe("when connectionLost is received", () => {
            let transitionedPayloads: Array<{ fromState: string; toState: string }>;

            beforeEach(() => {
                transitionedPayloads = [];
                fsm.on("transitioned", (data: any) => {
                    transitionedPayloads.push(data);
                });
                fsm.handle("connectionLost");
            });

            it("should transition to checking (verify before going offline)", () => {
                expect(fsm.currentState()).toBe("checking");
            });

            it("should emit a transitioned event with the correct states", () => {
                expect(transitionedPayloads).toEqual(
                    expect.arrayContaining([{ fromState: "online", toState: "checking" }])
                );
            });
        });
    });

    // =========================================================================
    // online — heartbeat timer
    // =========================================================================

    describe("online heartbeat", () => {
        describe("when the FSM starts in online state", () => {
            it("should start a heartbeat timer on init", () => {
                // The FSM starts in online, _onEnter fires at module load
                expect(mockSetInterval).toHaveBeenCalledTimes(1);
                expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 15000);
            });
        });

        describe("when the heartbeat fires and the health check rejects", () => {
            beforeEach(async () => {
                mockCheckHealth.mockRejectedValueOnce(new Error("simulated failure"));
                initialHeartbeatCb();
                await Promise.resolve();
                await Promise.resolve();
            });

            it("should transition to checking to verify (not straight to offline)", () => {
                expect(fsm.currentState()).toBe("checking");
            });
        });

        describe("when the heartbeat fires and the health check returns not ok", () => {
            beforeEach(async () => {
                mockCheckHealth.mockResolvedValueOnce({ ok: false });
                initialHeartbeatCb();
                await Promise.resolve();
                await Promise.resolve();
            });

            it("should transition to checking to verify (not straight to offline)", () => {
                expect(fsm.currentState()).toBe("checking");
            });
        });

        describe("when the heartbeat fires and the health check is ok", () => {
            beforeEach(async () => {
                mockCheckHealth.mockResolvedValueOnce({ ok: true });
                initialHeartbeatCb();
                await Promise.resolve();
                await Promise.resolve();
            });

            it("should remain in online state", () => {
                expect(fsm.currentState()).toBe("online");
            });
        });

        describe("when leaving online state", () => {
            beforeEach(() => {
                mockSetInterval.mockImplementation(() => 888);
                fsm.handle("connectionLost");
            });

            it("should clear the heartbeat timer in _onExit", () => {
                expect(mockClearInterval).toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // online._onEnter — checkCount reset
    // =========================================================================

    describe("online._onEnter (checkCount reset)", () => {
        describe("when returning to online after a health check passes", () => {
            let checkCountOnEnterChecking: number, finalState: string;

            beforeEach(async () => {
                // Register the wildcard listener BEFORE triggering any transitions
                // so checkCountUpdated (emitted in checking._onEnter synchronously)
                // is captured.
                fsm.on("*", (eventName: string, data: any) => {
                    if (eventName === "checkCountUpdated") {
                        checkCountOnEnterChecking = data.checkCount;
                    }
                });

                mockCheckHealth.mockResolvedValueOnce({ ok: true });
                mockSetInterval.mockImplementation(() => 1);

                fsm.handle("connectionLost"); // online → checking, health check starts

                // Wait for the health check promise microtasks to settle
                await Promise.resolve();
                await Promise.resolve();

                finalState = fsm.currentState();
            });

            it("should have returned to online state", () => {
                expect(finalState).toBe("online");
            });

            it("should have captured checkCount of 1 during checking._onEnter", () => {
                expect(checkCountOnEnterChecking).toBe(1);
            });

            describe("when connectionLost fires again after returning to online", () => {
                let secondCycleCheckCount: number;

                beforeEach(async () => {
                    // Register a fresh listener to capture the second checking._onEnter
                    fsm.on("*", (eventName: string, data: any) => {
                        if (eventName === "checkCountUpdated") {
                            secondCycleCheckCount = data.checkCount;
                        }
                    });

                    mockCheckHealth.mockResolvedValueOnce({ ok: true });
                    mockSetInterval.mockImplementation(() => 2);

                    fsm.handle("connectionLost"); // online → checking, health check starts

                    await Promise.resolve();
                    await Promise.resolve();
                });

                it("should start checkCount at 1 again (reset to 0 in online._onEnter)", () => {
                    // If online._onEnter resets correctly, the second cycle starts at
                    // checkCount 0, then checking._onEnter increments to 1.
                    expect(secondCycleCheckCount).toBe(1);
                });
            });
        });
    });

    // =========================================================================
    // offline state — retry timer fires below MAX_CHECKS
    // =========================================================================

    describe("offline state", () => {
        describe("when the retry timer fires and checkCount is below MAX_CHECKS", () => {
            let intervalCallback: () => void;

            beforeEach(() => {
                mockSetInterval.mockImplementationOnce((cb: () => void) => {
                    intervalCallback = cb;
                    return 42; // fake timer id
                });

                fsm.handle("connectionLost"); // → checking (checkCount = 1)
                fsm.handle("healthCheckFailed"); // → offline, timer starts

                // Mock checkHealth to keep it pending so we don't auto-leave checking
                mockCheckHealth.mockReturnValue(new Promise(() => {}));
                // Also mock the setInterval that fires on re-entry to offline
                mockSetInterval.mockImplementation(() => 43);

                // Fire the interval callback (checkCount is 1, below MAX_CHECKS)
                intervalCallback();
            });

            it("should transition to checking (retryCheck handler)", () => {
                expect(fsm.currentState()).toBe("checking");
            });

            it("should have cleared the offline timer on _onExit when retryCheck fired", () => {
                // 2 clears: 1 heartbeat (online._onExit) + 1 retry timer (offline._onExit)
                expect(mockClearInterval).toHaveBeenCalledTimes(2);
                expect(mockClearInterval).toHaveBeenCalledWith(42);
            });
        });

        // =====================================================================
        // offline state — retry timer fires at MAX_CHECKS (cap path)
        // =====================================================================

        describe("when the retry timer fires and checkCount has reached MAX_CHECKS", () => {
            let finalIntervalCallback: () => void, maxChecksEmitted: boolean;

            beforeEach(() => {
                maxChecksEmitted = false;
                fsm.on("*", (eventName: string) => {
                    if (eventName === "maxChecksReached") {
                        maxChecksEmitted = true;
                    }
                });

                // First entry into offline — capture the initial interval cb
                let currentIntervalCb: () => void;
                mockSetInterval.mockImplementation((cb: () => void, _delay: number) => {
                    currentIntervalCb = cb;
                    return Math.floor(Math.random() * 1000);
                });

                fsm.handle("connectionLost"); // → checking (checkCount = 1)
                fsm.handle("healthCheckFailed"); // → offline, timer starts

                // Drive checkCount to MAX_CHECKS via (MAX_CHECKS - 1) more
                // failed health check cycles. checking._onEnter already set
                // checkCount to 1, so we need (MAX_CHECKS - 1) more iterations.
                for (let i = 0; i < MAX_CHECKS - 1; i++) {
                    fsm.handle("retryCheck"); // offline → checking (increments checkCount)
                    fsm.handle("healthCheckFailed"); // checking → offline (new timer starts)
                }

                // currentIntervalCb now refers to the last interval callback
                finalIntervalCallback = currentIntervalCb!;

                // Clear mock call records so we only assert on what happens NEXT
                mockClearInterval.mockReset();

                // Fire the interval — checkCount is now MAX_CHECKS, cap path triggers
                finalIntervalCallback();
            });

            it("should remain in offline state after cap fires", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should emit maxChecksReached", () => {
                expect(maxChecksEmitted).toBe(true);
            });

            it("should clear the retry timer inside the interval callback", () => {
                expect(mockClearInterval).toHaveBeenCalledTimes(1);
            });

            describe("when connectionRestored fires after the cap has nulled retryTimer", () => {
                beforeEach(() => {
                    // After the cap, ctx.retryTimer is null.
                    // _onExit should NOT call clearInterval (null guard).
                    mockClearInterval.mockReset();
                    mockCheckHealth.mockReturnValue(new Promise(() => {}));
                    fsm.handle("connectionRestored"); // offline → checking (retryTimer is null)
                });

                it("should transition to checking", () => {
                    expect(fsm.currentState()).toBe("checking");
                });

                it("should not call clearInterval (retryTimer was already null from cap)", () => {
                    expect(mockClearInterval).not.toHaveBeenCalled();
                });
            });
        });

        // =====================================================================
        // offline._onExit — timer cleared on connectionRestored
        // =====================================================================

        describe("when connectionRestored is received while in offline state", () => {
            let capturedTimerId: number;

            beforeEach(() => {
                capturedTimerId = 77;
                mockSetInterval.mockImplementationOnce((_cb: () => void) => capturedTimerId);
                // Keep checkHealth pending so we don't auto-transition out of checking
                mockCheckHealth.mockReturnValue(new Promise(() => {}));

                fsm.handle("connectionLost"); // → checking
                fsm.handle("healthCheckFailed"); // → offline, timer starts (returns capturedTimerId)
                fsm.handle("connectionRestored"); // _onExit clears timer, → checking
            });

            it("should transition to checking", () => {
                expect(fsm.currentState()).toBe("checking");
            });

            it("should clear the retry timer in _onExit with the correct timer id", () => {
                // 2 clears: 1 heartbeat (online._onExit) + 1 retry timer (offline._onExit)
                expect(mockClearInterval).toHaveBeenCalledTimes(2);
                expect(mockClearInterval).toHaveBeenCalledWith(capturedTimerId);
            });
        });

        // =====================================================================
        // Orphaned interval callback — retryCheck from wrong state
        // =====================================================================

        describe("when an orphaned interval callback fires after leaving offline", () => {
            let intervalCallback: () => void, nohandlerCb: jest.Mock;

            beforeEach(() => {
                mockSetInterval.mockImplementationOnce((cb: () => void) => {
                    intervalCallback = cb;
                    return 99;
                });
                mockCheckHealth.mockReturnValue(new Promise(() => {}));

                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);

                fsm.handle("connectionLost"); // → checking
                fsm.handle("healthCheckFailed"); // → offline (timer starts, captures cb)
                fsm.handle("connectionRestored"); // → checking (left offline, timer cleared)

                // Fire the old interval cb — FSM is now in checking, retryCheck has no handler
                intervalCallback();
            });

            it("should emit nohandler for the stale retryCheck call", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
                expect(nohandlerCb).toHaveBeenCalledWith({ inputName: "retryCheck", args: [] });
            });

            it("should not change state (stays in checking)", () => {
                expect(fsm.currentState()).toBe("checking");
            });
        });
    });

    // =========================================================================
    // checking state — health check passes (ok: true)
    // =========================================================================

    describe("checking state — health check passes", () => {
        describe("when checkHealth resolves with ok:true", () => {
            let transitionedPayloads: Array<{ fromState: string; toState: string }>,
                checkCountUpdatedData: unknown;

            beforeEach(async () => {
                // Subscribe before triggering transitions so checkCountUpdated is captured
                transitionedPayloads = [];
                checkCountUpdatedData = undefined;
                fsm.on("transitioned", (data: any) => {
                    transitionedPayloads.push(data);
                });
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "checkCountUpdated") {
                        checkCountUpdatedData = data;
                    }
                });

                mockCheckHealth.mockResolvedValueOnce({ ok: true });
                mockSetInterval.mockImplementation(() => 111);

                fsm.handle("connectionLost");
                fsm.handle("connectionRestored"); // → checking, health check starts

                await Promise.resolve();
                await Promise.resolve();
            });

            it("should transition to online", () => {
                expect(fsm.currentState()).toBe("online");
            });

            it("should have transitioned through checking → online", () => {
                expect(transitionedPayloads).toEqual(
                    expect.arrayContaining([{ fromState: "checking", toState: "online" }])
                );
            });

            it("should have emitted checkCountUpdated with checkCount 1", () => {
                expect(checkCountUpdatedData).toEqual({ checkCount: 1 });
            });

            it("should have called checkHealth with an AbortSignal", () => {
                expect(mockCheckHealth).toHaveBeenLastCalledWith(expect.any(AbortSignal));
            });
        });
    });

    // =========================================================================
    // checking state — health check fails (not ok)
    // =========================================================================

    describe("checking state — health check fails (not ok)", () => {
        describe("when checkHealth resolves with ok:false", () => {
            let transitionedPayloads: Array<{ fromState: string; toState: string }>;

            beforeEach(async () => {
                transitionedPayloads = [];
                fsm.on("transitioned", (data: any) => {
                    transitionedPayloads.push(data);
                });

                mockCheckHealth.mockResolvedValueOnce({ ok: false });
                mockSetInterval.mockImplementation(() => 11);

                fsm.handle("connectionLost");
                fsm.handle("connectionRestored"); // → checking

                await Promise.resolve();
                await Promise.resolve();
            });

            it("should transition back to offline", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should have transitioned checking → offline", () => {
                expect(transitionedPayloads).toEqual(
                    expect.arrayContaining([{ fromState: "checking", toState: "offline" }])
                );
            });
        });
    });

    // =========================================================================
    // checking state — health check fails (rejection)
    // =========================================================================

    describe("checking state — health check fails (rejection)", () => {
        describe("when checkHealth rejects", () => {
            let transitionedPayloads: Array<{ fromState: string; toState: string }>;

            beforeEach(async () => {
                transitionedPayloads = [];
                fsm.on("transitioned", (data: any) => {
                    transitionedPayloads.push(data);
                });

                mockCheckHealth.mockRejectedValueOnce(new Error("simulated failure"));
                mockSetInterval.mockImplementation(() => 22);

                fsm.handle("connectionLost");
                fsm.handle("connectionRestored"); // → checking

                await Promise.resolve();
                await Promise.resolve();
            });

            it("should transition to offline via the catch() handler", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should have transitioned checking → offline", () => {
                expect(transitionedPayloads).toEqual(
                    expect.arrayContaining([{ fromState: "checking", toState: "offline" }])
                );
            });
        });
    });

    // =========================================================================
    // checking._onExit — AbortController cleanup
    // =========================================================================

    describe("checking._onExit (AbortController cleanup)", () => {
        describe("when connectionLost fires while a health check is in flight", () => {
            let abortSpy: jest.SpyInstance, fsmStateAfterAbort: string;

            beforeEach(() => {
                // Keep checkHealth pending indefinitely so we remain in checking
                mockCheckHealth.mockReturnValue(new Promise(() => {}));
                mockSetInterval.mockImplementation(() => 33);

                fsm.handle("connectionLost"); // online → checking

                abortSpy = jest.spyOn(AbortController.prototype, "abort");

                // Now fire connectionLost to trigger _onExit on checking
                fsm.handle("connectionLost"); // → offline, _onExit aborts the controller
                fsmStateAfterAbort = fsm.currentState();
            });

            afterEach(() => {
                abortSpy.mockRestore();
            });

            it("should be in offline state after connectionLost from checking", () => {
                expect(fsmStateAfterAbort).toBe("offline");
            });
        });

        describe("when the AbortController is spied on before entering checking state", () => {
            let abortSpy: jest.SpyInstance;

            beforeEach(() => {
                // Spy BEFORE connectionRestored triggers checking._onEnter
                abortSpy = jest.spyOn(AbortController.prototype, "abort");

                mockCheckHealth.mockReturnValue(new Promise(() => {}));
                mockSetInterval.mockImplementation(() => 44);

                fsm.handle("connectionLost"); // online → checking (_onEnter creates controller)
                fsm.handle("connectionLost"); // checking → offline (_onExit calls abort)
            });

            afterEach(() => {
                abortSpy.mockRestore();
            });

            it("should have called abort() on the AbortController when leaving checking", () => {
                expect(abortSpy).toHaveBeenCalledTimes(1);
            });
        });

        describe("when the FSM re-enters checking and leaves a second time", () => {
            let abortSpy: jest.SpyInstance;

            beforeEach(() => {
                abortSpy = jest.spyOn(AbortController.prototype, "abort");
                mockCheckHealth.mockReturnValue(new Promise(() => {}));
                mockSetInterval.mockImplementation(() => 55);

                // First checking visit
                fsm.handle("connectionLost"); // online → checking
                fsm.handle("connectionLost"); // checking → offline (_onExit aborts #1)

                // Second checking visit
                fsm.handle("connectionRestored"); // offline → checking
                fsm.handle("connectionLost"); // checking → offline (_onExit aborts #2)
            });

            afterEach(() => {
                abortSpy.mockRestore();
            });

            it("should have aborted one controller per checking visit", () => {
                expect(abortSpy).toHaveBeenCalledTimes(2);
            });
        });
    });

    // =========================================================================
    // Stale health check callback — no unexpected transitions after leaving checking
    // =========================================================================

    describe("stale health check callback handling", () => {
        describe("when the FSM leaves checking before the health check settles", () => {
            let transitionedAfterExit: Array<{ fromState: string; toState: string }>,
                nohandlerCb: jest.Mock;

            beforeEach(async () => {
                let rejectStale: (err: Error) => void;
                mockCheckHealth.mockImplementationOnce(
                    () =>
                        new Promise((_res, rej) => {
                            rejectStale = rej;
                        })
                );
                mockSetInterval.mockImplementation(() => 66);

                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);

                fsm.handle("connectionLost");
                fsm.handle("connectionRestored"); // → checking, health check pending
                fsm.handle("connectionLost"); // → offline, _onExit aborts controller

                // Only capture transitions that happen AFTER we've left checking
                transitionedAfterExit = [];
                fsm.on("transitioned", (data: any) => {
                    transitionedAfterExit.push(data);
                });

                // Simulate what an aborted health check does: reject with a
                // DOMException. The .catch() fires fsm.handle("healthCheckFailed")
                // from offline, which emits nohandler (no transition).
                rejectStale!(new DOMException("The operation was aborted.", "AbortError"));
                await Promise.resolve();
                await Promise.resolve();
            });

            it("should remain in offline state (stale callback emits nohandler, no transition)", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should not trigger any unexpected state transitions", () => {
                // healthCheckFailed or healthCheckPassed from offline → nohandler,
                // not a state transition
                expect(transitionedAfterExit).toHaveLength(0);
            });
        });
    });

    // =========================================================================
    // Rapid toggling — connectionLost/connectionRestored cycling
    // =========================================================================

    describe("rapid toggling", () => {
        describe("when connectionLost and connectionRestored fire in rapid succession", () => {
            let finalState: string, transitionCount: number;

            beforeEach(() => {
                mockCheckHealth.mockReturnValue(new Promise(() => {}));
                mockSetInterval.mockImplementation(() => Math.floor(Math.random() * 9000) + 1000);
                transitionCount = 0;
                fsm.on("transitioned", () => {
                    transitionCount++;
                });

                // Rapid-fire: online → checking → offline → checking → offline → checking
                fsm.handle("connectionLost"); // online → checking
                fsm.handle("connectionLost"); // checking → offline
                fsm.handle("connectionRestored"); // offline → checking
                fsm.handle("connectionLost"); // checking → offline
                fsm.handle("connectionRestored"); // offline → checking

                finalState = fsm.currentState();
            });

            it("should end in checking state", () => {
                expect(finalState).toBe("checking");
            });

            it("should have fired exactly 5 transitioned events", () => {
                expect(transitionCount).toBe(5);
            });

            it("should have called clearInterval for heartbeat + each offline → checking exit (3 times)", () => {
                // 1 heartbeat (online._onExit on first connectionLost) +
                // 2 retry timers (offline._onExit on each connectionRestored)
                expect(mockClearInterval).toHaveBeenCalledTimes(3);
            });
        });

        describe("when connectionLost fires twice in succession", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                mockSetInterval.mockImplementation(() => 88);
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);

                fsm.handle("connectionLost"); // online → checking
                fsm.handle("connectionLost"); // checking → offline (checking has connectionLost handler)
            });

            it("should end in offline state", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should not emit nohandler (both connectionLost inputs are handled)", () => {
                // First: online → checking. Second: checking → offline.
                // Both states have a connectionLost handler.
                expect(nohandlerCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // Happy path: online → checking → online
    // =========================================================================

    describe("full happy path: online → checking → online", () => {
        describe("when connectionLost fires and the health check passes", () => {
            let stateSequence: string[];

            beforeEach(async () => {
                stateSequence = [];
                fsm.on("transitioned", (data: any) => {
                    stateSequence.push(data.toState);
                });

                mockCheckHealth.mockResolvedValueOnce({ ok: true });
                mockSetInterval.mockImplementation(() => 777);

                fsm.handle("connectionLost"); // → checking, health check starts

                await Promise.resolve();
                await Promise.resolve();
            });

            it("should pass through checking → online in order", () => {
                expect(stateSequence).toEqual(["checking", "online"]);
            });
        });
    });

    // =========================================================================
    // Failure path: online → checking → offline
    // =========================================================================

    describe("full failure path: online → checking → offline", () => {
        describe("when connectionLost fires and the health check fails", () => {
            let stateSequence: string[], checkCountSeen: number;

            beforeEach(async () => {
                stateSequence = [];
                checkCountSeen = 0;
                fsm.on("transitioned", (data: any) => {
                    stateSequence.push(data.toState);
                });
                fsm.on("*", (eventName: string, data: any) => {
                    if (eventName === "checkCountUpdated") {
                        checkCountSeen = data.checkCount;
                    }
                });

                mockCheckHealth.mockResolvedValueOnce({ ok: false });
                mockSetInterval.mockImplementation(() => 222);

                fsm.handle("connectionLost"); // → checking, health check starts

                await Promise.resolve();
                await Promise.resolve();
            });

            it("should end in offline state", () => {
                expect(fsm.currentState()).toBe("offline");
            });

            it("should have passed through checking → offline", () => {
                expect(stateSequence).toEqual(["checking", "offline"]);
            });

            it("should have incremented checkCount to 1 during checking", () => {
                expect(checkCountSeen).toBe(1);
            });
        });
    });

    // =========================================================================
    // checkCountUpdated — increments across multiple checking visits
    // =========================================================================

    describe("checkCountUpdated event", () => {
        describe("when checking state is entered multiple times without returning to online", () => {
            let checkCountHistory: number[];

            beforeEach(async () => {
                checkCountHistory = [];
                fsm.on("*", (eventName: string, data: any) => {
                    if (eventName === "checkCountUpdated") {
                        checkCountHistory.push(data.checkCount);
                    }
                });
                mockSetInterval.mockImplementation(() => 333);

                // First cycle: online → checking (count=1) → offline
                mockCheckHealth.mockResolvedValueOnce({ ok: false });
                fsm.handle("connectionLost"); // online → checking
                await Promise.resolve();
                await Promise.resolve();

                // Second cycle: offline → checking (count=2) → offline
                mockCheckHealth.mockResolvedValueOnce({ ok: false });
                fsm.handle("connectionRestored");
                await Promise.resolve();
                await Promise.resolve();
            });

            it("should have emitted checkCountUpdated twice with incrementing counts", () => {
                expect(checkCountHistory).toEqual([1, 2]);
            });
        });
    });

    // =========================================================================
    // simulation mode — setSimulationMode re-export
    // =========================================================================

    describe("simulation mode", () => {
        describe("when setSimulationMode is called via the fsm module re-export", () => {
            beforeEach(async () => {
                const mod = await import("./fsm");
                mod.setSimulationMode(true);
            });

            it("should delegate to the health module's setSimulationMode", () => {
                expect(mockSetSimulationMode).toHaveBeenCalledWith(true);
            });
        });
    });

    // =========================================================================
    // dispose — FSM cleanup
    // =========================================================================

    describe("dispose", () => {
        describe("when the FSM is disposed", () => {
            beforeEach(() => {
                fsm.dispose();
            });

            it("should make handle a no-op (no state change)", () => {
                fsm.handle("connectionLost");
                expect(fsm.currentState()).toBe("online");
            });
        });
    });
});
