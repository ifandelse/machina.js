/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { createBehavioralFsm, BehavioralFsm } from "./behavioral-fsm";
import { createFsm } from "./fsm";
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

        describe("when the curried factory is invoked multiple times", () => {
            const make = createBehavioralFsm<TrafficClient>();
            let fsmOne: ReturnType<typeof make>,
                fsmTwo: ReturnType<typeof make>,
                clientOne: TrafficClient,
                clientTwo: TrafficClient;

            beforeEach(() => {
                fsmOne = make({
                    id: "curried-one",
                    initialState: "green",
                    states: {
                        green: { timeout: "yellow" },
                        yellow: { timeout: "red" },
                        red: { timeout: "green" },
                    },
                });
                fsmTwo = make({
                    id: "curried-two",
                    initialState: "green",
                    states: {
                        green: { timeout: "yellow" },
                        yellow: { timeout: "red" },
                        red: { timeout: "green" },
                    },
                });
                clientOne = makeClient();
                clientTwo = makeClient();
                fsmOne.handle(clientOne, "timeout");
            });

            it("should produce independent BehavioralFsm instances", () => {
                expect(fsmOne).not.toBe(fsmTwo);
            });

            it("should give each construction its own configured id", () => {
                expect(fsmOne.id).toBe("curried-one");
                expect(fsmTwo.id).toBe("curried-two");
            });

            it("should keep per-client state isolated between the two constructions", () => {
                expect(fsmOne.currentState(clientOne)).toBe("yellow");
                expect(fsmTwo.currentState(clientTwo)).toBeUndefined();
            });
        });

        describe("when called with null instead of omitting the argument entirely", () => {
            it("should throw rather than silently returning a curried factory", () => {
                expect(() => (createBehavioralFsm as any)(null)).toThrow(TypeError);
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

// =============================================================================
// setupChildSubscriptions() shared-child dedup
//
// wrapChildLinks() mints a fresh ChildLink wrapper per declaring state, even
// when the SAME underlying Fsm/BehavioralFsm instance is shared across two
// states. setupChildSubscriptions()'s dedup Set was keyed by that wrapper, not
// the underlying instance, so it never matched for a shared child — the exact
// wrapper-vs-instance identity bug collectChildSnapshots() had before its
// #184 fix. Confirmed via exploratory testing against the pre-fix code (see
// dev report for the full write-up): a shared child got TWO subscriptions,
// and while a single client's own events were incidentally filtered down to
// one relay by isChildActiveForClient()'s per-wrapper comparison, a
// client-less relay (an Fsm-child event, or — as exercised below — a
// BehavioralFsm child's custom emit() with no `client` field) genuinely
// double-fired on the parent whenever two different clients were active on
// the child's two different declaring names at once, because each duplicate
// subscription independently walked ALL known clients looking for a match.
// =============================================================================

describe("BehavioralFsm — setupChildSubscriptions() shared-child dedup", () => {
    describe("oracle — subscription count for a child shared under two declaring states", () => {
        let child: any, onSpy: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();

            // Own-property-override spy (not jest.spyOn) on child.on() — lets
            // us tell "subscribed once" apart from "subscribed twice, both
            // producing the same eventual answer." Same rationale as the
            // dehydrateSpy pattern used for the dehydrate() dedup regression
            // test earlier in this file.
            const originalOn = child.on.bind(child);
            onSpy = jest.fn((eventName: string, cb: any) => originalOn(eventName, cb));
            child.on = onSpy;

            createBehavioralFsm({
                id: "sub-dedup-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
        });

        it("should subscribe to the shared child's wildcard event exactly once", () => {
            expect(onSpy).toHaveBeenCalledTimes(1);
            expect(onSpy).toHaveBeenCalledWith("*", expect.any(Function));
        });
    });

    describe("oracle — client-less relay duplication when two clients are active on different declaring names", () => {
        let child: any, parent: any, alice: ChildClient, bob: ChildClient, relayedCb: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createBehavioralFsm({
                id: "sub-dedup-clientless-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            alice = {};
            bob = {};
            parent.handle(alice, "noop" as any); // alice -> modeA
            parent.handle(bob, "switch"); // bob init -> modeA -> switch -> modeB

            relayedCb = jest.fn();
            parent.on("customEvt" as any, relayedCb);

            // A client-less custom event — no `client` field, the same shape
            // an Fsm child's events take. The old per-declaring-state
            // subscriptions each independently walked ALL known clients for
            // this: one matched alice (modeA's declaring name), the other
            // matched bob (modeB's), so ONE underlying child event produced
            // TWO relays on the parent.
            child.emit("customEvt", { note: "one child, one event" });
        });

        it("should relay the single child event to the parent exactly once", () => {
            expect(relayedCb).toHaveBeenCalledTimes(1);
            expect(relayedCb).toHaveBeenCalledWith({ note: "one child, one event" });
        });
    });

    describe("shared child — event relay when the client's active declaring name is the FIRST one iterated (modeA)", () => {
        let child: any, parent: any, alice: ChildClient, transitionedCb: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createBehavioralFsm({
                id: "sub-dedup-modeA-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            alice = {};
            parent.handle(alice, "noop" as any); // alice -> modeA

            transitionedCb = jest.fn();
            parent.on("transitioned", transitionedCb);
            child.handle(alice, "poweron"); // child: off -> on, relayed while alice is at modeA
        });

        it("should forward exactly one transitioned event for the child transition", () => {
            expect(transitionedCb).toHaveBeenCalledTimes(1);
            expect(transitionedCb).toHaveBeenCalledWith(expect.objectContaining({ client: alice }));
        });
    });

    describe("shared child — event relay when the client's active declaring name is a LATER one iterated (modeB)", () => {
        let child: any, parent: any, bob: ChildClient, transitionedCb: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createBehavioralFsm({
                id: "sub-dedup-modeB-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            bob = {};
            parent.handle(bob, "switch"); // bob init -> modeA -> switch -> modeB

            transitionedCb = jest.fn();
            parent.on("transitioned", transitionedCb);
            child.handle(bob, "poweron"); // child: off -> on, relayed while bob is at modeB
        });

        // Regression guard: the single deduped subscription is set up using
        // whichever declaring state's wrapper is encountered FIRST (modeA's).
        // isChildActiveForClient() must compare `.instance`, not the wrapper
        // reference itself — otherwise this exact case (client active on a
        // LATER declaring name) would silently stop relaying once the
        // subscriptions were deduped, since modeB's wrapper is a different
        // object from the one the subscription closure captured.
        it("should still forward exactly one transitioned event, from the later declaring name", () => {
            expect(transitionedCb).toHaveBeenCalledTimes(1);
            expect(transitionedCb).toHaveBeenCalledWith(expect.objectContaining({ client: bob }));
        });
    });

    describe("dispose — shared child subscription is torn down exactly once", () => {
        let child: any,
            parent: any,
            alice: ChildClient,
            bob: ChildClient,
            transitionedCb: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createBehavioralFsm({
                id: "sub-dedup-dispose-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            alice = {};
            bob = {};
            parent.handle(alice, "noop" as any); // alice -> modeA
            parent.handle(bob, "switch"); // bob -> modeB

            transitionedCb = jest.fn();
            parent.on("transitioned", transitionedCb);
            // preserveChildren so the child stays alive and still transitions
            // normally below — isolating "was the PARENT's subscription torn
            // down" from "did cascading child.dispose() just stop it cold."
            parent.dispose({ preserveChildren: true });
            transitionedCb.mockClear();

            child.handle(alice, "poweron");
            child.handle(bob, "poweron");
        });

        it("should not relay any further child events after dispose, for either declaring name", () => {
            expect(transitionedCb).not.toHaveBeenCalled();
        });
    });

    describe("shared child — client-less relay breaks after the first match when two clients share the SAME declaring name", () => {
        let child: any, parent: any, alice: ChildClient, clara: ChildClient, relayedCb: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createBehavioralFsm({
                id: "sub-dedup-same-declaring-name-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            alice = {};
            clara = {};
            parent.handle(alice, "noop" as any); // alice -> modeA
            parent.handle(clara, "noop" as any); // clara -> modeA too (same declaring name)

            relayedCb = jest.fn();
            parent.on("customEvt" as any, relayedCb);

            // Both alice and clara would independently satisfy isChildActiveForClient()'s
            // check for modeA — the "walk known clients, break on first match" loop
            // (behavioral-fsm.ts's relay branch) must still fire exactly once, not
            // once per matching client.
            child.emit("customEvt", { note: "one child, one event, two eligible clients" });
        });

        it("should relay the single child event to the parent exactly once", () => {
            expect(relayedCb).toHaveBeenCalledTimes(1);
            expect(relayedCb).toHaveBeenCalledWith({
                note: "one child, one event, two eligible clients",
            });
        });
    });

    describe("a surviving shared child (preserveChildren dispose) is picked up correctly by a brand-new, unrelated parent FSM", () => {
        let child: any, parent1: any, parent2: any, alice: ChildClient, bob: ChildClient;
        let transitionedCb1: jest.Mock, transitionedCb2: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();
            parent1 = createBehavioralFsm({
                id: "sub-dedup-lifecycle-parent1",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            alice = {};
            parent1.handle(alice, "noop" as any); // alice -> modeA

            transitionedCb1 = jest.fn();
            parent1.on("transitioned", transitionedCb1);

            // preserveChildren so the child (and its state) survives parent1's
            // teardown — parent1's OWN subscription must still go away, though.
            parent1.dispose({ preserveChildren: true });

            // A completely independent second parent, constructed AFTER parent1's
            // dispose, reusing the same still-alive child instance. Its own
            // setupChildSubscriptions() call must produce a working subscription
            // regardless of parent1's now-torn-down one.
            parent2 = createBehavioralFsm({
                id: "sub-dedup-lifecycle-parent2",
                initialState: "solo",
                states: { solo: { _child: child } },
            });
            bob = {};
            parent2.handle(bob, "noop" as any); // bob -> solo

            transitionedCb2 = jest.fn();
            parent2.on("transitioned", transitionedCb2);

            child.handle(bob, "poweron");
        });

        it("should relay the child event to the new parent exactly once", () => {
            expect(transitionedCb2).toHaveBeenCalledTimes(1);
            expect(transitionedCb2).toHaveBeenCalledWith(expect.objectContaining({ client: bob }));
        });

        it("should not relay anything through the disposed parent's stale subscription", () => {
            expect(transitionedCb1).not.toHaveBeenCalled();
        });
    });
});

// =============================================================================
// dispose() shared-child cascade dedup
//
// Same wrapper-vs-instance identity bug shape as the subscription dedup above,
// in dispose()'s cascade loop. Double-dispose was harmless (child.dispose() is
// idempotent), so this pins call-count hygiene, not a behavior fix.
// =============================================================================

describe("BehavioralFsm — dispose() shared-child cascade dedup", () => {
    describe("when the same child instance is declared under two parent states", () => {
        let child: any, disposeSpy: jest.Mock;

        beforeEach(() => {
            child = makeChildFsm();

            // Own-property-override spy (not jest.spyOn) on child.dispose() —
            // same rationale as the subscription-count oracle above: "disposed
            // once" and "disposed twice, second a no-op" are indistinguishable
            // by observable child state, only by call count.
            const originalDispose = child.dispose.bind(child);
            disposeSpy = jest.fn((...args: unknown[]) => originalDispose(...args));
            child.dispose = disposeSpy;

            const parent = createBehavioralFsm({
                id: "dispose-dedup-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });

            parent.dispose();
        });

        it("should cascade-dispose the shared child exactly once", () => {
            expect(disposeSpy).toHaveBeenCalledTimes(1);
        });
    });
});

// =============================================================================
// rehydrate() tests
// =============================================================================

describe("BehavioralFsm — rehydrate()", () => {
    // =========================================================================
    // Task 3: Basic flat rehydration
    // =========================================================================

    describe("flat rehydration — known state", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-flat",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: { pause: "paused", stop: "idle" },
                    paused: { resume: "running", stop: "idle" },
                },
            });
            client = {};
            fsm.rehydrate(client, "paused");
        });

        it("should place the client at the specified state", () => {
            expect(fsm.currentState(client)).toBe("paused");
        });

        it("should return the state via compositeState", () => {
            expect(fsm.compositeState(client)).toBe("paused");
        });
    });

    describe("flat rehydration — no _onEnter fires", () => {
        let fsm: any, client: ChildClient, transitionedCb: jest.Mock;

        beforeEach(() => {
            transitionedCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "rehydrate-no-hooks",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {
                        _onEnter({ ctx }: any) {
                            (ctx as any).entered = true;
                        },
                    },
                },
            });
            client = {};
            fsm.on("transitioned", transitionedCb);
            fsm.rehydrate(client, "running");
        });

        it("should not fire _onEnter for the rehydrated state", () => {
            expect((client as any).entered).toBeUndefined();
        });

        it("should not emit the transitioned event", () => {
            expect(transitionedCb).not.toHaveBeenCalled();
        });

        it("should not emit the transitioning event", () => {
            // No transitioning subscription test — just verify transitioned above.
            // The transitioning event is emitted by the same path, so absence of
            // transitioned is sufficient evidence. This assertion guards the state.
            expect(fsm.currentState(client)).toBe("running");
        });
    });

    describe("flat rehydration — handle() proceeds from rehydrated state", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-and-handle",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: { pause: "paused", stop: "idle" },
                    paused: { resume: "running", stop: "idle" },
                },
            });
            client = {};
            fsm.rehydrate(client, "paused");
            fsm.handle(client, "resume");
        });

        it("should transition from the rehydrated state on handle()", () => {
            expect(fsm.currentState(client)).toBe("running");
        });
    });

    describe("flat rehydration — duplicate call overwrites state", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-overwrite",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {},
                    paused: {},
                },
            });
            client = {};
            fsm.rehydrate(client, "running");
            fsm.rehydrate(client, "paused");
        });

        it("should reflect the second rehydration call", () => {
            expect(fsm.currentState(client)).toBe("paused");
        });
    });

    describe("disposed FSM — rehydrate is a no-op", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-disposed",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {},
                },
            });
            client = {};
            fsm.dispose();
            fsm.rehydrate(client, "running");
        });

        it("should not throw", () => {
            // If we reach this point the no-op path ran cleanly
            expect(true).toBe(true);
        });

        it("should leave the client unregistered (currentState returns undefined)", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    // =========================================================================
    // Composite (hierarchical) rehydration — 2 levels
    // =========================================================================

    describe("composite rehydration — 2 levels", () => {
        let child: any, parent: any, client: ChildClient;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "rehydrate-child-2",
                initialState: "off",
                states: {
                    off: { poweron: "on" },
                    on: { poweroff: "off" },
                },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-parent-2",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: { _child: child, deactivate: "idle" },
                },
            });
            client = {};
            parent.rehydrate(client, "active.on");
        });

        it("should place the parent at the first segment", () => {
            expect(parent.currentState(client)).toBe("active");
        });

        it("should place the child at the second segment", () => {
            expect(child.currentState(client)).toBe("on");
        });

        it("compositeState should return the full dot-path", () => {
            expect(parent.compositeState(client)).toBe("active.on");
        });
    });

    describe("composite rehydration — 3 levels", () => {
        let grandchild: any, childFsm: any, grandparent: any, client: ChildClient;

        beforeEach(() => {
            grandchild = createBehavioralFsm({
                id: "rehydrate-gc-3",
                initialState: "alpha",
                states: {
                    alpha: { next: "beta" },
                    beta: {},
                },
            });
            childFsm = createBehavioralFsm({
                id: "rehydrate-child-3",
                initialState: "x",
                states: {
                    x: { _child: grandchild, jump: "y" },
                    y: {},
                },
            });
            grandparent = createBehavioralFsm({
                id: "rehydrate-gp-3",
                initialState: "top",
                states: {
                    top: { _child: childFsm },
                },
            });
            client = {};
            grandparent.rehydrate(client, "top.x.beta");
        });

        it("should place the grandparent at the first segment", () => {
            expect(grandparent.currentState(client)).toBe("top");
        });

        it("should place the child at the second segment", () => {
            expect(childFsm.currentState(client)).toBe("x");
        });

        it("should place the grandchild at the third segment", () => {
            expect(grandchild.currentState(client)).toBe("beta");
        });

        it("compositeState should return the full three-level dot-path", () => {
            expect(grandparent.compositeState(client)).toBe("top.x.beta");
        });
    });

    // =========================================================================
    // Task 4: Error cases
    // =========================================================================

    describe("invalid state name", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-invalid-state",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {},
                },
            });
            try {
                fsm.rehydrate({}, "nonexistent");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw an error", () => {
            expect(thrownError).toBeDefined();
        });

        it("should include the bad state name in the message", () => {
            expect(thrownError!.message).toContain("nonexistent");
        });

        it("should include the FSM id in the message", () => {
            expect(thrownError!.message).toContain("rehydrate-invalid-state");
        });
    });

    describe("composite path with no _child on the matching state", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-no-child",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {}, // no _child
                },
            });
            try {
                fsm.rehydrate({}, "running.sub");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw an error", () => {
            expect(thrownError).toBeDefined();
        });

        it("should include the state name in the message", () => {
            expect(thrownError!.message).toContain("running");
        });

        it("should include the composite path in the message", () => {
            expect(thrownError!.message).toContain("running.sub");
        });
    });

    describe("composite path into an Fsm child", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "rehydrate-fsm-child",
                initialState: "on",
                states: {
                    on: { poweroff: "off" },
                    off: { poweron: "on" },
                },
            });
            fsm = createBehavioralFsm({
                id: "rehydrate-fsm-parent",
                initialState: "active",
                states: {
                    active: { _child: fsmChild as any },
                },
            });
            try {
                fsm.rehydrate({}, "active.off");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw an error", () => {
            expect(thrownError).toBeDefined();
        });

        it("should include a message about Fsm children not supporting rehydration", () => {
            expect(thrownError!.message).toContain("cannot rehydrate an Fsm child");
        });
    });

    // =========================================================================
    // Task 5: knownClients tracking — nohandler bubbling after rehydrate
    // =========================================================================

    describe("knownClients tracking — nohandler bubbles after rehydrate", () => {
        let child: any, parent: any, client: ChildClient, parentNohandlerCb: jest.Mock;

        beforeEach(() => {
            parentNohandlerCb = jest.fn();
            child = createBehavioralFsm({
                id: "rehydrate-bubble-child",
                initialState: "running",
                states: {
                    running: {}, // no handlers — everything triggers nohandler
                },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-bubble-parent",
                initialState: "idle",
                states: {
                    idle: {},
                    active: {
                        _child: child,
                        mystery() {},
                    },
                },
            });
            client = {};
            parent.on("nohandler", parentNohandlerCb);
            // Rehydrate instead of going through normal initialization
            parent.rehydrate(client, "active");
            // Send an input the child cannot handle — should bubble to parent,
            // which also has no handler for it → parent emits nohandler
            parent.handle(client, "unknownInput" as any);
        });

        it("should bubble the nohandler event to the parent", () => {
            expect(parentNohandlerCb).toHaveBeenCalledTimes(1);
        });

        it("should include the original input name in the nohandler payload", () => {
            expect(parentNohandlerCb).toHaveBeenCalledWith(
                expect.objectContaining({ inputName: "unknownInput" })
            );
        });
    });

    describe("transitioning event — direct spy confirms suppression during rehydrate", () => {
        let fsm: any, client: ChildClient, transitioningCb: jest.Mock, transitionedCb: jest.Mock;

        beforeEach(() => {
            transitioningCb = jest.fn();
            transitionedCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "rehydrate-event-spy",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {},
                },
            });
            client = {};
            fsm.on("transitioning", transitioningCb);
            fsm.on("transitioned", transitionedCb);
            fsm.rehydrate(client, "running");
        });

        it("should not emit the transitioning event", () => {
            expect(transitioningCb).not.toHaveBeenCalled();
        });

        it("should not emit the transitioned event", () => {
            expect(transitionedCb).not.toHaveBeenCalled();
        });
    });

    describe("partial registration after mid-rehydration throw — no _child on state", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "rehydrate-partial-no-child",
                initialState: "idle",
                states: {
                    idle: {},
                    running: {}, // no _child, but we'll request a composite path into it
                },
            });
            client = {};
            try {
                fsm.rehydrate(client, "running.substate");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw", () => {
            expect(thrownError).toBeDefined();
        });

        it("should NOT leave the client registered in the parent WeakMap", () => {
            // Writes happen children-first: the parent validates and delegates
            // to the child before writing its own ClientMeta. A throw in the
            // child means the parent never writes — no half-registered client.
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("partial registration after mid-rehydration throw — Fsm child throws", () => {
        let parent: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            const fsmChild = createFsm({
                id: "rehydrate-partial-fsm-child",
                initialState: "on",
                states: {
                    on: {},
                    off: {},
                },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-partial-parent",
                initialState: "idle",
                states: {
                    idle: {},
                    active: { _child: fsmChild as any },
                },
            });
            client = {};
            try {
                parent.rehydrate(client, "active.off");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw from the Fsm child", () => {
            expect(thrownError).toBeDefined();
        });

        it("should NOT leave the client registered in the parent WeakMap", () => {
            // Writes happen children-first: the child's rehydrate() throw
            // prevents the parent from ever writing its own ClientMeta.
            expect(parent.currentState(client)).toBeUndefined();
        });
    });

    describe("deferred queue is empty after rehydrate and functions normally", () => {
        let fsm: any, client: ChildClient, handledCb: jest.Mock;

        beforeEach(() => {
            handledCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "rehydrate-deferred",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: {
                        pause({ defer }: any) {
                            defer();
                        },
                        resume: "running",
                    },
                    paused: { resume: "running" },
                },
            });
            client = {};
            // Rehydrate directly into "running" then defer an input
            fsm.rehydrate(client, "running");
            fsm.on("handled", handledCb);
            // Defer "resume" while in "running"
            fsm.handle(client, "pause");
            // Transition to "paused" — deferred "pause" should replay in "running"
            // after transition, but "paused" has a "resume" which will run the deferred input
            // Actually: defer() queues the current input ("pause") for replay after next transition.
            // After handle("pause") defers, we need a transition to trigger replay.
            // "pause" handler only calls defer() — no transition returned, so we stay in "running".
            // We force a transition via the string shorthand to trigger processQueue.
            fsm.handle(client, "resume"); // triggers processQueue which replays "pause" → defer again
        });

        it("should start with an empty deferred queue after rehydrate (no phantom replays)", () => {
            // If rehydrate had left stale queue entries, "pause" would replay unexpectedly.
            // "handled" should only have been called for the two explicit handle() calls.
            expect(handledCb).toHaveBeenCalledTimes(2);
        });
    });
});

