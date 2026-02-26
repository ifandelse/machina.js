/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { createBehavioralFsm, BehavioralFsm } from "./behavioral-fsm";
import { MACHINA_TYPE } from "./types";

// =============================================================================
// Test FSM configs & helpers
// =============================================================================

const FSM_ID = "hal-9000";

function makeTrafficLightFsm() {
    return createBehavioralFsm({
        id: FSM_ID,
        initialState: "green",
        context: {} as { ticks: number; entered: string; exited: string },
        states: {
            green: {
                _onEnter({ ctx }) {
                    ctx.entered = "green";
                },
                _onExit({ ctx }) {
                    ctx.exited = "green";
                },
                timeout: "yellow",
                tick({ ctx }) {
                    ctx.ticks++;
                },
            },
            yellow: {
                _onEnter({ ctx }) {
                    ctx.entered = "yellow";
                },
                _onExit({ ctx }) {
                    ctx.exited = "yellow";
                },
                timeout: "red",
                "*"({ ctx, inputName }) {
                    ctx.entered = `yellow:*:${inputName}`;
                },
            },
            red: {
                timeout: "green",
            },
        },
    });
}

type TrafficClient = { ticks: number; entered: string; exited: string };

function makeClient(): TrafficClient {
    return { ticks: 0, entered: "", exited: "" };
}

// =============================================================================
// Tests
// =============================================================================

