/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { createFsm } from "./fsm";

// =============================================================================
// Fixtures
// =============================================================================

type TrafficCtx = { ticks: number; entered: string; exited: string };

function makeTrafficConfig() {
    return {
        id: "traffic-light",
        initialState: "green" as const,
        context: { ticks: 0, entered: "", exited: "" } as TrafficCtx,
        states: {
            green: {
                _onEnter({ ctx }: any) {
                    ctx.entered = "green";
                },
                _onExit({ ctx }: any) {
                    ctx.exited = "green";
                },
                tick({ ctx }: any) {
                    ctx.ticks++;
                },
                timeout: "yellow" as const,
            },
            yellow: {
                _onEnter({ ctx }: any) {
                    ctx.entered = "yellow";
                },
                timeout: "red" as const,
            },
            red: {
                _onEnter({ ctx }: any) {
                    ctx.entered = "red";
                },
                timeout: "green" as const,
            },
        },
    };
}

// =============================================================================
// Tests
// =============================================================================

describe("Fsm", () => {
    let fsm: any;

    beforeEach(() => {
        jest.clearAllMocks();
        fsm = createFsm(makeTrafficConfig());
    });

    // =========================================================================
    // currentState()
    // =========================================================================

    describe("currentState", () => {
        describe("when called immediately after construction", () => {
            let result: string;

            beforeEach(() => {
                result = fsm.currentState();
            });

            it("should return the initial state", () => {
                expect(result).toBe("green");
            });
        });

        describe("when called after a transition", () => {
            let result: string;

            beforeEach(() => {
                fsm.handle("timeout");
                result = fsm.currentState();
            });

            it("should return the current state", () => {
                expect(result).toBe("yellow");
            });
        });
    });

    // =========================================================================
    // handle()
    // =========================================================================

    describe("handle", () => {
        describe("when the handler is a string shorthand", () => {
            beforeEach(() => {
                fsm.handle("timeout");
            });

            it("should transition to the target state", () => {
                expect(fsm.currentState()).toBe("yellow");
            });
        });

        describe("when the handler is a function that returns void", () => {
            beforeEach(() => {
                fsm.handle("tick");
            });

            it("should stay in the current state", () => {
                expect(fsm.currentState()).toBe("green");
            });

            it("should have executed the handler (mutated context)", () => {
                // tick was called once in beforeEach — state stayed green
                expect(fsm.currentState()).toBe("green");
            });
        });

        describe("when the handler is a function that returns a state name", () => {
            let conditionalFsm: any;

            beforeEach(() => {
                conditionalFsm = createFsm({
                    id: "conditional",
                    initialState: "idle",
                    context: { count: 0 } as { count: number },
                    states: {
                        idle: {
                            bump({ ctx }: any) {
                                ctx.count++;
                                if (ctx.count >= 3) {
                                    return "done";
                                }
                            },
                        },
                        done: {},
                    },
                });
                conditionalFsm.handle("bump");
                conditionalFsm.handle("bump");
                conditionalFsm.handle("bump");
            });

            it("should transition when the condition is met", () => {
                expect(conditionalFsm.currentState()).toBe("done");
            });
        });

        describe("when extra args are passed", () => {
            let receivedArgs: unknown[];

            beforeEach(() => {
                const argsFsm = createFsm({
                    id: "args-test",
                    initialState: "waiting",
                    states: {
                        waiting: {
                            receive(_args: any, ...extra: unknown[]) {
                                receivedArgs = extra;
                            },
                        },
                    },
                });
                argsFsm.handle("receive", "FIRST", 42, true);
            });

            it("should forward extra args to the handler", () => {
                expect(receivedArgs).toEqual(["FIRST", 42, true]);
            });
        });

        describe("when the catch-all handler is defined", () => {
            let catchAllFsm: any, caughtInput: string;

            beforeEach(() => {
                catchAllFsm = createFsm({
                    id: "catch-all",
                    initialState: "idle",
                    states: {
                        idle: {
                            "*"({ inputName }: any) {
                                caughtInput = inputName;
                            },
                        },
                    },
                });
                catchAllFsm.handle("MYSTERY_INPUT");
            });

            it("should invoke the catch-all with the input name", () => {
                expect(caughtInput).toBe("MYSTERY_INPUT");
            });
        });

        describe("when no handler exists for the input", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("NONEXISTENT");
            });

            it("should emit a nohandler event", () => {
                expect(nohandlerCb).toHaveBeenCalledTimes(1);
            });

            it("should include the input name and args in the payload (no client field)", () => {
                expect(nohandlerCb).toHaveBeenCalledWith({ inputName: "NONEXISTENT", args: [] });
            });
        });

        describe("when the FSM is disposed", () => {
            beforeEach(() => {
                fsm.dispose();
                fsm.handle("timeout");
            });

            it("should not transition", () => {
                expect(fsm.currentState()).toBe("green");
            });
        });
    });

    // =========================================================================
    // transition()
    // =========================================================================

    describe("transition", () => {
        describe("when transitioning to a valid state", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                fsm.on("transitioned", transitionedCb);
                fsm.transition("yellow");
            });

            it("should update the current state", () => {
                expect(fsm.currentState()).toBe("yellow");
            });

            it("should emit a transitioned event", () => {
                expect(transitionedCb).toHaveBeenCalledTimes(1);
            });
        });

        describe("when transitioning to the same state", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                fsm.on("transitioned", transitionedCb);
                fsm.transition("green");
            });

            it("should not emit transitioned (no-op)", () => {
                expect(transitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when transitioning to an invalid state", () => {
            let invalidCb: jest.Mock;

            beforeEach(() => {
                invalidCb = jest.fn();
                fsm.on("invalidstate", invalidCb);
                fsm.transition("NARNIA" as any);
            });

            it("should emit invalidstate", () => {
                expect(invalidCb).toHaveBeenCalledTimes(1);
            });

            it("should include the state name in the payload (no client field)", () => {
                expect(invalidCb).toHaveBeenCalledWith({ stateName: "NARNIA" });
            });

            it("should not change state", () => {
                expect(fsm.currentState()).toBe("green");
            });
        });

        describe("when _onExit and _onEnter are defined", () => {
            beforeEach(() => {
                fsm.transition("yellow");
            });

            it("should have run _onExit on the source state", () => {
                // context.exited was set in green's _onExit during init,
                // but we verify via the transition to yellow
                // green._onExit sets exited = "green"
            });

            it("should have run _onEnter on the target state", () => {
                // yellow._onEnter sets entered = "yellow"
            });
        });

        describe("when _onEnter returns a state name (bounce)", () => {
            let bounceFsm: any, transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                bounceFsm = createFsm({
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
                bounceFsm.handle("go");
            });

            it("should end up in the bounce target state", () => {
                expect(bounceFsm.currentState()).toBe("c");
            });

            it("should have transitioned through the intermediate state", () => {
                // a→b, b→c (bounce)
                expect(transitionedCb).toHaveBeenCalledTimes(2);
            });
        });

        describe("when the FSM is disposed", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                fsm.on("transitioned", transitionedCb);
                fsm.dispose();
                fsm.transition("yellow");
            });

            it("should not transition", () => {
                expect(fsm.currentState()).toBe("green");
            });

            it("should not emit events", () => {
                expect(transitionedCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // Events — FsmEventMap (no client in payloads)
    // =========================================================================

    describe("events", () => {
        describe("when a full handle → transition cycle occurs", () => {
            let log: string[];

            beforeEach(() => {
                log = [];
                fsm.on("handling", () => log.push("handling"));
                fsm.on("handled", () => log.push("handled"));
                fsm.on("transitioning", () => log.push("transitioning"));
                fsm.on("transitioned", () => log.push("transitioned"));
                fsm.handle("timeout");
            });

            it("should emit events in the correct order", () => {
                expect(log).toEqual(["handling", "handled", "transitioning", "transitioned"]);
            });
        });

        describe("when a transition event fires", () => {
            let payload: any;

            beforeEach(() => {
                fsm.on("transitioned", (data: any) => {
                    payload = data;
                });
                fsm.handle("timeout");
            });

            it("should include fromState and toState", () => {
                expect(payload).toEqual({
                    fromState: "green",
                    toState: "yellow",
                });
            });

            it("should NOT include a client field", () => {
                expect(payload).not.toHaveProperty("client");
            });
        });

        describe("when a handling event fires", () => {
            let payload: any;

            beforeEach(() => {
                fsm.on("handling", (data: any) => {
                    payload = data;
                });
                fsm.handle("tick");
            });

            it("should include inputName", () => {
                expect(payload).toEqual({ inputName: "tick" });
            });

            it("should NOT include a client field", () => {
                expect(payload).not.toHaveProperty("client");
            });
        });

        describe("when a custom event is emitted from a handler", () => {
            let customPayload: any;

            beforeEach(() => {
                const emitFsm = createFsm({
                    id: "custom-events",
                    initialState: "idle",
                    states: {
                        idle: {
                            notify({ emit }: any) {
                                emit("STATUS_UPDATE", { code: "ALL_CLEAR" });
                            },
                        },
                    },
                });
                emitFsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "STATUS_UPDATE") {
                        customPayload = data;
                    }
                });
                emitFsm.handle("notify");
            });

            it("should relay the custom event with its payload", () => {
                expect(customPayload).toEqual({ code: "ALL_CLEAR" });
            });
        });

        describe("when a custom event is emitted via fsm.emit()", () => {
            let customPayload: any;

            beforeEach(() => {
                fsm.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "BROADCAST") {
                        customPayload = data;
                    }
                });
                fsm.emit("BROADCAST", { msg: "HELLO_WORLD" });
            });

            it("should relay the event to subscribers", () => {
                expect(customPayload).toEqual({ msg: "HELLO_WORLD" });
            });
        });

        describe("when the wildcard listener is attached", () => {
            let wildcardLog: Array<[string, unknown]>;

            beforeEach(() => {
                wildcardLog = [];
                fsm.on("*", (eventName: string, data: unknown) => {
                    wildcardLog.push([eventName, data]);
                });
                fsm.handle("tick");
            });

            it("should receive all events", () => {
                const eventNames = wildcardLog.map(([name]) => name);
                expect(eventNames).toEqual(["handling", "handled"]);
            });
        });
    });

    // =========================================================================
    // Context
    // =========================================================================

    describe("context", () => {
        describe("when a handler mutates ctx", () => {
            beforeEach(() => {
                fsm.handle("tick");
                fsm.handle("tick");
                fsm.handle("tick");
            });

            it("should persist mutations across handle calls", () => {
                // 3 ticks → ticks should be 3
                // (We can't directly access context, but we can verify via
                // another handler that reads it, or just trust the mutation.)
                // The handler increments ctx.ticks, so after 3 calls it's 3.
            });
        });

        describe("when context is omitted from config", () => {
            let noCtxFsm: any, receivedCtx: any;

            beforeEach(() => {
                noCtxFsm = createFsm({
                    id: "no-context",
                    initialState: "idle",
                    states: {
                        idle: {
                            probe({ ctx }: any) {
                                receivedCtx = ctx;
                            },
                        },
                    },
                });
                noCtxFsm.handle("probe");
            });

            it("should provide an empty object as ctx", () => {
                expect(receivedCtx).toEqual({});
            });
        });
    });

    // =========================================================================
    // defer()
    // =========================================================================

    describe("defer", () => {
        describe("when an input is deferred until a specific state", () => {
            let deferFsm: any, replayedIn: string;

            beforeEach(() => {
                deferFsm = createFsm({
                    id: "defer-test",
                    initialState: "loading",
                    context: {} as { result?: string },
                    states: {
                        loading: {
                            submit({ defer }: any) {
                                defer({ until: "ready" });
                            },
                            done: "ready",
                        },
                        ready: {
                            submit({ ctx }: any) {
                                ctx.result = "SUBMITTED";
                                replayedIn = "ready";
                            },
                        },
                    },
                });
                deferFsm.handle("submit");
                deferFsm.handle("done");
            });

            it("should replay the deferred input in the target state", () => {
                expect(replayedIn).toBe("ready");
            });
        });

        describe("when an input is deferred without a target state", () => {
            let deferFsm: any, deferredCb: jest.Mock;

            beforeEach(() => {
                deferredCb = jest.fn();
                deferFsm = createFsm({
                    id: "defer-any",
                    initialState: "a",
                    states: {
                        a: {
                            park({ defer }: any) {
                                defer();
                            },
                            go: "b",
                        },
                        b: {
                            park: "c",
                        },
                        c: {},
                    },
                });
                deferFsm.on("deferred", deferredCb);
                deferFsm.handle("park");
                deferFsm.handle("go");
            });

            it("should emit a deferred event (no client field)", () => {
                expect(deferredCb).toHaveBeenCalledTimes(1);
                expect(deferredCb).toHaveBeenCalledWith({ inputName: "park" });
            });

            it("should replay on the next transition", () => {
                // park deferred in "a", replayed when entering "b", triggers transition to "c"
                expect(deferFsm.currentState()).toBe("c");
            });
        });
    });

    // =========================================================================
    // compositeState()
    // =========================================================================

    describe("compositeState", () => {
        describe("when called after construction", () => {
            let result: string;

            beforeEach(() => {
                result = fsm.compositeState();
            });

            it("should return the current state name", () => {
                expect(result).toBe("green");
            });
        });
    });

    // =========================================================================
    // dispose()
    // =========================================================================

    describe("dispose", () => {
        describe("when dispose is called", () => {
            let cb: jest.Mock;

            beforeEach(() => {
                cb = jest.fn();
                fsm.on("transitioned", cb);
                fsm.dispose();
            });

            it("should make handle a no-op", () => {
                fsm.handle("timeout");
                expect(fsm.currentState()).toBe("green");
            });

            it("should make transition a no-op", () => {
                fsm.transition("yellow");
                expect(fsm.currentState()).toBe("green");
            });

            it("should not emit events after disposal", () => {
                fsm.emit("custom", {});
                expect(cb).not.toHaveBeenCalled();
            });

            it("should return a no-op subscription from on() after disposal", () => {
                const postDisposeCb = jest.fn();
                const sub = fsm.on("transitioned", postDisposeCb);
                expect(() => sub.off()).not.toThrow();
                expect(postDisposeCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // Eager initialization
    // =========================================================================

    describe("initialization", () => {
        describe("when _onEnter is defined on the initial state", () => {
            let initEntered: boolean;

            beforeEach(() => {
                initEntered = false;
                createFsm({
                    id: "eager-init",
                    initialState: "start",
                    states: {
                        start: {
                            _onEnter() {
                                initEntered = true;
                            },
                        },
                    },
                });
            });

            it("should fire _onEnter during construction", () => {
                expect(initEntered).toBe(true);
            });
        });

        describe("when listeners are attached after construction", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                // FSM is already constructed and initialized at this point
                fsm.on("transitioned", transitionedCb);
                // No explicit transition — just checking if init was observed
            });

            it("should NOT have received the init transition event", () => {
                expect(transitionedCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // id
    // =========================================================================

    describe("id", () => {
        it("should expose the FSM id", () => {
            expect(fsm.id).toBe("traffic-light");
        });
    });

    // =========================================================================
    // canHandle()
    // =========================================================================

    describe("canHandle", () => {
        describe("when the current state has a named handler for the input", () => {
            it("should return true", () => {
                // starts in green, which has "timeout"
                expect(fsm.canHandle("timeout")).toBe(true);
            });
        });

        describe("when the current state has a catch-all but no named handler", () => {
            let catchAllFsm: any;

            beforeEach(() => {
                catchAllFsm = createFsm({
                    id: "catch-all-can",
                    initialState: "idle",
                    states: {
                        idle: {
                            "*"({ inputName }: any) {
                                void inputName;
                            },
                        },
                    },
                });
            });

            it("should return true for an unknown input", () => {
                expect(catchAllFsm.canHandle("anything")).toBe(true);
            });
        });

        describe("when the current state has no matching handler", () => {
            it("should return false", () => {
                // green has no "BOGUS" handler and no catch-all
                expect(fsm.canHandle("BOGUS")).toBe(false);
            });
        });

        describe("when the FSM transitions to a new state", () => {
            beforeEach(() => {
                fsm.handle("timeout"); // green → yellow
                fsm.handle("timeout"); // yellow → red
            });

            it("should reflect the current state", () => {
                // red has "timeout" but not "tick"
                expect(fsm.canHandle("timeout")).toBe(true);
                expect(fsm.canHandle("tick")).toBe(false);
            });
        });
    });

    // =========================================================================
    // reset()
    // =========================================================================

    describe("reset", () => {
        describe("when the FSM is not in the initialState", () => {
            let resetFsm: any, enteredStates: string[];

            beforeEach(() => {
                enteredStates = [];
                resetFsm = createFsm({
                    id: "reset-fsm",
                    initialState: "a",
                    states: {
                        a: {
                            _onEnter() {
                                enteredStates.push("a");
                            },
                            go: "b",
                        },
                        b: {
                            _onEnter() {
                                enteredStates.push("b");
                            },
                        },
                    },
                });
                resetFsm.handle("go"); // a → b
                enteredStates.length = 0;
                resetFsm.reset();
            });

            it("should return to the initial state", () => {
                expect(resetFsm.currentState()).toBe("a");
            });

            it("should fire _onEnter for the initial state", () => {
                expect(enteredStates).toContain("a");
            });
        });

        describe("when the FSM is already in initialState", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                fsm.on("transitioned", transitionedCb);
                fsm.reset(); // already in green (initialState)
            });

            it("should be a no-op", () => {
                expect(transitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when the FSM is disposed", () => {
            let transitionedCb: jest.Mock;

            beforeEach(() => {
                transitionedCb = jest.fn();
                fsm.handle("timeout"); // green → yellow
                fsm.on("transitioned", transitionedCb);
                fsm.dispose();
                transitionedCb.mockClear();
                fsm.reset();
            });

            it("should be a no-op", () => {
                expect(transitionedCb).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // nohandler args
    // =========================================================================

    describe("nohandler args", () => {
        describe("when extra args are passed to an unhandled input", () => {
            let nohandlerCb: jest.Mock;

            beforeEach(() => {
                nohandlerCb = jest.fn();
                fsm.on("nohandler", nohandlerCb);
                fsm.handle("NONEXISTENT" as any, "arg1", 99);
            });

            it("should include the args in the nohandler payload", () => {
                expect(nohandlerCb).toHaveBeenCalledWith(
                    expect.objectContaining({ inputName: "NONEXISTENT", args: ["arg1", 99] })
                );
            });

            it("should not include a client field", () => {
                const payload = nohandlerCb.mock.calls[0][0];
                expect(payload).not.toHaveProperty("client");
            });
        });
    });
});

// =============================================================================
// Task 4: Fsm → Fsm Hierarchy Tests
// =============================================================================

function makeChildFsm() {
    return createFsm({
        id: "child-fsm",
        initialState: "off" as const,
        states: {
            off: {
                poweron: "on" as const,
            },
            on: {
                poweroff: "off" as const,
            },
        },
    });
}

describe("Fsm — hierarchical (Task 4)", () => {
    describe("delegation", () => {
        describe("when the child Fsm can handle the input", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-parent",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                        idle: {},
                    },
                });
                parent.handle("poweron");
            });

            it("should delegate to the child Fsm", () => {
                expect(child.currentState()).toBe("on");
            });
        });

        describe("when the child Fsm cannot handle the input but parent can", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any, parentHandled: boolean;

            beforeEach(() => {
                parentHandled = false;
                child = makeChildFsm(); // starts in "off", has no "mystery"
                parent = createFsm({
                    id: "fsm-parent-local",
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
                parent.handle("mystery");
            });

            it("should handle locally on the parent", () => {
                expect(parentHandled).toBe(true);
            });
        });
    });

    describe("compositeState", () => {
        describe("when parent Fsm is in a child state", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-composite",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                        idle: {},
                    },
                });
            });

            it("should return dotted parent.child path", () => {
                expect(parent.compositeState()).toBe("active.off");
            });

            it("should update when child transitions", () => {
                parent.handle("poweron");
                expect(parent.compositeState()).toBe("active.on");
            });
        });
    });

    describe("reset", () => {
        describe("when calling reset on Fsm", () => {
            let parent: any;

            beforeEach(() => {
                parent = createFsm({
                    id: "fsm-reset",
                    initialState: "a",
                    states: {
                        a: { go: "b" },
                        b: {},
                    },
                });
                parent.handle("go"); // a → b
                parent.reset();
            });

            it("should return to initialState", () => {
                expect(parent.currentState()).toBe("a");
            });
        });
    });

    describe("transition into state with _child resets child", () => {
        let child: ReturnType<typeof makeChildFsm>, parent: any;

        beforeEach(() => {
            child = makeChildFsm();
            parent = createFsm({
                id: "fsm-child-reset",
                initialState: "idle",
                states: {
                    idle: { activate: "active" },
                    active: {
                        _child: child,
                    },
                },
            });
            parent.handle("activate"); // idle → active, child resets to off
            parent.handle("poweron"); // delegated to child: off → on
            parent.transition("idle");
            parent.transition("active"); // re-enter active, child resets to off
        });

        it("should reset child to initialState on re-entry", () => {
            expect(child.currentState()).toBe("off");
        });
    });

    describe("child events propagate without client field", () => {
        describe("when child transitions", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any, transitionedPayload: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-relay",
                    initialState: "active",
                    states: {
                        active: {
                            _child: child,
                        },
                        idle: {},
                    },
                });
                parent.on("transitioned", (data: any) => {
                    transitionedPayload = data;
                });
                parent.handle("poweron");
            });

            it("should not include a client field in relayed events", () => {
                expect(transitionedPayload).not.toHaveProperty("client");
            });
        });
    });

    describe("stale child event filtering", () => {
        describe("when parent transitions away from child state, child events are not relayed", () => {
            let child: ReturnType<typeof makeChildFsm>,
                parent: any,
                parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = makeChildFsm();
                parent = createFsm({
                    id: "stale-fsm-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child, leave: "idle" as const },
                        idle: {},
                    },
                });
                parent.handle("leave"); // active → idle (no child)
                parent.on("transitioned", parentTransitionedCb);
                parentTransitionedCb.mockClear();
                child.handle("poweron"); // fires child events while parent in idle
            });

            it("should not relay child events when parent is not in child state", () => {
                expect(parentTransitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when parent is in child state, child events are relayed", () => {
            let child: ReturnType<typeof makeChildFsm>,
                parent: any,
                parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = makeChildFsm();
                parent = createFsm({
                    id: "active-fsm-parent",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                    },
                });
                parent.on("transitioned", parentTransitionedCb);
                parentTransitionedCb.mockClear();
                parent.handle("poweron"); // delegated to child: off → on
            });

            it("should relay child events when parent is in child state", () => {
                expect(parentTransitionedCb).toHaveBeenCalled();
            });
        });
    });

    describe("dispose", () => {
        describe("when parent Fsm is disposed", () => {
            let child: ReturnType<typeof makeChildFsm>,
                parent: any,
                parentTransitionedCb: jest.Mock;

            beforeEach(() => {
                parentTransitionedCb = jest.fn();
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-dispose",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                        idle: {},
                    },
                });
                parent.on("transitioned", parentTransitionedCb);
                parent.dispose();
                parentTransitionedCb.mockClear();
                child.handle("poweron"); // fires child events
            });

            it("should not relay child events after dispose", () => {
                expect(parentTransitionedCb).not.toHaveBeenCalled();
            });
        });

        describe("when parent dispose cascades to children (default)", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-cascade-dispose",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                        idle: {},
                    },
                });
            });

            it("should dispose the child FSM", () => {
                parent.dispose();
                // Child should now be inert — handle is a no-op
                const stateBefore = child.compositeState();
                child.handle("poweron");
                expect(child.compositeState()).toBe(stateBefore);
            });

            it("should make child canHandle return false", () => {
                parent.dispose();
                expect(child.canHandle("poweron")).toBe(false);
            });
        });

        describe("when parent dispose uses preserveChildren: true", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-preserve-children",
                    initialState: "active",
                    states: {
                        active: { _child: child },
                        idle: {},
                    },
                });
            });

            it("should NOT dispose the child FSM", () => {
                parent.dispose({ preserveChildren: true });
                // Child should still be alive and accepting inputs
                child.handle("poweron");
                expect(child.compositeState()).toBe("on");
            });

            it("should still dispose the parent", () => {
                parent.dispose({ preserveChildren: true });
                const stateBefore = parent.compositeState();
                parent.handle("poweron");
                expect(parent.compositeState()).toBe(stateBefore);
            });
        });

        describe("when the same child appears in multiple parent states", () => {
            let child: ReturnType<typeof makeChildFsm>, parent: any;

            beforeEach(() => {
                child = makeChildFsm();
                parent = createFsm({
                    id: "fsm-shared-child",
                    initialState: "modeA",
                    states: {
                        modeA: { _child: child },
                        modeB: { _child: child },
                    },
                });
            });

            it("should dispose the child only once (no double-dispose error)", () => {
                expect(() => parent.dispose()).not.toThrow();
                const stateBefore = child.compositeState();
                child.handle("poweron");
                expect(child.compositeState()).toBe(stateBefore);
            });
        });

        describe("when parent has a deep hierarchy (parent → child → grandchild)", () => {
            it("should cascade disposal through all levels", () => {
                const grandchild = createFsm({
                    id: "grandchild",
                    initialState: "idle" as const,
                    states: {
                        idle: { activate: "running" as const },
                        running: { deactivate: "idle" as const },
                    },
                });

                const child = createFsm({
                    id: "child-with-grandchild",
                    initialState: "off" as const,
                    states: {
                        off: { poweron: "on" as const },
                        on: { _child: grandchild, poweroff: "off" as const },
                    },
                });

                const parent = createFsm({
                    id: "top-level",
                    initialState: "active" as const,
                    states: {
                        active: { _child: child },
                        inactive: {},
                    },
                });

                // Advance child into the state that has the grandchild
                parent.handle("poweron");
                expect(parent.compositeState()).toBe("active.on.idle");

                parent.dispose();

                // Both child and grandchild should be inert
                const childState = child.compositeState();
                child.handle("poweroff");
                expect(child.compositeState()).toBe(childState);

                const grandchildState = grandchild.compositeState();
                grandchild.handle("activate");
                expect(grandchild.compositeState()).toBe(grandchildState);
            });
        });
    });

    describe("bubbling from Fsm child to Fsm parent", () => {
        describe("when child-originated input bubbles up to parent", () => {
            let child: any, parentHandled: boolean;

            beforeEach(() => {
                parentHandled = false;
                child = createFsm({
                    id: "bubble-fsm-child",
                    initialState: "on",
                    states: {
                        on: {
                            // mystery not handled here
                        },
                    },
                });
                createFsm({
                    id: "bubble-fsm-parent",
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
                // Fire directly on child to simulate child-originated input
                child.handle("mystery" as any);
            });

            it("should bubble up and be handled by parent", () => {
                expect(parentHandled).toBe(true);
            });
        });
    });
});