// =============================================================================
// Exploratory: in-memory reset/replay oracle for off-path children
//
// These tests exercise ONLY existing engine behavior (handle/transition) —
// no dehydrate()/rehydrate() involved. They pin down what happens, purely
// in-memory, when a parent re-enters a state whose child was left in a
// non-initial state with a pending deferral. That behavior is the oracle a
// round-tripped (dehydrate → rehydrate) client must reproduce exactly for
// "restored is indistinguishable from never-left-memory" to hold.
//
// Run/read these BEFORE the dehydrate()/rehydrate(snapshot) suites below.
// =============================================================================

describe("BehavioralFsm — child reset/replay oracle (exploratory, in-memory only)", () => {
    describe("when the parent re-enters a state whose child left a non-initial state", () => {
        let parent: any, child: any, client: ChildClient, childExitedFrom: string;

        beforeEach(() => {
            childExitedFrom = "";
            child = createBehavioralFsm({
                id: "oracle-child",
                initialState: "off",
                states: {
                    off: { poweron: "on" },
                    on: {
                        _onExit() {
                            childExitedFrom = "on";
                        },
                        poweroff: "off",
                    },
                },
            });
            parent = createBehavioralFsm({
                id: "oracle-parent",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: { _child: child, deactivate: "idle" },
                },
            });
            client = {};
            parent.handle(client, "activate"); // idle → active, child resets to off (no-op, already off)
            child.handle(client, "poweron"); // child: off → on
            parent.handle(client, "deactivate"); // active → idle — child left "on", now off-path
            parent.handle(client, "activate"); // idle → active again — child reset fires stale on:_onExit
        });

        it("should fire the stale state's _onExit during the reset transition", () => {
            expect(childExitedFrom).toBe("on");
        });

        it("should land the child back at its initialState", () => {
            expect(child.currentState(client)).toBe("off");
        });
    });

    describe("when the off-path child has a deferred input targeting its initialState", () => {
        let parent: any, child: any, client: ChildClient, pingReplayed: boolean;

        beforeEach(() => {
            pingReplayed = false;
            child = createBehavioralFsm({
                id: "oracle-defer-child",
                initialState: "off",
                states: {
                    off: {
                        poweron: "on",
                        ping() {
                            pingReplayed = true;
                        },
                    },
                    on: {
                        poweroff: "off",
                        ping({ defer }: any) {
                            defer({ until: "off" });
                        },
                    },
                },
            });
            parent = createBehavioralFsm({
                id: "oracle-defer-parent",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: { _child: child, deactivate: "idle" },
                },
            });
            client = {};
            parent.handle(client, "activate"); // idle → active, child resets to off
            child.handle(client, "poweron"); // child: off → on
            child.handle(client, "ping"); // deferred until "off"
            parent.handle(client, "deactivate"); // active → idle — child left "on" with a pending deferral
            parent.handle(client, "activate"); // idle → active — child reset (on → off) replays "ping"
        });

        it("should replay the deferred input on the reset transition", () => {
            expect(pingReplayed).toBe(true);
        });

        it("should end up at the child's initialState after replay", () => {
            expect(child.currentState(client)).toBe("off");
        });
    });

    // Same-state reset no-op (skipping _onEnter) is already pinned by the
    // "child reset when child is already in initialState on re-entry" suite
    // above — not duplicated here.
});