describe("BehavioralFsm", () => {
    let fsm: ReturnType<typeof makeTrafficLightFsm>;

    beforeEach(() => {
        jest.clearAllMocks();
        fsm = makeTrafficLightFsm();
    });

    // =========================================================================
    // handle()
    // =========================================================================

    describe("handle", () => {
        describe("when handling the first input for a new client", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "tick");
            });

            it("should initialize the client into the initial state", () => {
                expect(fsm.currentState(client)).toBe("green");
            });

            it("should fire _onEnter for the initial state", () => {
                expect(client.entered).toBe("green");
            });

            it("should handle the input after initialization", () => {
                expect(client.ticks).toBe(1);
            });
        });

        describe("when the current state has a matching function handler", () => {
            let client: TrafficClient, handlingCb: jest.Mock, handledCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                handlingCb = jest.fn();
                handledCb = jest.fn();
                fsm.on("handling", handlingCb);
                fsm.on("handled", handledCb);
                fsm.handle(client, "tick");
            });

            it("should call the handler (tick increments ctx.ticks)", () => {
                expect(client.ticks).toBe(1);
            });

            it("should emit handling event", () => {
                expect(handlingCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "tick", client })
                );
            });

            it("should emit handled event", () => {
                expect(handledCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "tick", client })
                );
            });
        });

        describe("when the handler is a string shorthand", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "timeout");
            });

            it("should transition to the target state", () => {
                expect(fsm.currentState(client)).toBe("yellow");
            });
        });

        describe("when the handler returns a state name", () => {
            let client: { shouldTransition: boolean }, conditionalFsm: any;

            beforeEach(() => {
                conditionalFsm = createBehavioralFsm({
                    id: "conditional",
                    initialState: "idle",
                    context: {} as { shouldTransition: boolean },
                    states: {
                        idle: {
                            check({ ctx }) {
                                if (ctx.shouldTransition) return "active";
                            },
                        },
                        active: {},
                    },
                });
                client = { shouldTransition: true };
                conditionalFsm.handle(client, "check");
            });

            it("should transition to the returned state", () => {
                expect(conditionalFsm.currentState(client)).toBe("active");
            });
        });

        describe("when the handler returns void", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                // tick handler returns void
                fsm.handle(client, "tick");
            });

            it("should stay in the current state", () => {
                expect(fsm.currentState(client)).toBe("green");
            });
        });

        describe("when the current state has no matching handler but has a catch-all", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                // Move to yellow (which has a * catch-all)
                fsm.handle(client, "timeout");
                fsm.handle(client, "unknownInput" as any);
            });

            it("should invoke the catch-all handler", () => {
                expect(client.entered).toBe("yellow:*:unknownInput");
            });
        });

        describe("when no handler exists at all", () => {
            let client: TrafficClient, nohandlerCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                // "red" has only "timeout" and no catch-all
                fsm.handle(client, "timeout"); // green → yellow
                fsm.handle(client, "timeout"); // yellow → red
                fsm.handle(client, "tick"); // red has no "tick" or "*"
            });

            it("should emit nohandler", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
                expect(nohandlerCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "tick", args: [], client })
                );
            });

            it("should stay in the current state", () => {
                expect(fsm.currentState(client)).toBe("red");
            });
        });

        describe("when extra args are passed", () => {
            let receivedArgs: unknown[], argFsm: any, client: Record<string, unknown>;

            beforeEach(() => {
                receivedArgs = [];
                argFsm = createBehavioralFsm({
                    id: "arg-test",
                    initialState: "waiting",
                    states: {
                        waiting: {
                            data(_args: any, ...extra: unknown[]) {
                                receivedArgs = extra;
                            },
                        },
                    },
                });
                client = {};
                argFsm.handle(client, "data", "phaser", 42);
            });

            it("should forward extra args to the handler", () => {
                expect(receivedArgs).toEqual(["phaser", 42]);
            });
        });

        describe("when the FSM is disposed", () => {
            let client: TrafficClient, handlingCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                handlingCb = jest.fn();
                fsm.on("handling", handlingCb);
                fsm.dispose();
                fsm.handle(client, "tick");
            });

            it("should not emit any events", () => {
                expect(handlingCb).not.toHaveBeenCalled();
            });

            it("should not initialize the client", () => {
                expect(fsm.currentState(client)).toBeUndefined();
            });
        });
    });

    // =========================================================================
    // states
    // =========================================================================

    describe("states", () => {
        it("should expose a states property", () => {
            expect(fsm.states).toBeDefined();
        });

        it("should contain all declared state names", () => {
            expect(Object.keys(fsm.states)).toEqual(
                expect.arrayContaining(["green", "yellow", "red"])
            );
        });

        it("should reflect string shorthand handlers", () => {
            expect(fsm.states["green"]["timeout"]).toBe("yellow");
        });
    });

    // =========================================================================
    // transition()
    // =========================================================================

    describe("transition", () => {
        describe("when transitioning to a new valid state", () => {
            let client: TrafficClient, transitioningCb: jest.Mock, transitionedCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                transitioningCb = jest.fn();
                transitionedCb = jest.fn();
                fsm.on("transitioning", transitioningCb);
                fsm.on("transitioned", transitionedCb);
                fsm.handle(client, "tick"); // init
                transitioningCb.mockClear();
                transitionedCb.mockClear();
                fsm.transition(client, "yellow");
            });

            it("should update the client's state", () => {
                expect(fsm.currentState(client)).toBe("yellow");
            });

            it("should fire _onExit for the old state", () => {
                expect(client.exited).toBe("green");
            });

            it("should fire _onEnter for the new state", () => {
                expect(client.entered).toBe("yellow");
            });

            it("should emit transitioning with correct payload", () => {
                expect(transitioningCb).toHaveBeenCalledTimes(1);
                expect(transitioningCb).toHaveBeenCalledWith(
                    expect.objectContaining({ fromState: "green", toState: "yellow", client })
                );
            });

            it("should emit transitioned with correct payload", () => {
                expect(transitionedCb).toHaveBeenCalledTimes(1);
                expect(transitionedCb).toHaveBeenCalledWith(
                    expect.objectContaining({ fromState: "green", toState: "yellow", client })
                );
            });
        });

        describe("when transitioning to the same state", () => {
            let client: TrafficClient, transitioningCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                transitioningCb = jest.fn();
                fsm.on("transitioning", transitioningCb);
                fsm.handle(client, "tick"); // init
                transitioningCb.mockClear();
                fsm.transition(client, "green"); // same state
            });

            it("should not emit transitioning", () => {
                expect(transitioningCb).not.toHaveBeenCalled();
            });

            it("should remain in the same state", () => {
                expect(fsm.currentState(client)).toBe("green");
            });
        });

        describe("when transitioning to a state that does not exist", () => {
            let client: TrafficClient, invalidstateCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                invalidstateCb = jest.fn();
                fsm.on("invalidstate", invalidstateCb);
                fsm.handle(client, "tick"); // init
                fsm.transition(client, "purple" as any);
            });

            it("should emit invalidstate", () => {
                expect(invalidstateCb).toHaveBeenCalledTimes(1);
                expect(invalidstateCb).toHaveBeenCalledWith(
                    expect.objectContaining({ stateName: "purple", client })
                );
            });

            it("should stay in the current state", () => {
                expect(fsm.currentState(client)).toBe("green");
            });
        });

        describe("when _onEnter returns a state name (bounce)", () => {
            let client: Record<string, unknown>, bounceFsm: any, transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                bounceFsm = createBehavioralFsm({
                    id: "bouncer",
                    initialState: "a",
                    states: {
                        a: { go: "b" },
                        b: {
                            _onEnter() {
                                return "c";
                            },
                        },
                        c: {},
                    },
                });
                bounceFsm.on("transitioned", transitionedCb);
                client = {};
                transitionedCb.mockClear();
                bounceFsm.handle(client, "go");
            });

            it("should end up in the bounce target state", () => {
                expect(bounceFsm.currentState(client)).toBe("c");
            });

            it("should have transitioned through the intermediate state", () => {
                // init→a, a→b, b→c (bounce)
                expect(transitionedCb).toHaveBeenCalledTimes(3);
            });
        });

        describe("when max transition depth is exceeded", () => {
            let client: Record<string, unknown>, loopFsm: any, thrownError: Error;

            beforeEach(() => {
                loopFsm = createBehavioralFsm({
                    id: "infinite-loop",
                    initialState: "a",
                    states: {
                        a: {
                            _onEnter() {
                                return "b";
                            },
                        },
                        b: {
                            _onEnter() {
                                return "a";
                            },
                        },
                    },
                });
                client = {};
                try {
                    loopFsm.handle(client, "noop" as any);
                } catch (e: any) {
                    thrownError = e;
                }
            });

            it("should throw an error mentioning max depth", () => {
                expect(thrownError).toBeDefined();
                expect(thrownError.message).toContain("Max transition depth");
            });

            it("should include the FSM id in the error message", () => {
                expect(thrownError.message).toContain("infinite-loop");
            });
        });

        describe("when the FSM is disposed", () => {
            let client: TrafficClient, transitioningCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                transitioningCb = jest.fn();
                fsm.handle(client, "tick"); // init
                fsm.on("transitioning", transitioningCb);
                fsm.dispose();
                fsm.transition(client, "yellow");
            });

            it("should not transition", () => {
                expect(fsm.currentState(client)).toBe("green");
            });

            it("should not emit events", () => {
                expect(transitioningCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // Lifecycle hooks — event ordering
    // =========================================================================

    describe("event ordering", () => {
        describe("when handle triggers a transition via string shorthand", () => {
            let client: TrafficClient, eventLog: string[];

            beforeEach(() => {
                client = makeClient();
                eventLog = [];
                fsm.handle(client, "tick"); // init
                fsm.on("handling", () => eventLog.push("handling"));
                fsm.on("handled", () => eventLog.push("handled"));
                fsm.on("transitioning", () => eventLog.push("transitioning"));
                fsm.on("transitioned", () => eventLog.push("transitioned"));
                fsm.handle(client, "timeout"); // green → yellow
            });

            it("should emit events in correct order", () => {
                expect(eventLog).toEqual(["handling", "handled", "transitioning", "transitioned"]);
            });
        });

        describe("when a transition has both _onExit and _onEnter", () => {
            let sequence: string[];

            beforeEach(() => {
                sequence = [];
                const seqFsm = createBehavioralFsm({
                    id: "sequence",
                    initialState: "a",
                    states: {
                        a: {
                            _onExit() {
                                sequence.push("a:exit");
                            },
                            go: "b",
                        },
                        b: {
                            _onEnter() {
                                sequence.push("b:enter");
                            },
                        },
                    },
                });
                seqFsm.on("transitioning", () => sequence.push("transitioning"));
                seqFsm.on("transitioned", () => sequence.push("transitioned"));
                const client: Record<string, unknown> = {};
                // handle("go") triggers: init (a), then dispatches "go" (a→b)
                // Init pushes: transitioning, transitioned (for undefined→a)
                // "go" pushes: a:exit, transitioning(a→b), b:enter, transitioned(a→b)
                seqFsm.handle(client, "go");
            });

            it("should execute _onExit before transitioning, _onEnter before transitioned", () => {
                // Find the a→b transition events (after init)
                const exitIdx = sequence.lastIndexOf("a:exit");
                const enterIdx = sequence.lastIndexOf("b:enter");
                const tioning = sequence.indexOf("transitioning", exitIdx);
                const tioned = sequence.indexOf("transitioned", enterIdx);
                expect(exitIdx).toBeLessThan(tioning);
                expect(tioning).toBeLessThan(enterIdx);
                expect(enterIdx).toBeLessThan(tioned);
            });
        });
    });

    // =========================================================================
    // currentState()
    // =========================================================================

    describe("currentState", () => {
        describe("when the client has never been seen", () => {
            let result: string | undefined;

            beforeEach(() => {
                result = fsm.currentState(makeClient());
            });

            it("should return undefined", () => {
                expect(result).toBeUndefined();
            });
        });

        describe("when the client has been initialized", () => {
            let client: TrafficClient, result: string | undefined;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "tick");
                result = fsm.currentState(client);
            });

            it("should return the current state name", () => {
                expect(result).toBe("green");
            });
        });

        describe("when the client has been transitioned", () => {
            let client: TrafficClient, result: string | undefined;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "timeout"); // green → yellow
                result = fsm.currentState(client);
            });

            it("should return the new state", () => {
                expect(result).toBe("yellow");
            });
        });
    });

    // =========================================================================
    // defer()
    // =========================================================================

    describe("defer", () => {
        describe("when deferring without a target state", () => {
            let client: Record<string, unknown>, deferFsm: any, handlerCalledInYellow: boolean;

            beforeEach(() => {
                handlerCalledInYellow = false;
                deferFsm = createBehavioralFsm({
                    id: "defer-any",
                    initialState: "green",
                    states: {
                        green: {
                            wait({ defer }) {
                                defer();
                            },
                            go: "yellow",
                        },
                        yellow: {
                            wait() {
                                handlerCalledInYellow = true;
                            },
                        },
                    },
                });
                client = {};
                deferFsm.handle(client, "wait");
                deferFsm.handle(client, "go"); // green → yellow, replays deferred "wait"
            });

            it("should replay the deferred input after transitioning", () => {
                expect(handlerCalledInYellow).toBe(true);
            });

            it("should be in the final state", () => {
                expect(deferFsm.currentState(client)).toBe("yellow");
            });
        });

        describe("when deferring with a specific target state", () => {
            let client: Record<string, unknown>, deferFsm: any, handlerCalledInRed: boolean;

            beforeEach(() => {
                handlerCalledInRed = false;
                deferFsm = createBehavioralFsm({
                    id: "defer-targeted",
                    initialState: "green",
                    states: {
                        green: {
                            wait({ defer }) {
                                defer({ until: "red" });
                            },
                            go: "yellow",
                        },
                        yellow: {
                            wait() {
                                // Should NOT fire — deferred until "red"
                            },
                            go: "red",
                        },
                        red: {
                            wait() {
                                handlerCalledInRed = true;
                            },
                        },
                    },
                });
                client = {};
                deferFsm.handle(client, "wait"); // deferred until "red"
                deferFsm.handle(client, "go"); // green → yellow (no replay)
                deferFsm.handle(client, "go"); // yellow → red (replays "wait")
            });

            it("should not replay when entering a non-matching state", () => {
                expect(handlerCalledInRed).toBe(true);
            });

            it("should be in the final state", () => {
                expect(deferFsm.currentState(client)).toBe("red");
            });
        });

        describe("when defer is called", () => {
            let client: Record<string, unknown>, deferFsm: any, deferredCb: jest.Mock;

            beforeEach(() => {
                deferredCb = jest.fn();
                deferFsm = createBehavioralFsm({
                    id: "defer-event",
                    initialState: "idle",
                    states: {
                        idle: {
                            save({ defer }) {
                                defer();
                            },
                        },
                    },
                });
                deferFsm.on("deferred", deferredCb);
                client = {};
                deferFsm.handle(client, "save");
            });

            it("should emit a deferred event", () => {
                expect(deferredCb).toHaveBeenCalledTimes(1);
                expect(deferredCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "save", client })
                );
            });
        });
    });

    // =========================================================================
    // Multiple clients
    // =========================================================================

    describe("multiple clients", () => {
        describe("when two clients are tracked independently", () => {
            let alice: TrafficClient, bob: TrafficClient;

            beforeEach(() => {
                alice = makeClient();
                bob = makeClient();
                fsm.handle(alice, "timeout"); // green → yellow
                fsm.handle(bob, "tick"); // stays green
            });

            it("should have alice in yellow", () => {
                expect(fsm.currentState(alice)).toBe("yellow");
            });

            it("should have bob in green", () => {
                expect(fsm.currentState(bob)).toBe("green");
            });
        });
    });

    // =========================================================================
    // on() / emit()
    // =========================================================================

    describe("on", () => {
        describe("when subscribing and then calling off", () => {
            let client: TrafficClient, cb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                cb = jest.fn();
                const sub = fsm.on("transitioned", cb);
                fsm.handle(client, "tick"); // init fires transitioned
                sub.off();
                cb.mockClear();
                fsm.handle(client, "timeout"); // green → yellow
            });

            it("should not receive events after off()", () => {
                expect(cb).not.toHaveBeenCalled();
            });
        });

        describe("when using the wildcard subscriber", () => {
            let client: TrafficClient, wildcardCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                wildcardCb = jest.fn();
                fsm.on("*", wildcardCb);
                fsm.handle(client, "tick");
            });

            it("should receive events with event name as first arg", () => {
                expect(wildcardCb).toHaveBeenCalled();
                const firstCall = wildcardCb.mock.calls[0];
                expect(typeof firstCall[0]).toBe("string");
            });
        });
    });

    describe("emit (public)", () => {
        describe("when emitting a custom event", () => {
            let wildcardCb: jest.Mock;

            beforeEach(() => {
                wildcardCb = jest.fn();
                fsm.on("*", wildcardCb);
                fsm.emit("vehicles", { status: "GREEN" });
            });

            it("should be received by wildcard subscribers", () => {
                expect(wildcardCb).toHaveBeenCalledWith("vehicles", { status: "GREEN" });
            });
        });
    });

    // =========================================================================
    // dispose()
    // =========================================================================

    describe("dispose", () => {
        describe("when dispose is called", () => {
            let client: TrafficClient, cb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                cb = jest.fn();
                fsm.handle(client, "tick"); // init
                fsm.on("transitioning", cb);
                fsm.dispose();
            });

            it("should make handle a no-op", () => {
                fsm.handle(client, "timeout");
                expect(fsm.currentState(client)).toBe("green");
            });

            it("should make transition a no-op", () => {
                fsm.transition(client, "yellow");
                expect(fsm.currentState(client)).toBe("green");
            });

            it("should not emit events after disposal", () => {
                fsm.emit("custom", {});
                expect(cb).not.toHaveBeenCalled();
            });

            it("should return a no-op subscription from on() after disposal", () => {
                const postDisposeCb = jest.fn();
                const sub = fsm.on("transitioned", postDisposeCb);
                // Should not throw when calling off on the no-op subscription
                expect(() => sub.off()).not.toThrow();
                expect(postDisposeCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // exception safety
    // =========================================================================

    describe("exception safety", () => {
        describe("when a handler throws", () => {
            let client: Record<string, unknown>, throwFsm: any;

            beforeEach(() => {
                throwFsm = createBehavioralFsm({
                    id: "throw-test",
                    initialState: "idle",
                    context: {} as Record<string, unknown>,
                    states: {
                        idle: {
                            boom(_args: any) {
                                throw new Error("handler kaboom");
                            },
                            check(_args: any) {
                                // no-op; just need to verify args are clean
                            },
                        },
                    },
                });
                client = {};
            });

            it("should clean up currentActionArgs after a handler throws", () => {
                expect(() => throwFsm.handle(client, "boom", "stale-arg")).toThrow(
                    "handler kaboom"
                );

                // After the throw, calling handle again should work normally
                // and not have stale args leaking into defer()
                expect(() => throwFsm.handle(client, "check")).not.toThrow();
            });
        });
    });

    // =========================================================================
    // compositeState()
    // =========================================================================

    describe("compositeState", () => {
        describe("when the client is unknown", () => {
            let result: string;

            beforeEach(() => {
                result = fsm.compositeState(makeClient());
            });

            it("should return empty string", () => {
                expect(result).toBe("");
            });
        });

        describe("when the client is initialized", () => {
            let client: TrafficClient, result: string;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "tick");
                result = fsm.compositeState(client);
            });

            it("should return the current state name", () => {
                expect(result).toBe("green");
            });
        });
    });

    // =========================================================================
    // canHandle()
    // =========================================================================

    describe("canHandle", () => {
        describe("when the current state has a named handler for the input", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "tick"); // init to green
            });

            it("should return true", () => {
                expect(fsm.canHandle(client, "timeout")).toBe(true);
            });
        });

        describe("when the current state has a catch-all but no named handler", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "timeout"); // green → yellow (has *)
            });

            it("should return true for an unknown input", () => {
                expect(fsm.canHandle(client, "anythingElse")).toBe(true);
            });
        });

        describe("when the current state has no matching handler", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "timeout"); // green → yellow
                fsm.handle(client, "timeout"); // yellow → red (no * and no tick)
            });

            it("should return false", () => {
                expect(fsm.canHandle(client, "tick")).toBe(false);
            });
        });

        describe("when the client has never been seen", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                // do NOT call handle — client is unknown
            });

            it("should check against initialState without initializing the client", () => {
                // green (initialState) has a "timeout" handler
                expect(fsm.canHandle(client, "timeout")).toBe(true);
            });

            it("should not initialize the client as a side effect", () => {
                fsm.canHandle(client, "timeout");
                expect(fsm.currentState(client)).toBeUndefined();
            });
        });

        describe("when the client transitions to a new state", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.handle(client, "timeout"); // green → yellow
                fsm.handle(client, "timeout"); // yellow → red
            });

            it("should reflect the current state after transitions", () => {
                // red has "timeout" but not "tick"
                expect(fsm.canHandle(client, "timeout")).toBe(true);
                expect(fsm.canHandle(client, "tick")).toBe(false);
            });
        });
    });

    // =========================================================================
    // reset()
    // =========================================================================

    describe("reset", () => {
        describe("when the client is in a non-initial state", () => {
            let client: TrafficClient,
                resetFsm: any,
                exitedStates: string[],
                enteredStates: string[];

            beforeEach(() => {
                exitedStates = [];
                enteredStates = [];
                resetFsm = createBehavioralFsm({
                    id: "reset-test",
                    initialState: "idle",
                    states: {
                        idle: {
                            _onEnter({ ctx: _ctx }: any) {
                                enteredStates.push("idle");
                            },
                            _onExit({ ctx: _ctx }: any) {
                                exitedStates.push("idle");
                            },
                            go: "active",
                        },
                        active: {
                            _onEnter({ ctx: _ctx }: any) {
                                enteredStates.push("active");
                            },
                            _onExit({ ctx: _ctx }: any) {
                                exitedStates.push("active");
                            },
                        },
                    },
                });
                client = makeClient();
                resetFsm.handle(client, "go" as any); // idle → active
                enteredStates.length = 0; // clear init noise
                exitedStates.length = 0;
                resetFsm.reset(client);
            });

            it("should transition the client back to initialState", () => {
                expect(resetFsm.currentState(client)).toBe("idle");
            });

            it("should fire _onExit for the current state", () => {
                expect(exitedStates).toContain("active");
            });

            it("should fire _onEnter for initialState", () => {
                expect(enteredStates).toContain("idle");
            });
        });

        describe("when the client is already in initialState", () => {
            let client: TrafficClient, transitioningCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                transitioningCb = jest.fn();
                fsm.handle(client, "tick"); // init to green (initialState)
                fsm.on("transitioning", transitioningCb);
                transitioningCb.mockClear();
                fsm.reset(client);
            });

            it("should be a no-op (same-state check)", () => {
                expect(transitioningCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // nohandler args
    // =========================================================================

    describe("nohandler args", () => {
        describe("when extra args are passed to an unhandled input", () => {
            let nohandlerCb: jest.Mock, client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                // red has no "tick" handler
                fsm.handle(client, "timeout"); // green → yellow
                fsm.handle(client, "timeout"); // yellow → red
                fsm.handle(client, "tick", "extra1", 42);
            });

            it("should include the extra args in the nohandler payload", () => {
                expect(nohandlerCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "tick", args: ["extra1", 42] })
                );
            });
        });
    });

    // =========================================================================
    // createBehavioralFsm()
    // =========================================================================

    describe("createBehavioralFsm", () => {
        describe("when creating an FSM", () => {
            let result: ReturnType<typeof makeTrafficLightFsm>;

            beforeEach(() => {
                result = makeTrafficLightFsm();
            });

            it("should return a BehavioralFsm instance", () => {
                expect(result).toBeInstanceOf(BehavioralFsm);
            });

            it("should expose the configured id", () => {
                expect(result.id).toBe(FSM_ID);
            });
        });
    });

    // =========================================================================
    // Initialization — active (v5-style)
    // =========================================================================

    describe("initialization", () => {
        describe("when a client is first seen via handle()", () => {
            let client: TrafficClient, transitioningCb: jest.Mock, transitionedCb: jest.Mock;

            beforeEach(() => {
                client = makeClient();
                transitioningCb = jest.fn();
                transitionedCb = jest.fn();
                fsm.on("transitioning", transitioningCb);
                fsm.on("transitioned", transitionedCb);
                fsm.handle(client, "tick");
            });

            it("should emit transitioning for the initialization", () => {
                expect(transitioningCb).toHaveBeenCalledWith(
                    expect.objectContaining({ toState: "green", client })
                );
            });

            it("should emit transitioned for the initialization", () => {
                expect(transitionedCb).toHaveBeenCalledWith(
                    expect.objectContaining({ toState: "green", client })
                );
            });

            it("should fire _onEnter for the initial state", () => {
                expect(client.entered).toBe("green");
            });
        });

        describe("when a client is first seen via transition()", () => {
            let client: TrafficClient;

            beforeEach(() => {
                client = makeClient();
                fsm.transition(client, "yellow");
            });

            it("should initialize first, then transition to the target", () => {
                expect(fsm.currentState(client)).toBe("yellow");
            });

            it("should have run through both _onEnter hooks", () => {
                // init fires _onEnter("green"), then transition fires _onEnter("yellow")
                expect(client.entered).toBe("yellow");
            });
        });
    });
});