// =============================================================================
// dehydrate() tests
// =============================================================================

describe("BehavioralFsm — dehydrate()", () => {
    describe("flat FSM, no deferrals", () => {
        let fsm: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "dehydrate-flat",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: {},
                },
            });
            client = {};
            fsm.handle(client, "start"); // idle → running
            snapshot = fsm.dehydrate(client);
        });

        it("should return the state and an empty deferred queue with no children entry", () => {
            expect(snapshot).toEqual({ state: "running", deferred: [] });
        });
    });

    describe("when the client has never been seen", () => {
        let fsm: any, result: any;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "dehydrate-never-seen",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            result = fsm.dehydrate({});
        });

        it("should return undefined", () => {
            expect(result).toBeUndefined();
        });

        it("should not initialize the client as a side effect", () => {
            const client = {};
            fsm.dehydrate(client);
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("pending deferrals — untargeted and targeted", () => {
        let fsm: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "dehydrate-deferred",
                initialState: "idle",
                states: {
                    idle: {
                        wait({ defer }: any) {
                            defer();
                        },
                        save({ defer }: any) {
                            defer({ until: "archived" });
                        },
                        start: "running",
                    },
                    running: {},
                    archived: {},
                },
            });
            client = {};
            fsm.handle(client, "wait", "kirk");
            fsm.handle(client, "save", { id: 8675309 });
            snapshot = fsm.dehydrate(client);
        });

        it("should capture both deferred inputs with inputName, args, and untilState", () => {
            expect(snapshot).toEqual({
                state: "idle",
                deferred: [
                    { inputName: "wait", args: ["kirk"] },
                    { inputName: "save", args: [{ id: 8675309 }], untilState: "archived" },
                ],
            });
        });
    });

    describe("non-serializable deferred args", () => {
        describe("when an untargeted deferred input has a function arg", () => {
            let fsm: any, client: ChildClient, thrownError: Error | undefined;

            beforeEach(() => {
                fsm = createBehavioralFsm({
                    id: "cart",
                    initialState: "browsing",
                    states: {
                        browsing: {
                            retry({ defer }: any) {
                                defer();
                            },
                        },
                    },
                });
                client = {};
                fsm.handle(client, "retry", "ignored", { onComplete: () => "boom" });
                try {
                    fsm.dehydrate(client);
                } catch (e: any) {
                    thrownError = e;
                }
            });

            it("should throw naming the input, the FSM id, and the exact value path", () => {
                expect(thrownError).toBeDefined();
                expect(thrownError!.message).toBe(
                    'dehydrate: deferred input "retry" in FSM "cart" has a non-serializable ' +
                        "value at args[1].onComplete (function)"
                );
            });
        });

        describe("when a targeted deferred input has a circular reference", () => {
            let fsm: any, client: ChildClient, thrownError: Error | undefined;

            beforeEach(() => {
                const circular: Record<string, unknown> = { name: "Cal Zone" };
                circular.self = circular;
                fsm = createBehavioralFsm({
                    id: "cart",
                    initialState: "browsing",
                    states: {
                        browsing: {
                            retry({ defer }: any) {
                                defer({ until: "connected" });
                            },
                        },
                    },
                });
                client = {};
                fsm.handle(client, "retry", circular);
                try {
                    fsm.dehydrate(client);
                } catch (e: any) {
                    thrownError = e;
                }
            });

            it("should include the until-target in the error message", () => {
                expect(thrownError).toBeDefined();
                expect(thrownError!.message).toBe(
                    'dehydrate: deferred input "retry" (until "connected") in FSM "cart" ' +
                        "has a non-serializable value at args[0].self (circular reference)"
                );
            });
        });
    });

    describe("deeply nested plain objects/arrays/null pass the walk", () => {
        let fsm: any, client: ChildClient, snapshot: any, payload: Record<string, unknown>;

        beforeEach(() => {
            payload = {
                name: "Cal Zone",
                tags: ["geeky", null, "playful"],
                address: { city: "Springfield", nested: { deep: [1, 2, { ok: true }] } },
            };
            fsm = createBehavioralFsm({
                id: "dehydrate-nested",
                initialState: "idle",
                states: {
                    idle: {
                        wait({ defer }: any) {
                            defer();
                        },
                    },
                },
            });
            client = {};
            fsm.handle(client, "wait", payload);
            snapshot = fsm.dehydrate(client);
        });

        it("should clone the nested structure without throwing", () => {
            expect(snapshot.deferred[0].args[0]).toEqual(payload);
        });
    });

    describe("hierarchy — nested snapshot across 3 levels", () => {
        let grandchild: any, childFsm: any, grandparent: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            grandchild = createBehavioralFsm({
                id: "dehydrate-gc",
                initialState: "alpha",
                states: {
                    alpha: { next: "beta" },
                    beta: {
                        hold({ defer }: any) {
                            defer();
                        },
                    },
                },
            });
            childFsm = createBehavioralFsm({
                id: "dehydrate-child",
                initialState: "x",
                states: {
                    x: { _child: grandchild, jump: "y" },
                    y: {},
                },
            });
            grandparent = createBehavioralFsm({
                id: "dehydrate-gp",
                initialState: "top",
                states: {
                    top: { _child: childFsm },
                },
            });
            client = {};
            grandparent.handle(client, "noop" as any); // init cascades: top → x → alpha
            grandchild.handle(client, "next"); // alpha → beta
            grandchild.handle(client, "hold"); // defer "hold", untargeted, while in beta
            snapshot = grandparent.dehydrate(client);
        });

        it("should produce a fully nested snapshot matching the active hierarchy", () => {
            expect(snapshot).toEqual({
                state: "top",
                deferred: [],
                children: {
                    top: {
                        state: "x",
                        deferred: [],
                        children: {
                            x: {
                                state: "beta",
                                deferred: [{ inputName: "hold", args: [] }],
                            },
                        },
                    },
                },
            });
        });
    });

    describe("off-path child meta", () => {
        let child: any, parent: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "dehydrate-offpath-child",
                initialState: "off",
                states: {
                    off: { poweron: "on" },
                    on: {
                        poweroff: "off",
                        ping({ defer }: any) {
                            defer({ until: "off" });
                        },
                    },
                },
            });
            parent = createBehavioralFsm({
                id: "dehydrate-offpath-parent",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: { _child: child, deactivate: "idle" },
                },
            });
            client = {};
            parent.handle(client, "activate"); // idle → active, child resets to off
            child.handle(client, "poweron"); // child: off → on
            child.handle(client, "ping"); // deferred until "off"
            parent.handle(client, "deactivate"); // active → idle — child now off-path
            snapshot = parent.dehydrate(client);
        });

        it("should capture the parent's own state as idle with no deferrals", () => {
            expect(snapshot.state).toBe("idle");
            expect(snapshot.deferred).toEqual([]);
        });

        it("should capture the off-path child's state and pending deferral under its declaring state", () => {
            expect(snapshot.children).toEqual({
                active: {
                    state: "on",
                    deferred: [{ inputName: "ping", args: [], untilState: "off" }],
                },
            });
        });
    });

    describe("shared child instance under two parent states", () => {
        let child: any, parent: any, client: ChildClient, snapshot: any, dehydrateSpy: jest.Mock;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "dehydrate-shared-child",
                initialState: "off",
                states: {
                    off: { poweron: "on" },
                    on: {},
                },
            });
            parent = createBehavioralFsm({
                id: "dehydrate-shared-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child, switch: "modeB" },
                    modeB: { _child: child },
                },
            });
            client = {};
            parent.handle(client, "noop" as any); // init → modeA, child resets to off
            child.handle(client, "poweron"); // child: off → on

            // Wrap child.dehydrate() (an own-property override, not jest.spyOn —
            // this codebase doesn't use spyOn) so we can verify the dedup cache
            // actually prevents a second walk of the shared child's subtree.
            // Output equality alone can't distinguish "dedup'd" from "walked
            // twice, got the same answer both times."
            const originalDehydrate = child.dehydrate.bind(child);
            dehydrateSpy = jest.fn((c: ChildClient) => originalDehydrate(c));
            child.dehydrate = dehydrateSpy;

            snapshot = parent.dehydrate(client);
        });

        it("should emit one identical snapshot under both declaring state names", () => {
            expect(snapshot.children.modeA).toEqual({ state: "on", deferred: [] });
            expect(snapshot.children.modeB).toEqual({ state: "on", deferred: [] });
        });

        it("should dehydrate the shared child instance only once", () => {
            expect(dehydrateSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("Fsm child on the active path", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "dehydrate-fsm-child",
                initialState: "on",
                states: {
                    on: { poweroff: "off" },
                    off: { poweron: "on" },
                },
            });
            fsm = createBehavioralFsm({
                id: "dehydrate-fsm-parent",
                initialState: "active",
                states: {
                    active: { _child: fsmChild as any },
                },
            });
            const client = {};
            fsm.handle(client, "noop" as any); // init
            try {
                fsm.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw, consistent with rehydrate()", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot dehydrate an Fsm child");
        });
    });

    describe("Fsm child on a never-visited branch", () => {
        let fsm: any,
            safeClient: ChildClient,
            riskyClient: ChildClient,
            safeSnapshot: any,
            thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "dehydrate-offpath-fsm-child",
                initialState: "on",
                states: {
                    on: { poweroff: "off" },
                    off: { poweron: "on" },
                },
            });
            fsm = createBehavioralFsm({
                id: "dehydrate-offpath-fsm-parent",
                initialState: "idle",
                states: {
                    idle: { go: "running", detour: "weird" },
                    running: {},
                    weird: { _child: fsmChild as any },
                },
            });

            safeClient = {};
            fsm.handle(safeClient, "go"); // idle → running; "weird" never touched

            riskyClient = {};
            fsm.handle(riskyClient, "detour"); // idle → weird; Fsm child now on-path

            safeSnapshot = fsm.dehydrate(safeClient);
            try {
                fsm.dehydrate(riskyClient);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should not throw for a client that never touched the Fsm-child branch", () => {
            expect(safeSnapshot).toEqual({ state: "running", deferred: [] });
        });

        it("should still throw for a client actually on the Fsm-child branch", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot dehydrate an Fsm child");
        });
    });

    describe("Fsm grandchild nested under an off-path BehavioralFsm child", () => {
        let parent: any, client: ChildClient, snapshot: any, thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "dehydrate-nested-fsm-leaf",
                initialState: "leafA",
                states: {
                    leafA: { go: "leafB" },
                    leafB: {},
                },
            });
            const midChild = createBehavioralFsm({
                id: "dehydrate-nested-mid",
                initialState: "midInit",
                states: {
                    midInit: { go: "midActive" },
                    midActive: { _child: fsmChild as any },
                },
            });
            parent = createBehavioralFsm({
                id: "dehydrate-nested-parent",
                initialState: "start",
                states: {
                    start: { go: "branch" },
                    branch: { _child: midChild as any, leave: "elsewhere" },
                    elsewhere: {},
                },
            });

            client = {};
            parent.handle(client, "go"); // start -> branch; mid resets to midInit
            parent.handle(client, "go"); // delegates to mid: midInit -> midActive (declares the Fsm leaf)
            parent.handle(client, "leave"); // branch -> elsewhere; mid is now off-path, frozen at midActive

            try {
                snapshot = parent.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should not throw even though the frozen mid child sits at its Fsm-declaring state", () => {
            expect(thrownError).toBeUndefined();
        });

        it("should still capture the off-path mid child's own state", () => {
            expect(snapshot).toEqual({
                state: "elsewhere",
                deferred: [],
                children: {
                    branch: {
                        state: "midActive",
                        deferred: [],
                    },
                },
            });
        });
    });

    describe("Fsm grandchild nested under an actively-traversed BehavioralFsm child", () => {
        let parent: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "dehydrate-nested-active-fsm-leaf",
                initialState: "leafA",
                states: {
                    leafA: { go: "leafB" },
                    leafB: {},
                },
            });
            const midChild = createBehavioralFsm({
                id: "dehydrate-nested-active-mid",
                initialState: "midInit",
                states: {
                    midInit: { go: "midActive" },
                    midActive: { _child: fsmChild as any },
                },
            });
            parent = createBehavioralFsm({
                id: "dehydrate-nested-active-parent",
                initialState: "start",
                states: {
                    start: { go: "branch" },
                    branch: { _child: midChild as any, leave: "elsewhere" },
                    elsewhere: {},
                },
            });

            client = {};
            parent.handle(client, "go"); // start -> branch; mid resets to midInit
            parent.handle(client, "go"); // delegates to mid: midInit -> midActive (declares the Fsm leaf)
            // No "leave" — the client stays on the branch, so mid (and its Fsm leaf) is live.

            try {
                parent.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should still throw when the branch is actually being traversed", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot dehydrate an Fsm child");
        });
    });

    describe("shared BehavioralFsm child declaring an Fsm leaf, non-active declaring name listed first", () => {
        let parent: any,
            client: ChildClient,
            activeComposite: string,
            thrownError: Error | undefined;

        beforeEach(() => {
            const leaf = createFsm({
                id: "dehydrate-shared-order-leaf",
                initialState: "leafA",
                states: { leafA: { go: "leafB" }, leafB: {} },
            });
            const child = createBehavioralFsm({
                id: "dehydrate-shared-order-child",
                initialState: "off",
                states: {
                    off: { poweron: "hot" },
                    hot: { _child: leaf as any },
                },
            });
            // "modeB" (never entered by this client) is declared BEFORE "modeA"
            // (the client's genuinely active state) in the object literal.
            parent = createBehavioralFsm({
                id: "dehydrate-shared-order-parent-b-first",
                initialState: "modeA",
                states: {
                    modeB: { _child: child as any },
                    modeA: { _child: child as any, leave: "modeB" },
                },
            });

            client = {};
            parent.handle(client, "noop" as any); // init -> modeA
            child.handle(client, "poweron"); // child: off -> hot (declares the Fsm leaf)
            activeComposite = parent.compositeState(client);

            try {
                parent.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should confirm the client is genuinely active on the Fsm-leaf branch", () => {
            expect(activeComposite).toBe("modeA.hot.leafA");
        });

        it("should throw for the genuinely active client even though its declaring name iterates second", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot dehydrate an Fsm child");
        });
    });

    describe("shared BehavioralFsm child declaring an Fsm leaf, active declaring name listed first", () => {
        let parent: any,
            client: ChildClient,
            activeComposite: string,
            thrownError: Error | undefined;

        beforeEach(() => {
            const leaf = createFsm({
                id: "dehydrate-shared-order-leaf",
                initialState: "leafA",
                states: { leafA: { go: "leafB" }, leafB: {} },
            });
            const child = createBehavioralFsm({
                id: "dehydrate-shared-order-child",
                initialState: "off",
                states: {
                    off: { poweron: "hot" },
                    hot: { _child: leaf as any },
                },
            });
            // "modeA" (the client's genuinely active state) is declared BEFORE
            // "modeB" (never entered by this client) — the mirror ordering of
            // the sibling scenario above, guarding against the fix only
            // happening to work for one iteration order.
            parent = createBehavioralFsm({
                id: "dehydrate-shared-order-parent-a-first",
                initialState: "modeA",
                states: {
                    modeA: { _child: child as any, leave: "modeB" },
                    modeB: { _child: child as any },
                },
            });

            client = {};
            parent.handle(client, "noop" as any); // init -> modeA
            child.handle(client, "poweron"); // child: off -> hot (declares the Fsm leaf)
            activeComposite = parent.compositeState(client);

            try {
                parent.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should confirm the client is genuinely active on the Fsm-leaf branch", () => {
            expect(activeComposite).toBe("modeA.hot.leafA");
        });

        it("should throw for the genuinely active client when its declaring name iterates first", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot dehydrate an Fsm child");
        });
    });

    describe("shared BehavioralFsm child declaring an Fsm leaf, client off-path at both declaring states", () => {
        let snapshot: any, dehydrateSpy: jest.Mock, thrownError: Error | undefined;

        beforeEach(() => {
            const leaf = createFsm({
                id: "dehydrate-shared-order-leaf",
                initialState: "leafA",
                states: { leafA: { go: "leafB" }, leafB: {} },
            });
            const child = createBehavioralFsm({
                id: "dehydrate-shared-order-child",
                initialState: "off",
                states: {
                    off: { poweron: "hot" },
                    hot: { _child: leaf as any },
                },
            });
            const parent = createBehavioralFsm({
                id: "dehydrate-shared-order-parent-offpath",
                initialState: "modeA",
                states: {
                    modeB: { _child: child as any },
                    modeA: { _child: child as any, leave: "modeC" },
                    modeC: {},
                },
            });

            const client: ChildClient = {};
            parent.handle(client, "noop" as any); // init -> modeA
            child.handle(client, "poweron"); // child: off -> hot (declares the Fsm leaf)
            parent.handle(client, "leave"); // modeA -> modeC; neither declaring name is active anymore

            // Wrap child.dehydrate() the same way the existing dedup test does,
            // so the call count can't be faked by "walked twice, same answer".
            const originalDehydrate = child.dehydrate.bind(child);
            dehydrateSpy = jest.fn((c: ChildClient, onPath?: boolean) =>
                originalDehydrate(c, onPath)
            );
            child.dehydrate = dehydrateSpy;

            try {
                snapshot = parent.dehydrate(client);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should not throw even though the shared child sits at its Fsm-declaring state", () => {
            expect(thrownError).toBeUndefined();
        });

        it("should capture the shared child's own state under both declaring names, without the off-path Fsm leaf", () => {
            expect(snapshot).toEqual({
                state: "modeC",
                deferred: [],
                children: {
                    modeA: { state: "hot", deferred: [] },
                    modeB: { state: "hot", deferred: [] },
                },
            });
        });

        it("should dehydrate the shared child instance only once", () => {
            expect(dehydrateSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("snapshot mutation after dehydrate", () => {
        let fsm: any, client: ChildClient, snapshot: any, originalPayload: Record<string, unknown>;

        beforeEach(() => {
            originalPayload = { count: 1 };
            fsm = createBehavioralFsm({
                id: "dehydrate-mutation",
                initialState: "idle",
                states: {
                    idle: {
                        wait({ defer }: any) {
                            defer();
                        },
                    },
                },
            });
            client = {};
            fsm.handle(client, "wait", originalPayload);
            snapshot = fsm.dehydrate(client);

            // Mutate the RETURNED snapshot — this must not reach back into the
            // FSM's internal deferred queue (the walk clones, it doesn't alias).
            snapshot.deferred[0].args[0].count = 12345;
        });

        it("should not reflect the snapshot mutation in a fresh dehydrate() call", () => {
            const freshSnapshot = fsm.dehydrate(client);
            expect(freshSnapshot.deferred[0].args[0]).toEqual({ count: 1 });
        });
    });
});

// =============================================================================
// rehydrate(snapshot) — object form
// =============================================================================

describe("BehavioralFsm — rehydrate(snapshot) object form", () => {
    describe("flat snapshot with deferred inputs", () => {
        let fsm: any, client: ChildClient, transitioningCb: jest.Mock, handledCb: jest.Mock;

        beforeEach(() => {
            transitioningCb = jest.fn();
            handledCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-flat",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: { advance: "done" },
                    // Untargeted defer replays against the state entered by the NEXT
                    // transition, not the one it was queued from — so "ping" lives here.
                    done: {
                        ping() {
                            handledCb();
                        },
                    },
                },
            });
            client = {};
            fsm.on("transitioning", transitioningCb);
            fsm.rehydrate(client, {
                state: "running",
                deferred: [{ inputName: "ping", args: [] }],
            });
        });

        it("should place the client at the snapshotted state", () => {
            expect(fsm.currentState(client)).toBe("running");
        });

        it("should not fire any lifecycle events during placement", () => {
            expect(transitioningCb).not.toHaveBeenCalled();
        });

        it("should replay the requeued deferred input after the next transition", () => {
            fsm.handle(client, "advance"); // running → done, then replays "ping" in "done"
            expect(handledCb).toHaveBeenCalledTimes(1);
        });
    });

    describe("mutating the snapshot's nested deferred args after rehydrate() returns", () => {
        let fsm: any,
            client: ChildClient,
            nestedPayload: Record<string, unknown>,
            snapshotAfterMutation: any,
            replayedArgs: unknown[];

        beforeEach(() => {
            nestedPayload = { count: 1 };
            replayedArgs = [];
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-alias",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: { advance: "done" },
                    // Targeted defer (until "done") stays queued across the
                    // "running" state so we can dehydrate() BEFORE it replays.
                    done: {
                        ping(_args: any, ...rest: unknown[]) {
                            replayedArgs = rest;
                        },
                    },
                },
            });
            client = {};
            fsm.rehydrate(client, {
                state: "running",
                deferred: [{ inputName: "ping", args: [nestedPayload], untilState: "done" }],
            });

            // Mutate the CALLER'S object after rehydrate() returns — this must not
            // reach into the FSM's internal deferred queue (the write must clone,
            // not alias, item.args).
            nestedPayload.count = 999;

            snapshotAfterMutation = fsm.dehydrate(client);
            fsm.handle(client, "advance"); // running → done, replays "ping" (untilState "done")
        });

        it("should not reflect the post-rehydrate mutation in a fresh dehydrate() snapshot", () => {
            expect(snapshotAfterMutation.deferred).toEqual([
                { inputName: "ping", args: [{ count: 1 }], untilState: "done" },
            ]);
        });

        it("should replay the deferred input with the original, unmutated args", () => {
            expect(replayedArgs).toEqual([{ count: 1 }]);
        });
    });

    describe("invalid state name at the top level", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-invalid-top",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            try {
                fsm.rehydrate({}, { state: "nonexistent", deferred: [] });
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw naming the bad state and the FSM id", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("nonexistent");
            expect(thrownError!.message).toContain("rehydrate-snapshot-invalid-top");
        });
    });

    describe("invalid state name at a nested level — atomicity", () => {
        let child: any, parent: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "rehydrate-snapshot-nested-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-snapshot-nested-parent",
                initialState: "idle",
                states: {
                    idle: {},
                    active: { _child: child },
                },
            });
            client = {};
            try {
                parent.rehydrate(client, {
                    state: "active",
                    deferred: [],
                    children: { active: { state: "bogus", deferred: [] } },
                });
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw naming the bad nested state", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("bogus");
        });

        it("should leave the parent unwritten (nothing written anywhere)", () => {
            expect(parent.currentState(client)).toBeUndefined();
        });

        it("should leave the child unwritten", () => {
            expect(child.currentState(client)).toBeUndefined();
        });
    });

    describe("children entry referencing a state with no _child", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-no-child",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            try {
                fsm.rehydrate(
                    {},
                    {
                        state: "running",
                        deferred: [],
                        children: { running: { state: "sub", deferred: [] } },
                    }
                );
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw naming the state and the FSM id", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("running");
            expect(thrownError!.message).toContain("rehydrate-snapshot-no-child");
        });
    });

    describe("children entry referencing a stateName that isn't declared at all", () => {
        let fsm: any, thrownError: Error | undefined;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-unknown-child-key",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            try {
                fsm.rehydrate(
                    {},
                    {
                        state: "running",
                        deferred: [],
                        children: { bogusState: { state: "sub", deferred: [] } },
                    }
                );
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw naming the unknown state and the FSM id", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("bogusState");
            expect(thrownError!.message).toContain("rehydrate-snapshot-unknown-child-key");
        });
    });

    describe("nested child FSM instance is disposed independently of the parent", () => {
        let child: any, parent: any, client: ChildClient;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "rehydrate-snapshot-disposed-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-snapshot-parent-of-disposed-child",
                initialState: "idle",
                states: {
                    idle: {},
                    active: { _child: child },
                },
            });
            client = {};
            child.dispose();
            parent.rehydrate(client, {
                state: "active",
                deferred: [],
                children: { active: { state: "on", deferred: [] } },
            });
        });

        it("should not throw and should still rehydrate the parent", () => {
            expect(parent.currentState(client)).toBe("active");
        });

        it("should silently skip writing to the disposed child", () => {
            expect(child.currentState(client)).toBeUndefined();
        });
    });

    describe("Fsm child referenced by a snapshot's children entry", () => {
        let parent: any, thrownError: Error | undefined;

        beforeEach(() => {
            const fsmChild = createFsm({
                id: "rehydrate-snapshot-fsm-child",
                initialState: "on",
                states: { on: {}, off: {} },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-snapshot-fsm-parent",
                initialState: "active",
                states: {
                    active: { _child: fsmChild as any },
                },
            });
            try {
                parent.rehydrate(
                    {},
                    {
                        state: "active",
                        deferred: [],
                        children: { active: { state: "off", deferred: [] } },
                    }
                );
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw, consistent with the string form", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("cannot rehydrate an Fsm child");
        });
    });

    describe("shared child instance referenced under two state keys", () => {
        let child: any, parent: any, client: ChildClient;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "rehydrate-snapshot-shared-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            parent = createBehavioralFsm({
                id: "rehydrate-snapshot-shared-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child },
                    modeB: { _child: child },
                },
            });
            client = {};
            parent.rehydrate(client, {
                state: "modeA",
                deferred: [],
                children: {
                    modeA: { state: "on", deferred: [] },
                    modeB: { state: "on", deferred: [] },
                },
            });
        });

        it("should place the shared child idempotently despite two duplicate write thunks", () => {
            expect(child.currentState(client)).toBe("on");
        });

        it("should place the parent at the snapshotted state", () => {
            expect(parent.currentState(client)).toBe("modeA");
        });
    });

    describe("disposed FSM", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "rehydrate-snapshot-disposed",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            fsm.dispose();
            fsm.rehydrate(client, { state: "running", deferred: [] });
        });

        it("should be a no-op", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("equivalence with the string form when deferred is empty", () => {
        let child: any, parent: any, stringClient: ChildClient, objectClient: ChildClient;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "equivalence-child",
                initialState: "off",
                states: { off: { poweron: "on" }, on: { poweroff: "off" } },
            });
            parent = createBehavioralFsm({
                id: "equivalence-parent",
                initialState: "idle",
                states: {
                    idle: {},
                    active: { _child: child },
                },
            });
            stringClient = {};
            objectClient = {};
            parent.rehydrate(stringClient, "active.on");
            parent.rehydrate(objectClient, {
                state: "active",
                deferred: [],
                children: { active: { state: "on", deferred: [] } },
            });
        });

        it("should place both clients in the same parent state", () => {
            expect(parent.currentState(objectClient)).toBe(parent.currentState(stringClient));
        });

        it("should place both clients in the same child state", () => {
            expect(child.currentState(objectClient)).toBe(child.currentState(stringClient));
        });

        it("should produce the same compositeState for both", () => {
            expect(parent.compositeState(objectClient)).toBe(parent.compositeState(stringClient));
        });
    });
});

// =============================================================================
// Full persistence round-trip: dehydrate → JSON round-trip → rehydrate
// =============================================================================

describe("BehavioralFsm — persistence round-trip", () => {
    describe("hierarchy with an off-path deferral, restored onto a NEW client object", () => {
        let child: any,
            parent: any,
            originalClient: ChildClient,
            newClient: ChildClient,
            pingReplayed: boolean,
            transitioningCb: jest.Mock;

        beforeEach(() => {
            pingReplayed = false;
            transitioningCb = jest.fn();
            child = createBehavioralFsm({
                id: "roundtrip-child",
                initialState: "off",
                states: {
                    off: {
                        poweron: "on",
                        ping() {
                            pingReplayed = true;
                        },
                    },
                    on: {
                        poweroff: "off",
                        ping({ defer }: any) {
                            defer({ until: "off" });
                        },
                    },
                },
            });
            parent = createBehavioralFsm({
                id: "roundtrip-parent",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: { _child: child, deactivate: "idle" },
                },
            });

            // Build up state on the ORIGINAL client: leave the child off-path,
            // on, with a deferral pending.
            originalClient = {};
            parent.handle(originalClient, "activate"); // idle → active, child resets to off
            child.handle(originalClient, "poweron"); // child: off → on
            child.handle(originalClient, "ping"); // deferred until "off"
            parent.handle(originalClient, "deactivate"); // active → idle — child now off-path

            const snapshot = parent.dehydrate(originalClient);
            const roundTripped = JSON.parse(JSON.stringify(snapshot));

            newClient = {};
            parent.on("transitioning", transitioningCb);
            parent.rehydrate(newClient, roundTripped);
        });

        it("should not fire any lifecycle events during placement", () => {
            expect(transitioningCb).not.toHaveBeenCalled();
        });

        it("should restore the parent's state on the new client", () => {
            expect(parent.currentState(newClient)).toBe("idle");
        });

        it("should restore the off-path child's state on the new client", () => {
            expect(child.currentState(newClient)).toBe("on");
        });

        describe("when the new client's parent re-enters the child's state", () => {
            beforeEach(() => {
                parent.handle(newClient, "activate"); // idle → active: child resets (on → off), replays "ping"
            });

            it("should replay the restored deferred input, identical to the in-memory oracle", () => {
                expect(pingReplayed).toBe(true);
            });

            it("should land the child at its initialState after replay", () => {
                expect(child.currentState(newClient)).toBe("off");
            });
        });

        it("should leave the original client's live state untouched", () => {
            expect(parent.currentState(originalClient)).toBe("idle");
            expect(child.currentState(originalClient)).toBe("on");
        });
    });
});