// =============================================================================
// Hierarchical FSM tests (Tasks 2-5)
// Passes raw BehavioralFsm instances to _child to wire hierarchies.
// =============================================================================

// Shared child FSM type for hierarchy tests
type ChildClient = object;

function makeChildFsm() {
    return createBehavioralFsm({
        id: "child",
        initialState: "off",
        states: {
            off: {
                poweron: "on",
            },
            on: {
                poweroff: "off",
                // "*" handled parent-side
            },
        },
    });
}

describe("BehavioralFsm — hierarchical (Tasks 2-5)", () => {
    // =========================================================================
    // Task 2: ChildLink Adapter + Handle Refactoring
    // =========================================================================

    describe("delegation", () => {
        describe("when the child can handle the input", () => {
            let child: ReturnType<typeof makeChildFsm>,
                parent: any,
                client: ChildClient,
                parentNohandlerCb: jest.Mock;

            beforeEach(() => {
                child = makeChildFsm();
                parentNohandlerCb = jest.fn();
                parent = createBehavioralFsm({
                    id: "parent-delegation",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            // parent does not handle "poweron" — child does
                        },
                        idle: {},
                    },
                });
                client = {};
                parent.on("nohandler", parentNohandlerCb);
                parent.handle(client, "poweron");
            });

            it("should delegate the input to the child", () => {
                expect(child.currentState(client)).toBe("on");
            });

            it("should not emit nohandler on the parent", () => {
                expect(parentNohandlerCb).not.toHaveBeenCalled();
            });
        });

        describe("when the child cannot handle the input but the parent can", () => {
            let child: ReturnType<typeof makeChildFsm>,
                parent: any,
                client: ChildClient,
                parentHandled: boolean;

            beforeEach(() => {
                child = makeChildFsm();
                parentHandled = false;
                parent = createBehavioralFsm({
                    id: "parent-local",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            poweroff() {
                                parentHandled = true;
                            },
                        },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "poweroff"); // child is in "off", has no "poweroff"
            });

            it("should handle the input locally on the parent", () => {
                expect(parentHandled).toBe(true);
            });
        });

        describe("when extra args are passed and delegated", () => {
            let receivedArgs: unknown[], child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                receivedArgs = [];
                child = createBehavioralFsm({
                    id: "args-child",
                    initialState: "waiting",
                    states: {
                        waiting: {
                            data(_args: any, ...extra: unknown[]) {
                                receivedArgs = extra;
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "args-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                parent.handle(client, "data", "arg1", 42);
            });

            it("should preserve extra args through delegation", () => {
                expect(receivedArgs).toEqual(["arg1", 42]);
            });
        });

        describe("when child-originated nohandler bubbles up to parent", () => {
            let child: any, parent: any, client: ChildClient, parentHandled: boolean;

            beforeEach(() => {
                parentHandled = false;
                child = createBehavioralFsm({
                    id: "bubble-child",
                    initialState: "on",
                    states: {
                        on: {
                            // "mystery" not handled here
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "bubble-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            mystery() {
                                parentHandled = true;
                            },
                        },
                    },
                });
                client = {};
                parent.handle(client, "active" as any); // init
                // Directly fire on child to simulate child-originated input
                child.handle(client, "mystery" as any);
            });

            it("should bubble unhandled child input to the parent", () => {
                expect(parentHandled).toBe(true);
            });
        });

        describe("when stale child nohandler fires for client no longer in that state", () => {
            let child: any, parent: any, client: ChildClient, parentNohandlerCb: jest.Mock;

            beforeEach(() => {
                parentNohandlerCb = jest.fn();
                child = createBehavioralFsm({
                    id: "stale-child",
                    initialState: "on",
                    states: {
                        on: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "stale-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            leave: "idle",
                        },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                parent.handle(client, "leave"); // parent moves to idle (no child)
                parent.on("nohandler", parentNohandlerCb);

                // Now fire on child — client is no longer in active (stale)
                child.handle(client, "mystery" as any);
            });

            it("should ignore stale child events", () => {
                expect(parentNohandlerCb).not.toHaveBeenCalled();
            });
        });
    });

    describe("event propagation", () => {
        describe("when child transitions fire, parent relays the events", () => {
            let child: any, parent: any, client: ChildClient, parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "relay-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                parent.on("transitioned", parentTransitionedCb);
                parent.handle(client, "poweron");
            });

            it("should relay child transitioned events through parent", () => {
                expect(parentTransitionedCb).toHaveBeenCalled();
            });
        });

        describe("when child emits a custom event", () => {
            let child: any, parent: any, client: ChildClient, customPayload: unknown;

            beforeEach(() => {
                child = createBehavioralFsm({
                    id: "custom-child",
                    initialState: "idle",
                    states: {
                        idle: {
                            ping({ emit }: any) {
                                emit("PONG", { from: "child" });
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "custom-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                parent.on("*", (evtName: string, data: unknown) => {
                    if (evtName === "PONG") {
                        customPayload = data;
                    }
                });
                parent.handle(client, "ping");
            });

            it("should relay child custom events through the parent emitter", () => {
                expect(customPayload).toEqual({ from: "child" });
            });
        });
    });

    // =========================================================================
    // Task 3: Transition Integration + compositeState + Dispose
    // =========================================================================

    describe("transition integration with _child", () => {
        describe("when entering a state with _child, the child resets to initialState", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "reset-on-enter",
                    initialState: "idle",
                    states: {
                        idle: {
                            activate: "active",
                        },
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                // First, advance child out of initialState manually
                parent.handle(client, "activate"); // idle → active (resets child to off)
                child.handle(client, "poweron"); // child: off → on
                // Now re-enter active (which should reset child back to off)
                parent.transition(client, "idle" as any);
                parent.transition(client, "active" as any);
            });

            it("should reset the child to its initialState when entering", () => {
                expect(child.currentState(client)).toBe("off");
            });
        });

        describe("when re-entering a state with _child", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "reenter-reset",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            leave: "idle",
                        },
                        idle: {
                            return: "active",
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → active (child resets to off)
                child.handle(client, "poweron"); // child: off → on
                parent.handle(client, "leave"); // active → idle
                parent.handle(client, "return"); // idle → active (child resets again)
            });

            it("should reset child again on re-entry", () => {
                expect(child.currentState(client)).toBe("off");
            });
        });
    });

    describe("compositeState", () => {
        describe("when parent is in a state with a child", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "composite-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
            });

            it("should return dotted parent.child state path", () => {
                expect(parent.compositeState(client)).toBe("active.off");
            });

            it("should update the child portion when child transitions", () => {
                child.handle(client, "poweron");
                expect(parent.compositeState(client)).toBe("active.on");
            });
        });

        describe("when parent is in a state without a child", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "no-child-composite",
                    initialState: "idle",
                    states: {
                        idle: {},
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init to idle (no child)
            });

            it("should return just the parent state name", () => {
                expect(parent.compositeState(client)).toBe("idle");
            });
        });

        describe("when multi-level hierarchy (grandparent → parent → child)", () => {
            let grandchild: any, childFsm: any, grandparent: any, client: ChildClient;

            beforeEach(() => {
                grandchild = createBehavioralFsm({
                    id: "grandchild",
                    initialState: "alpha",
                    states: { alpha: {}, beta: {} },
                });
                childFsm = createBehavioralFsm({
                    id: "child",
                    initialState: "x",
                    states: {
                        x: { _child: grandchild },
                        y: {},
                    },
                });
                grandparent = createBehavioralFsm({
                    id: "grandparent",
                    initialState: "top",
                    states: {
                        top: { _child: childFsm },
                    },
                });
                client = {};
                grandparent.handle(client, "noop" as any); // init
            });

            it("should return a three-level dotted path", () => {
                expect(grandparent.compositeState(client)).toBe("top.x.alpha");
            });
        });
    });

    describe("dispose", () => {
        describe("when parent is disposed, child subscriptions are cleaned up", () => {
            let child: any, parent: any, client: ChildClient, parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "dispose-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                parent.on("transitioned", parentTransitionedCb);
                parent.dispose();
                parentTransitionedCb.mockClear();

                // Child still works — but parent should no longer relay its events
                child.handle(client, "poweron");
            });

            it("should not relay child events after dispose", () => {
                expect(parentTransitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when parent dispose cascades to children (default)", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "cascade-dispose-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
            });

            it("should dispose the child FSM", () => {
                parent.dispose();
                const stateBefore = child.compositeState(client);
                child.handle(client, "poweron");
                expect(child.compositeState(client)).toBe(stateBefore);
            });

            it("should make child canHandle return false", () => {
                parent.dispose();
                expect(child.canHandle(client, "poweron")).toBe(false);
            });
        });

        describe("when parent dispose uses preserveChildren: true", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "preserve-children-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
            });

            it("should NOT dispose the child FSM", () => {
                parent.dispose({ preserveChildren: true });
                child.handle(client, "poweron");
                expect(child.compositeState(client)).toBe("on");
            });

            it("should still dispose the parent", () => {
                parent.dispose({ preserveChildren: true });
                const stateBefore = parent.compositeState(client);
                parent.handle(client, "poweron");
                expect(parent.compositeState(client)).toBe(stateBefore);
            });
        });

        describe("when the same child appears in multiple parent states", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "shared-child-parent",
                    initialState: "modeA",
                    states: {
                        modeA: { _child: child },
                        modeB: { _child: child },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
            });

            it("should dispose the child only once (no double-dispose error)", () => {
                expect(() => parent.dispose()).not.toThrow();
                const stateBefore = child.compositeState(client);
                child.handle(client, "poweron");
                expect(child.compositeState(client)).toBe(stateBefore);
            });
        });
    });

    // =========================================================================
    // Task 5: Edge Cases + Multi-Client Scenarios
    // =========================================================================

    describe("multi-client scenarios", () => {
        describe("when two clients are in different parent states with different children", () => {
            let childA: any, childB: any, parent: any, alice: ChildClient, bob: ChildClient;

            beforeEach(() => {
                childA = makeChildFsm();
                childB = createBehavioralFsm({
                    id: "child-b",
                    initialState: "sleeping",
                    states: {
                        sleeping: { wake: "awake" },
                        awake: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "multi-client-parent",
                    initialState: "stateA",
                    states: {
                        stateA: { _child: childA, move: "stateB" },
                        stateB: { _child: childB },
                    },
                });
                alice = {};
                bob = {};
                parent.handle(alice, "noop" as any); // init alice → stateA
                parent.handle(bob, "move"); // init bob → stateA, then → stateB
            });

            it("alice should be in stateA", () => {
                expect(parent.currentState(alice)).toBe("stateA");
            });

            it("bob should be in stateB", () => {
                expect(parent.currentState(bob)).toBe("stateB");
            });

            it("alice child events should not affect bob", () => {
                childA.handle(alice, "poweron");
                expect(childA.currentState(alice)).toBe("on");
                expect(parent.currentState(bob)).toBe("stateB");
            });
        });

        describe("when a client transitions through states with different children", () => {
            let child1: any, child2: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child1 = makeChildFsm();
                child2 = createBehavioralFsm({
                    id: "child2",
                    initialState: "start",
                    states: {
                        start: { go: "end" },
                        end: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "switching-children",
                    initialState: "phase1",
                    states: {
                        phase1: { _child: child1, next: "phase2" },
                        phase2: { _child: child2 },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → phase1, child1 resets to off
                child1.handle(client, "poweron"); // child1: off → on
                parent.handle(client, "next"); // phase1 → phase2, child2 resets to start
            });

            it("child2 should be reset to its initialState", () => {
                expect(child2.currentState(client)).toBe("start");
            });

            it("compositeState should reflect the new child", () => {
                expect(parent.compositeState(client)).toBe("phase2.start");
            });
        });
    });

    describe("three-level delegation and bubbling", () => {
        describe("when input cascades down and up three levels", () => {
            let grandchild: any,
                childFsm: any,
                grandparent: any,
                client: ChildClient,
                grandparentHandled: boolean;

            beforeEach(() => {
                grandparentHandled = false;
                grandchild = createBehavioralFsm({
                    id: "gc",
                    initialState: "a",
                    states: {
                        a: {}, // no handlers
                    },
                });
                childFsm = createBehavioralFsm({
                    id: "c",
                    initialState: "x",
                    states: {
                        x: { _child: grandchild },
                    },
                });
                grandparent = createBehavioralFsm({
                    id: "gp",
                    initialState: "top",
                    states: {
                        top: {
                            _child: childFsm,
                            mystery() {
                                grandparentHandled = true;
                            },
                        },
                    },
                });
                client = {};
                grandparent.handle(client, "noop" as any); // init
                // Trigger mystery on child — grandchild can't handle it, bubbles to child
                // child can't handle it (no handler in x), bubbles to grandparent
                childFsm.handle(client, "mystery" as any);
            });

            it("should bubble up to grandparent and handle there", () => {
                expect(grandparentHandled).toBe(true);
            });
        });
    });

    describe("defer inside child handler", () => {
        describe("when a child handler defers an input", () => {
            let child: any, parent: any, client: ChildClient, replayedInChild: boolean;

            beforeEach(() => {
                replayedInChild = false;
                child = createBehavioralFsm({
                    id: "defer-child",
                    initialState: "waiting",
                    states: {
                        waiting: {
                            proceed({ defer }: any) {
                                defer();
                            },
                            go: "ready",
                        },
                        ready: {
                            proceed() {
                                replayedInChild = true;
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "defer-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                parent.handle(client, "proceed"); // delegated → child defers
                parent.handle(client, "go" as any); // ... wait, "go" is a child input
                // child handles "go": waiting → ready, then replays "proceed"
                child.handle(client, "go");
            });

            it("should replay the deferred input in the child after child transitions", () => {
                expect(replayedInChild).toBe(true);
            });
        });
    });

    describe("disposed child FSM", () => {
        describe("when the child is disposed and parent tries to delegate", () => {
            let child: any, parent: any, client: ChildClient;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "disposed-child-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            poweron() {}, // parent also handles poweron as fallback
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                child.dispose();
            });

            it("should not crash when child is disposed", () => {
                // canHandle() has no disposed guard, so the parent still delegates to the child.
                // The child's handle() sees disposed=true and returns immediately (no-op).
                // The parent's fallback (handleLocally) is NOT reached in this path.
                expect(() => parent.handle(client, "poweron")).not.toThrow();
            });
        });
    });
});

// =============================================================================
// Hierarchical FSM — Hardening Tests (edge cases, failure modes, boundaries)
// =============================================================================

describe("BehavioralFsm — hierarchical hardening", () => {
    // =========================================================================
    // _child input validation
    // =========================================================================

    describe("_child input validation", () => {
        it("null _child is silently ignored", () => {
            const fsm = createBehavioralFsm({
                id: "test",
                initialState: "s",
                states: { s: { _child: null as any, ping() {} } },
            });
            const client = {};
            fsm.handle(client, "ping");
        });
        it("undefined _child is silently ignored", () => {
            const fsm = createBehavioralFsm({
                id: "test",
                initialState: "s",
                states: { s: { _child: undefined as any, ping() {} } },
            });
            const client = {};
            fsm.handle(client, "ping");
        });
        it("number primitive _child throws descriptive error", () => {
            expect(() =>
                createBehavioralFsm({
                    id: "test",
                    initialState: "s",
                    states: { s: { _child: 42 as any, ping() {} } },
                })
            ).toThrow(/expected an Fsm or BehavioralFsm instance/);
        });
        it("string primitive _child throws descriptive error", () => {
            expect(() =>
                createBehavioralFsm({
                    id: "test",
                    initialState: "s",
                    states: { s: { _child: "nope" as any, ping() {} } },
                })
            ).toThrow(/expected an Fsm or BehavioralFsm instance/);
        });
        it("plain object without MACHINA_TYPE throws descriptive error", () => {
            expect(() =>
                createBehavioralFsm({
                    id: "test",
                    initialState: "s",
                    states: { s: { _child: { foo: "bar" } as any, ping() {} } },
                })
            ).toThrow(/expected an Fsm or BehavioralFsm instance/);
        });
    });

    // =========================================================================
    // Exception safety on delegation path
    // =========================================================================

    describe("exception safety on delegation path", () => {
        describe("when child handler throws during delegation", () => {
            let child: any, parent: any, client: ChildClient, thrownError: Error | undefined;

            beforeEach(() => {
                child = createBehavioralFsm({
                    id: "throwing-child",
                    initialState: "on",
                    states: {
                        on: {
                            boom() {
                                throw new Error("child handler exploded");
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "exception-safety-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                try {
                    parent.handle(client, "boom");
                } catch (e: any) {
                    thrownError = e;
                }
            });

            it("should propagate the error from the child handler", () => {
                expect(thrownError).toBeDefined();
                expect(thrownError!.message).toBe("child handler exploded");
            });

            it("should leave the parent state intact", () => {
                expect(parent.currentState(client)).toBe("active");
            });
        });

        describe("when child hits max transition depth during delegation", () => {
            let parent: any, client: ChildClient, thrownError: Error | undefined;

            beforeEach(() => {
                const child = createBehavioralFsm({
                    id: "looping-child",
                    initialState: "idle",
                    states: {
                        idle: { trigger: "a" },
                        a: {
                            _onEnter() {
                                return "b";
                            },
                        },
                        b: {
                            _onEnter() {
                                return "a";
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "depth-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                try {
                    parent.handle(client, "trigger");
                } catch (e: any) {
                    thrownError = e;
                }
            });

            it("should propagate the max-depth error from the child", () => {
                expect(thrownError).toBeDefined();
                expect(thrownError!.message).toContain("Max transition depth");
            });

            it("should leave the parent state intact after the max-depth throw", () => {
                expect(parent.currentState(client)).toBe("active");
            });
        });
    });

    // =========================================================================
    // Disposed child — explicit behavior verification
    // =========================================================================

    describe("disposed child — explicit delegation outcome", () => {
        describe("when child is disposed, canHandle returns false and parent handles locally", () => {
            let child: any, parent: any, client: ChildClient, parentHandlerCalled: boolean;

            beforeEach(() => {
                parentHandlerCalled = false;
                child = makeChildFsm();
                parent = createBehavioralFsm({
                    id: "disposed-behavior-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            poweron() {
                                parentHandlerCalled = true;
                            },
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init
                child.dispose();
                parent.handle(client, "poweron");
            });

            it("should fall through to the parent local handler", () => {
                expect(parentHandlerCalled).toBe(true);
            });

            it("should leave the parent in the same state", () => {
                expect(parent.currentState(client)).toBe("active");
            });
        });
    });

    // =========================================================================
    // Stale event filtering — additional coverage
    // =========================================================================

    describe("stale event filtering — additional coverage", () => {
        describe("when child fires nohandler for a client with no meta in parent", () => {
            let parent: any, parentNohandlerCb: jest.Mock;

            beforeEach(() => {
                parentNohandlerCb = jest.fn();
                const child = createBehavioralFsm({
                    id: "ghost-child",
                    initialState: "on",
                    states: { on: {} },
                });
                parent = createBehavioralFsm({
                    id: "ghost-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                parent.on("nohandler", parentNohandlerCb);
                const unknownClient = {};
                child.handle(unknownClient as any, "mystery" as any);
            });

            it("should not bubble to parent for an uninitialized client", () => {
                expect(parentNohandlerCb).not.toHaveBeenCalled();
            });
        });

        describe("when client is in stateA with child-A, and child-B fires a nohandler", () => {
            let parent: any, client: ChildClient, parentNohandlerCb: jest.Mock;

            beforeEach(() => {
                parentNohandlerCb = jest.fn();
                const childA = createBehavioralFsm({
                    id: "stale-child-a",
                    initialState: "on",
                    states: { on: {} },
                });
                const childB = createBehavioralFsm({
                    id: "stale-child-b",
                    initialState: "on",
                    states: { on: {} },
                });
                parent = createBehavioralFsm({
                    id: "stale-two-child-parent",
                    initialState: "stateA",
                    states: {
                        stateA: { _child: childA },
                        stateB: { _child: childB },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → stateA
                parent.on("nohandler", parentNohandlerCb);
                childB.handle(client, "mystery" as any);
            });

            it("should not bubble child-B event when client is in stateA", () => {
                expect(parentNohandlerCb).not.toHaveBeenCalled();
            });
        });

        describe("when child fires nohandler while client is still in the associated state", () => {
            let parentHandled: boolean;

            beforeEach(() => {
                parentHandled = false;
                const child = createBehavioralFsm({
                    id: "timely-child",
                    initialState: "on",
                    states: { on: {} },
                });
                const parent = createBehavioralFsm({
                    id: "timely-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            mystery() {
                                parentHandled = true;
                            },
                        },
                        idle: {},
                    },
                });
                const client = {};
                parent.handle(client, "noop" as any); // init → active
                child.handle(client, "mystery" as any);
            });

            it("should bubble the child event to parent and handle it", () => {
                expect(parentHandled).toBe(true);
            });
        });
    });

    // =========================================================================
    // Stale non-nohandler event filtering
    //
    // Mirrors the nohandler stale filtering above, but for general events
    // (transitioned, handling, handled, custom). Child events should only
    // propagate through the parent when the client is in a state with that child.
    // =========================================================================

    describe("stale non-nohandler event filtering", () => {
        describe("when client leaves state with child, child transitioned events are not relayed", () => {
            let child: any, parent: any, client: ChildClient, parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = createBehavioralFsm({
                    id: "stale-relay-child",
                    initialState: "off",
                    states: {
                        off: { poweron: "on" },
                        on: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "stale-relay-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child, leave: "idle" },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → active
                parent.handle(client, "leave"); // active → idle (no child)
                parent.on("transitioned", parentTransitionedCb);
                parentTransitionedCb.mockClear();
                // Fire on child while client is in idle
                child.handle(client, "poweron");
            });

            it("should not relay child transitioned event", () => {
                expect(parentTransitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when client is in state with child, child events are relayed", () => {
            let child: any, parent: any, client: ChildClient, parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = createBehavioralFsm({
                    id: "active-relay-child",
                    initialState: "off",
                    states: {
                        off: { poweron: "on" },
                        on: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "active-relay-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → active
                parent.on("transitioned", parentTransitionedCb);
                parentTransitionedCb.mockClear();
                parent.handle(client, "poweron"); // delegated to child: off → on
            });

            it("should relay the child transitioned event", () => {
                expect(parentTransitionedCb).toHaveBeenCalled();
            });
        });

        describe("when client is in stateA with child-A, child-B events are not relayed", () => {
            let childA: any, childB: any, parent: any, client: ChildClient, wildcardCb: jest.Mock;

            beforeEach(() => {
                wildcardCb = jest.fn();
                childA = createBehavioralFsm({
                    id: "relay-filter-child-a",
                    initialState: "on",
                    states: { on: {} },
                });
                childB = createBehavioralFsm({
                    id: "relay-filter-child-b",
                    initialState: "off",
                    states: {
                        off: { poweron: "on" },
                        on: {},
                    },
                });
                parent = createBehavioralFsm({
                    id: "relay-filter-parent",
                    initialState: "stateA",
                    states: {
                        stateA: { _child: childA },
                        stateB: { _child: childB },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → stateA
                parent.on("*", wildcardCb);
                wildcardCb.mockClear();
                // Fire on child-B while client is in stateA (child-A active)
                childB.handle(client, "poweron");
            });

            it("should not relay child-B events through parent", () => {
                expect(wildcardCb).not.toHaveBeenCalled();
            });
        });

        describe("when client leaves child state, child custom events are not relayed", () => {
            let child: any, parent: any, client: ChildClient, customCb: jest.Mock;

            beforeEach(() => {
                customCb = jest.fn();
                child = createBehavioralFsm({
                    id: "stale-custom-child",
                    initialState: "on",
                    states: { on: {} },
                });
                parent = createBehavioralFsm({
                    id: "stale-custom-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child, leave: "idle" },
                        idle: {},
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → active
                parent.handle(client, "leave"); // active → idle
                parent.on("myCustomEvent", customCb);
                child.emit("myCustomEvent", { info: "test" });
            });

            it("should not relay the custom event", () => {
                expect(customCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // Three-level hierarchy — delegation cascade
    // =========================================================================

    describe("three-level hierarchy — canHandle is shallow", () => {
        describe("when middle child has no handler, grandparent falls through to local", () => {
            let grandparent: any, client: ChildClient, grandparentHandled: boolean;

            beforeEach(() => {
                grandparentHandled = false;
                const grandchild = createBehavioralFsm({
                    id: "gc-shallow",
                    initialState: "a",
                    states: {
                        a: { poweron: "b" },
                        b: {},
                    },
                });
                const middle = createBehavioralFsm({
                    id: "middle-shallow",
                    initialState: "x",
                    states: {
                        // middle has _child but no "poweron" handler
                        x: { _child: grandchild },
                    },
                });
                grandparent = createBehavioralFsm({
                    id: "gp-shallow",
                    initialState: "top",
                    states: {
                        top: {
                            _child: middle,
                            poweron() {
                                grandparentHandled = true;
                            },
                        },
                    },
                });
                client = {};
                grandparent.handle(client, "noop" as any); // init
                grandparent.handle(client, "poweron");
            });

            it("should NOT cascade through the middle child to grandchild", () => {
                // canHandle is shallow — middle has no "poweron", so grandparent
                // falls through and handles it locally
                expect(grandparentHandled).toBe(true);
            });
        });

        describe("when each level has a handler, delegation cascades correctly", () => {
            let grandchild: any, grandparent: any, client: ChildClient;

            beforeEach(() => {
                grandchild = createBehavioralFsm({
                    id: "gc-cascade",
                    initialState: "a",
                    states: {
                        a: { poweron: "b" },
                        b: {},
                    },
                });
                const middle = createBehavioralFsm({
                    id: "middle-cascade",
                    initialState: "x",
                    states: {
                        // middle has "poweron" so canHandle → true, then middle's
                        // handle() checks ITS child (grandchild) which also canHandle → true
                        x: {
                            _child: grandchild,
                            poweron: "x", // dummy handler so canHandle returns true
                        },
                    },
                });
                grandparent = createBehavioralFsm({
                    id: "gp-cascade",
                    initialState: "top",
                    states: {
                        top: { _child: middle },
                    },
                });
                client = {};
                grandparent.handle(client, "noop" as any); // init
                grandparent.handle(client, "poweron");
            });

            it("should reach the grandchild via delegation at each level", () => {
                expect(grandchild.currentState(client)).toBe("b");
            });

            it("should reflect the three-level composite state", () => {
                expect(grandparent.compositeState(client)).toBe("top.x.b");
            });
        });
    });

    // =========================================================================
    // Same-state child reset no-op
    // =========================================================================

    describe("child reset when child is already in initialState on re-entry", () => {
        describe("when parent re-enters state and child is already at initialState", () => {
            let parent: any, client: ChildClient, childEnterCount: number;

            beforeEach(() => {
                childEnterCount = 0;
                const child = createBehavioralFsm({
                    id: "counted-child",
                    initialState: "off",
                    states: {
                        off: {
                            _onEnter() {
                                childEnterCount++;
                            },
                        },
                        on: {
                            poweroff: "off",
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "counted-parent",
                    initialState: "idle",
                    states: {
                        idle: { activate: "active" },
                        active: { _child: child, deactivate: "idle" },
                    },
                });
                client = {};
                parent.handle(client, "activate"); // idle → active, child resets to off
                childEnterCount = 0; // clear init noise
                parent.handle(client, "deactivate"); // active → idle
                parent.handle(client, "activate"); // re-enter active; child already in off
            });

            it("should not re-fire child _onEnter (same-state no-op)", () => {
                expect(childEnterCount).toBe(0);
            });

            it("should be in the parent active state", () => {
                expect(parent.currentState(client)).toBe("active");
            });
        });
    });

    // =========================================================================
    // defer() when parent transition changes active child
    // =========================================================================

    describe("defer() interaction when parent moves to state with different child", () => {
        describe("when parent defers an input, then transitions to state with child that handles it", () => {
            let parent: any, client: ChildClient, child2HandledCount: number;

            beforeEach(() => {
                child2HandledCount = 0;
                // child1 does NOT handle "proceed" — so parent falls through
                const child1 = createBehavioralFsm({
                    id: "defer-c1",
                    initialState: "waiting",
                    states: { waiting: {} },
                });
                // child2 DOES handle "proceed"
                const child2 = createBehavioralFsm({
                    id: "defer-c2",
                    initialState: "ready",
                    states: {
                        ready: {
                            proceed() {
                                child2HandledCount++;
                            },
                        },
                    },
                });
                parent = createBehavioralFsm({
                    id: "defer-switching-parent",
                    initialState: "phase1",
                    states: {
                        phase1: {
                            _child: child1,
                            // child1 can't handle "proceed", so parent handles locally and defers
                            proceed({ defer }: any) {
                                defer();
                            },
                            advance: "phase2",
                        },
                        phase2: {
                            _child: child2,
                        },
                    },
                });
                client = {};
                parent.handle(client, "noop" as any); // init → phase1
                parent.handle(client, "proceed"); // child1 can't handle → parent defers
                parent.handle(client, "advance"); // phase1 → phase2, deferred replays
            });

            it("should route the replayed deferred input to child2", () => {
                expect(child2HandledCount).toBe(1);
            });

            it("should remain in phase2 after replay", () => {
                expect(parent.currentState(client)).toBe("phase2");
            });
        });
    });

    // =========================================================================
    // =========================================================================
    // Extra args preserved through child-originated bubbling
    // =========================================================================

    describe("extra args preserved through child-originated bubbling", () => {
        describe("when child fires nohandler with args, parent receives them", () => {
            let receivedArgs: unknown[];

            beforeEach(() => {
                receivedArgs = [];
                const child = createBehavioralFsm({
                    id: "args-bubble-child",
                    initialState: "on",
                    states: { on: {} },
                });
                const parent = createBehavioralFsm({
                    id: "args-bubble-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            mystery(_args: any, ...extra: unknown[]) {
                                receivedArgs = extra;
                            },
                        },
                    },
                });
                const client = {};
                parent.handle(client, "noop" as any); // init
                child.handle(client, "mystery" as any, "kirk", "spock");
            });

            it("should preserve extra args through the bubbling path", () => {
                expect(receivedArgs).toEqual(["kirk", "spock"]);
            });
        });
    });

    // =========================================================================
    // reset() on disposed BehavioralFsm
    // =========================================================================

    describe("BehavioralFsm reset() when disposed", () => {
        describe("when reset is called on a disposed BehavioralFsm", () => {
            let resetFsm: any, client: ChildClient, transitioningCb: jest.Mock;

            beforeEach(() => {
                transitioningCb = jest.fn();
                resetFsm = createBehavioralFsm({
                    id: "disposed-bfsm-reset",
                    initialState: "idle",
                    states: {
                        idle: { go: "active" },
                        active: {},
                    },
                });
                client = {};
                resetFsm.handle(client, "go");
                resetFsm.on("transitioning", transitioningCb);
                resetFsm.dispose();
                transitioningCb.mockClear();
                resetFsm.reset(client);
            });

            it("should be a no-op after disposal", () => {
                expect(transitioningCb).not.toHaveBeenCalled();
            });

            it("should not change state after disposal", () => {
                expect(resetFsm.currentState(client)).toBe("active");
            });
        });
    });

    // =========================================================================
    // ChildLink.instance
    // =========================================================================

    describe("ChildLink.instance", () => {
        describe("when the parent BehavioralFsm has a child FSM", () => {
            let bfsm: any, child: any;

            beforeEach(() => {
                child = makeChildFsm();
                bfsm = createBehavioralFsm({
                    id: "childlink-instance-bfsm",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                            pause: "paused",
                        },
                        paused: { resume: "active" },
                    },
                });
            });

            it("should expose an instance property on the ChildLink", () => {
                const childLink = bfsm.states["active"]._child;
                expect(childLink.instance).toBeDefined();
            });

            it("should reference the original child FSM instance", () => {
                const childLink = bfsm.states["active"]._child;
                expect(childLink.instance).toBe(child);
            });
        });
    });

    // =========================================================================
    // MACHINA_TYPE
    // =========================================================================

    describe("MACHINA_TYPE", () => {
        it("should stamp the instance with the BehavioralFsm type", () => {
            const instance = createBehavioralFsm({
                id: "type-check-bfsm",
                initialState: "a",
                states: { a: {}, b: {} },
            });
            expect((instance as any)[MACHINA_TYPE]).toBe("BehavioralFsm");
        });
    });
});