// =============================================================================
// Hardening: hostile snapshots, deep/diamond hierarchies, and adversarial
// call timing that the original test suite's happy-path-plus-error-cases
// coverage doesn't exercise.
// =============================================================================

describe("BehavioralFsm — persistence hardening", () => {
    describe("dehydrate() — shared child instance wired in at two different hierarchy depths", () => {
        let leaf: any, mid: any, root: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            // "leaf" is declared directly under root.branchB AND, two levels
            // deeper, under mid.midActive (mid is itself root.branchA's child).
            // Diamond, not a cycle: leaf never declares anything that points
            // back up toward mid or root.
            leaf = createBehavioralFsm({
                id: "diamond-leaf",
                initialState: "off",
                states: { off: { poweron: "on" }, on: { poweroff: "off" } },
            });
            mid = createBehavioralFsm({
                id: "diamond-mid",
                initialState: "midIdle",
                states: {
                    midIdle: { go: "midActive" },
                    midActive: { _child: leaf },
                },
            });
            root = createBehavioralFsm({
                id: "diamond-root",
                initialState: "start",
                states: {
                    start: { go: "branchA" },
                    branchA: { _child: mid, hop: "branchB" },
                    branchB: { _child: leaf },
                },
            });

            client = {};
            root.handle(client, "go"); // start -> branchA; mid resets to midIdle
            root.handle(client, "go"); // delegates to mid: midIdle -> midActive; leaf resets to off
            leaf.handle(client, "poweron"); // leaf: off -> on

            snapshot = root.dehydrate(client);
        });

        it("should capture the shared leaf's state under both tree positions without crashing", () => {
            expect(snapshot).toEqual({
                state: "branchA",
                deferred: [],
                children: {
                    branchA: {
                        state: "midActive",
                        deferred: [],
                        children: { midActive: { state: "on", deferred: [] } },
                    },
                    branchB: { state: "on", deferred: [] },
                },
            });
        });
    });

    describe("rehydrate(snapshot) — conflicting states for the same shared child under two declaring keys", () => {
        let child: any, parent: any, client: ChildClient;

        beforeEach(() => {
            child = createBehavioralFsm({
                id: "conflict-shared-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            parent = createBehavioralFsm({
                id: "conflict-shared-parent",
                initialState: "modeA",
                states: {
                    modeA: { _child: child },
                    modeB: { _child: child },
                },
            });
            client = {};
            // A hand-crafted (not dehydrate()-produced) snapshot: the same
            // child instance is asked to be in two different states at once.
            // dehydrate() itself can never produce this (its dedup emits one
            // identical value under every declaring key) — this pins what
            // happens when the snapshot itself is self-contradictory.
            parent.rehydrate(client, {
                state: "modeA",
                deferred: [],
                children: {
                    modeA: { state: "on", deferred: [] },
                    modeB: { state: "off", deferred: [] },
                },
            });
        });

        it("should resolve to the last-written declaring key's state (modeB, iterated second)", () => {
            expect(child.currentState(client)).toBe("off");
        });
    });

    describe("rehydrate(snapshot) — top-level state name is the inherited '__proto__' accessor", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "proto-pollution-state",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, { state: "__proto__", deferred: [] });
            } catch (e: any) {
                thrownError = e;
            }
        });

        // Regression guard: `state in this.states` was fooled by the inherited
        // Object.prototype `__proto__` accessor — `"__proto__" in {}` is `true`
        // even though no state literally named "__proto__" was ever declared
        // (object-literal syntax can't even create one). planSnapshotWrites()
        // now uses Object.hasOwn(), which only matches real declared states.
        it("should throw for the unknown state rather than silently accepting it", () => {
            expect(thrownError).toBeDefined();
        });
    });

    describe("rehydrate(snapshot) — children map key is the inherited '__proto__' accessor", () => {
        let child: any, fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            child = createBehavioralFsm({
                id: "proto-pollution-children-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            fsm = createBehavioralFsm({
                id: "proto-pollution-children-parent",
                initialState: "idle",
                states: { idle: {}, active: { _child: child } },
            });
            client = {};
            // Only JSON.parse (not object-literal syntax) can produce a genuine
            // OWN "__proto__" property to iterate over via Object.keys().
            const hostileChildren = JSON.parse('{"__proto__":{"state":"on","deferred":[]}}');
            try {
                fsm.rehydrate(client, { state: "active", deferred: [], children: hostileChildren });
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw rather than write anything, unlike the top-level state field", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("__proto__");
        });

        it("should leave the FSM unwritten", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("rehydrate(snapshot) — deferred untilState references a state absent from the definition", () => {
        let fsm: any, client: ChildClient, pingHandled: boolean;

        beforeEach(() => {
            pingHandled = false;
            fsm = createBehavioralFsm({
                id: "ghost-until-state",
                initialState: "idle",
                states: {
                    idle: { start: "running" },
                    running: {
                        ping() {
                            pingHandled = true;
                        },
                    },
                },
            });
            client = {};
            fsm.rehydrate(client, {
                state: "idle",
                deferred: [{ inputName: "ping", args: [], untilState: "ghostState" }],
            });
            fsm.handle(client, "start"); // idle -> running; untilState "ghostState" never matches
        });

        it("should transition normally without replaying the orphaned deferral", () => {
            expect(fsm.currentState(client)).toBe("running");
            expect(pingHandled).toBe(false);
        });

        it("should leave the orphaned deferral sitting inertly in the queue", () => {
            expect(fsm.dehydrate(client)).toEqual({
                state: "running",
                deferred: [{ inputName: "ping", args: [], untilState: "ghostState" }],
            });
        });
    });

    describe("dehydrate() called synchronously from inside a handler, mid-transition", () => {
        let fsm: any, client: ChildClient, midHandlerSnapshot: any;

        beforeEach(() => {
            midHandlerSnapshot = undefined;
            fsm = createBehavioralFsm({
                id: "dehydrate-mid-handler",
                initialState: "idle",
                states: {
                    idle: {
                        weird({ defer }: any) {
                            defer();
                            // Called before the transition below has happened —
                            // meta.state is still "idle" at this point.
                            midHandlerSnapshot = fsm.dehydrate(client);
                            return "running";
                        },
                    },
                    running: {},
                },
            });
            client = {};
            fsm.handle(client, "weird");
        });

        it("should reflect the pre-transition state and the just-deferred input, excluding in-flight handler args", () => {
            expect(midHandlerSnapshot).toEqual({
                state: "idle",
                deferred: [{ inputName: "weird", args: [] }],
            });
        });

        it("should leave the FSM's own transition unaffected by the mid-handler dehydrate() call", () => {
            expect(fsm.currentState(client)).toBe("running");
        });
    });

    describe("rehydrate(snapshot) — 3-level nested hierarchy", () => {
        let grandchild: any, childFsm: any, grandparent: any, client: ChildClient;

        beforeEach(() => {
            grandchild = createBehavioralFsm({
                id: "snapshot-3-level-gc",
                initialState: "alpha",
                states: { alpha: { next: "beta" }, beta: {} },
            });
            childFsm = createBehavioralFsm({
                id: "snapshot-3-level-child",
                initialState: "x",
                states: { x: { _child: grandchild, jump: "y" }, y: {} },
            });
            grandparent = createBehavioralFsm({
                id: "snapshot-3-level-gp",
                initialState: "top",
                states: { top: { _child: childFsm } },
            });
            client = {};
            grandparent.rehydrate(client, {
                state: "top",
                deferred: [],
                children: {
                    top: {
                        state: "x",
                        deferred: [],
                        children: { x: { state: "beta", deferred: [] } },
                    },
                },
            });
        });

        it("should place every level at its snapshotted state", () => {
            expect(grandparent.currentState(client)).toBe("top");
            expect(childFsm.currentState(client)).toBe("x");
            expect(grandchild.currentState(client)).toBe("beta");
        });

        it("should produce the full three-level dot-path via compositeState", () => {
            expect(grandparent.compositeState(client)).toBe("top.x.beta");
        });
    });

    describe("dehydrate() on a disposed FSM", () => {
        let fsm: any, client: ChildClient, snapshot: any;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "dehydrate-after-dispose",
                initialState: "idle",
                states: { idle: { start: "running" }, running: {} },
            });
            client = {};
            fsm.handle(client, "start");
            fsm.dispose();
            snapshot = fsm.dehydrate(client);
        });

        it("should still return the client's last-known snapshot (dehydrate has no disposed guard, by design)", () => {
            expect(snapshot).toEqual({ state: "running", deferred: [] });
        });
    });

    describe("rehydrate(snapshot) — top-level state name legitimately shadows an inherited Object.prototype member", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            // "hasOwnProperty" IS a real, declared own key here (object-literal
            // syntax creates it same as any other property name — unlike
            // "__proto__", there's nothing magic about shadowing an inherited
            // METHOD name). Object.hasOwn(this.states, "hasOwnProperty") must
            // still return true for it, exactly as `in` always did — the fix
            // only needed to stop matching names that are NOT own keys.
            fsm = createBehavioralFsm({
                id: "legit-inherited-name-state",
                initialState: "idle",
                states: { idle: {}, hasOwnProperty: {} },
            });
            client = {};
            fsm.rehydrate(client, { state: "hasOwnProperty", deferred: [] });
        });

        it("should accept the declared state rather than rejecting it as if it were inherited", () => {
            expect(fsm.currentState(client)).toBe("hasOwnProperty");
        });
    });
});

// =============================================================================
// transition() / rehydrate() (string form) — Object.hasOwn state checks
//
// `toState in this.states` (transition()) and `state in this.states`
// (rehydrateCompositePath(), the string-form helper) both walked the
// prototype chain, exactly like the `state in this.states` check
// `planSnapshotWrites()` had before its #184 fix. These two are the only
// other `in this.states` checks left in the file — ported to
// Object.hasOwn() here for parity with the already-fixed object-form path.
// =============================================================================

describe("BehavioralFsm — transition()/rehydrate() inherited-name state guards", () => {
    describe("transition() to the inherited '__proto__' accessor", () => {
        let fsm: any, client: ChildClient, invalidstateCb: jest.Mock;

        beforeEach(() => {
            invalidstateCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "proto-transition",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            fsm.handle(client, "noop" as any); // init -> idle
            fsm.on("invalidstate", invalidstateCb);
            fsm.transition(client, "__proto__" as any);
        });

        // Regression guard: before Object.hasOwn(), "__proto__" in this.states
        // was true via the inherited Object.prototype member, so transition()
        // silently accepted it and wedged the client at a pseudo-state that
        // was never declared. It must take the SAME path any other unknown
        // state does — emit invalidstate, no throw — not a new failure mode.
        it("should emit invalidstate rather than silently accepting the pseudo-state", () => {
            expect(invalidstateCb).toHaveBeenCalledTimes(1);
            expect(invalidstateCb).toHaveBeenCalledWith(
                expect.objectContaining({ stateName: "__proto__", client })
            );
        });

        it("should leave the client's state unchanged, not wedged in the pseudo-state", () => {
            expect(fsm.currentState(client)).toBe("idle");
        });
    });

    describe("transition() to '__proto__' via a handler's runtime return value", () => {
        let fsm: any, client: ChildClient, invalidstateCb: jest.Mock;

        beforeEach(() => {
            invalidstateCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "proto-transition-via-handler",
                initialState: "idle",
                states: {
                    // Typed as a plain string return so this bypasses the
                    // compile-time state-name validation a hand-written
                    // string literal would trigger — the same way an
                    // untyped JS consumer, or a value computed at runtime,
                    // could hand transition() a bad name.
                    idle: {
                        go(): string {
                            return "__proto__";
                        },
                    },
                    running: {},
                },
            });
            client = {};
            fsm.on("invalidstate", invalidstateCb);
            fsm.handle(client, "go" as any);
        });

        it("should emit invalidstate for the runtime-returned pseudo-state name", () => {
            expect(invalidstateCb).toHaveBeenCalledTimes(1);
            expect(invalidstateCb).toHaveBeenCalledWith(
                expect.objectContaining({ stateName: "__proto__", client })
            );
        });

        it("should leave the client's state unchanged", () => {
            expect(fsm.currentState(client)).toBe("idle");
        });
    });

    describe("transition() to another Object.prototype-inherited name ('constructor')", () => {
        let fsm: any, client: ChildClient, invalidstateCb: jest.Mock;

        beforeEach(() => {
            invalidstateCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "proto-transition-constructor",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            fsm.handle(client, "noop" as any); // init -> idle
            fsm.on("invalidstate", invalidstateCb);
            fsm.transition(client, "constructor" as any);
        });

        // The bug class is "any inherited name," not just "__proto__" —
        // "constructor" is inherited too and must be rejected the same way.
        it("should emit invalidstate for 'constructor' just like any other unknown state", () => {
            expect(invalidstateCb).toHaveBeenCalledTimes(1);
            expect(invalidstateCb).toHaveBeenCalledWith(
                expect.objectContaining({ stateName: "constructor", client })
            );
        });

        it("should leave the client's state unchanged", () => {
            expect(fsm.currentState(client)).toBe("idle");
        });
    });

    describe("transition() to a legitimately declared state that shadows an inherited name", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            // "hasOwnProperty" IS a real, declared own key — object-literal
            // syntax creates it same as any other property name. The fix must
            // not reject declared states just because they happen to shadow
            // an inherited Object.prototype member name.
            fsm = createBehavioralFsm({
                id: "proto-transition-legit-shadow",
                initialState: "idle",
                states: { idle: { go: "hasOwnProperty" }, hasOwnProperty: {} },
            });
            client = {};
            fsm.handle(client, "go" as any);
        });

        it("should transition into the declared state normally", () => {
            expect(fsm.currentState(client)).toBe("hasOwnProperty");
        });
    });

    describe("rehydrate() (string form) to the inherited '__proto__' accessor, top level", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "proto-rehydrate-string-top",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, "__proto__");
            } catch (e: any) {
                thrownError = e;
            }
        });

        // rehydrate() throws for unknown states (unlike transition(), which
        // emits invalidstate) — the fix must preserve THIS path's existing
        // failure mode too, just reclassify "__proto__" as unknown.
        it("should throw the unknown-state error rather than silently accepting it", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("__proto__");
        });

        it("should leave the client unregistered", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("rehydrate() (string form) to the inherited '__proto__' accessor, nested composite path", () => {
        let child: any, parent: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            child = createBehavioralFsm({
                id: "proto-rehydrate-string-nested-child",
                initialState: "off",
                states: { off: {}, on: {} },
            });
            parent = createBehavioralFsm({
                id: "proto-rehydrate-string-nested-parent",
                initialState: "idle",
                states: { idle: {}, active: { _child: child } },
            });
            client = {};
            try {
                parent.rehydrate(client, "active.__proto__");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw the unknown-state error for the nested pseudo-state", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("__proto__");
        });

        it("should leave both parent and child unregistered — nothing written", () => {
            expect(parent.currentState(client)).toBeUndefined();
            expect(child.currentState(client)).toBeUndefined();
        });
    });

    describe("rehydrate() (string form) to another Object.prototype-inherited name ('constructor')", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "proto-rehydrate-string-constructor",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, "constructor");
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw the unknown-state error for 'constructor' just like any other unknown state", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain("constructor");
        });
    });

    describe("rehydrate() (string form) into a legitimately declared state that shadows an inherited name", () => {
        let fsm: any, client: ChildClient;

        beforeEach(() => {
            fsm = createBehavioralFsm({
                id: "proto-rehydrate-string-legit-shadow",
                initialState: "idle",
                states: { idle: {}, hasOwnProperty: {} },
            });
            client = {};
            fsm.rehydrate(client, "hasOwnProperty");
        });

        it("should accept the declared state rather than rejecting it as if it were inherited", () => {
            expect(fsm.currentState(client)).toBe("hasOwnProperty");
        });
    });

    describe("transition() to an inherited name via a state's string-shorthand handler target", () => {
        let fsm: any, client: ChildClient, invalidstateCb: jest.Mock;

        beforeEach(() => {
            invalidstateCb = jest.fn();
            fsm = createBehavioralFsm({
                id: "proto-transition-via-shorthand",
                initialState: "idle",
                states: {
                    // "constructor" as any bypasses compile-time shorthand-target
                    // validation, same as the _child cast elsewhere in this file —
                    // this exercises handleLocally()'s `typeof handler === "string"`
                    // branch, distinct from the function-handler branch already
                    // covered by the runtime-return-value test above.
                    idle: { go: "constructor" as any },
                    running: {},
                },
            });
            client = {};
            fsm.on("invalidstate", invalidstateCb);
            fsm.handle(client, "go" as any);
        });

        it("should emit invalidstate for the shorthand-targeted pseudo-state", () => {
            expect(invalidstateCb).toHaveBeenCalledTimes(1);
            expect(invalidstateCb).toHaveBeenCalledWith(
                expect.objectContaining({ stateName: "constructor", client })
            );
        });

        it("should leave the client's state unchanged", () => {
            expect(fsm.currentState(client)).toBe("idle");
        });
    });
});

describe("BehavioralFsm — rehydrate() malformed snapshot shapes", () => {
    // The object-form of rehydrate() trusts its input more than dehydrate()
    // trusts its output — planSnapshotWrites() only validates `state` (and
    // `children[stateName]`) against the state graph. A missing/wrong-shaped
    // `deferred` or a wholesale missing snapshot aren't validated at all; they
    // fail as an incidental consequence of destructuring or array iteration.
    // These tests pin CURRENT behavior so a future "helpful" guard added to
    // planSnapshotWrites() (e.g. an early `if (!snapshot) return [];`) doesn't
    // silently change "throws, nothing written" into "silently drops the
    // client's data" without a test noticing. See review-report-persistence-
    // follow-ups.md Should-Fix #1.
    describe("snapshot is undefined", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "rehydrate-undefined-snapshot",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, undefined as any);
            } catch (e: any) {
                thrownError = e;
            }
        });

        it("should throw a TypeError rather than silently no-opping", () => {
            expect(thrownError).toBeInstanceOf(TypeError);
        });

        it("should leave the client unregistered", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("snapshot object is missing 'state'", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "rehydrate-missing-state",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, { deferred: [] } as any);
            } catch (e: any) {
                thrownError = e;
            }
        });

        // Distinct from the "undefined" case above — this snapshot IS a real
        // object, so destructuring succeeds (state comes back undefined via
        // normal missing-property lookup); it fails at the explicit
        // Object.hasOwn() validation instead, taking the DELIBERATE
        // unknown-state error path rather than an accidental crash.
        it("should throw the deliberate unknown-state validation error naming 'undefined'", () => {
            expect(thrownError).toBeDefined();
            expect(thrownError!.message).toContain('unknown state "undefined"');
        });

        it("should leave the client unregistered", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });

    describe("snapshot has a valid 'state' but is missing 'deferred'", () => {
        let fsm: any, client: ChildClient, thrownError: Error | undefined;

        beforeEach(() => {
            thrownError = undefined;
            fsm = createBehavioralFsm({
                id: "rehydrate-missing-deferred",
                initialState: "idle",
                states: { idle: {}, running: {} },
            });
            client = {};
            try {
                fsm.rehydrate(client, { state: "running" } as any);
            } catch (e: any) {
                thrownError = e;
            }
        });

        // Unlike the missing-'state' case, this snapshot passes the hasOwn
        // validation (the state name IS declared) — it fails later, and
        // differently, when the (missing) deferred array is mapped over.
        it("should throw a TypeError from the missing deferred array rather than validating it", () => {
            expect(thrownError).toBeInstanceOf(TypeError);
        });

        it("should leave the client unregistered", () => {
            expect(fsm.currentState(client)).toBeUndefined();
        });
    });
});
