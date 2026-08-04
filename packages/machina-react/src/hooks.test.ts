import { createElement } from "react";
import { act, render } from "@testing-library/react";
import { createBehavioralFsm, createFsm } from "machina";
import {
    shallowEqual,
    useBehavioralFsm,
    useBehavioralFsmEvent,
    useBehavioralFsmSelector,
    useFsm,
    useFsmEvent,
    useFsmSelector,
} from "./index";

const flushReact = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

function createCounterFsm() {
    return createFsm({
        id: "counter",
        initialState: "idle",
        context: { count: 0 },
        states: {
            idle: {
                tick({ ctx }) {
                    ctx.count++;
                },
                advance({ ctx }) {
                    ctx.count++;
                    return "active";
                },
            },
            active: {
                tick({ ctx }) {
                    ctx.count++;
                },
            },
        },
    });
}

describe("machina-react hooks", () => {
    describe("when useFsm observes a settled transition", () => {
        const renders: Array<{ state: string; count: number }> = [];
        let latest: ReturnType<typeof useFsm<ReturnType<typeof createCounterFsm>>>;

        beforeEach(async () => {
            renders.length = 0;
            const fsm = createCounterFsm();

            const Probe = () => {
                latest = useFsm(fsm);
                renders.push({ state: latest.state, count: latest.context.count });
                return null;
            };

            render(createElement(Probe));
            act(() => {
                latest.handle("advance");
            });
            await flushReact();
        });

        it("should render the initial snapshot and one final settled snapshot", () => {
            expect(renders).toEqual([
                { state: "idle", count: 0 },
                { state: "active", count: 1 },
            ]);
        });
    });

    describe("when useFsmSelector selects a primitive", () => {
        const selectedStates: string[] = [];
        let fsm: ReturnType<typeof createCounterFsm>;

        beforeEach(async () => {
            selectedStates.length = 0;
            fsm = createCounterFsm();

            const Probe = () => {
                selectedStates.push(useFsmSelector(fsm, snapshot => snapshot.state));
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle("tick");
            });
            await flushReact();
            act(() => {
                fsm.handle("advance");
            });
            await flushReact();
        });

        it("should skip renders while the selected primitive is equal", () => {
            expect(selectedStates).toEqual(["idle", "active"]);
        });
    });

    describe("when useFsmSelector selects an object with shallowEqual", () => {
        const selectedStates: string[] = [];
        let fsm: ReturnType<typeof createCounterFsm>;

        beforeEach(async () => {
            selectedStates.length = 0;
            fsm = createCounterFsm();

            const Probe = () => {
                const selected = useFsmSelector(fsm, snapshot => ({ state: snapshot.state }), {
                    isEqual: shallowEqual,
                });
                selectedStates.push(selected.state);
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle("tick");
            });
            await flushReact();
            act(() => {
                fsm.handle("advance");
            });
            await flushReact();
        });

        it("should skip renders while the selected object is shallowly equal", () => {
            expect(selectedStates).toEqual(["idle", "active"]);
        });
    });

    describe("when useFsmSelector receives an equality function that always returns true", () => {
        const selectedVersions: number[] = [];
        let fsm: ReturnType<typeof createCounterFsm>;

        beforeEach(async () => {
            selectedVersions.length = 0;
            fsm = createCounterFsm();

            const Probe = () => {
                selectedVersions.push(
                    useFsmSelector(fsm, snapshot => snapshot.version, { isEqual: () => true })
                );
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle("advance");
            });
            await flushReact();
        });

        it("should keep React from rendering new selected values", () => {
            expect(selectedVersions).toEqual([0]);
        });
    });

    describe("when useFsm receives a new FSM instance", () => {
        let firstFsm: ReturnType<typeof createCounterFsm>;
        let secondFsm: ReturnType<typeof createCounterFsm>;
        let latest: ReturnType<typeof useFsm<ReturnType<typeof createCounterFsm>>>;
        let initialHandle: typeof latest.handle;
        let initialCanHandle: typeof latest.canHandle;
        let canHandleAfterTransition: boolean;
        let view: ReturnType<typeof render>;

        beforeEach(async () => {
            firstFsm = createCounterFsm();
            secondFsm = createCounterFsm();

            const Probe = ({ fsm }: { fsm: ReturnType<typeof createCounterFsm> }) => {
                latest = useFsm(fsm);
                return null;
            };

            view = render(createElement(Probe, { fsm: firstFsm }));
            initialHandle = latest.handle;
            initialCanHandle = latest.canHandle;
            view.rerender(createElement(Probe, { fsm: secondFsm }));
            act(() => {
                initialHandle("advance");
            });
            await flushReact();
            canHandleAfterTransition = initialCanHandle("advance");
        });

        it("should keep the imperative callback references stable", () => {
            expect(latest.handle).toBe(initialHandle);
            expect(latest.canHandle).toBe(initialCanHandle);
        });

        it("should delegate stable callbacks to the latest FSM", () => {
            expect(firstFsm.currentState()).toBe("idle");
            expect(firstFsm.context.count).toBe(0);
            expect(secondFsm.currentState()).toBe("active");
            expect(secondFsm.context.count).toBe(1);
            expect(canHandleAfterTransition).toBe(false);
        });
    });

    describe("when useBehavioralFsm observes one client", () => {
        type Client = { id: string; count: number };
        const states = {
            idle: {
                start: "active",
            },
            active: {},
        } as const;
        const renders: Array<string | undefined> = [];
        let fsm: ReturnType<typeof createBehavioralFsm<Client, typeof states>>;
        let clientA: Client;
        let clientB: Client;

        beforeEach(async () => {
            renders.length = 0;
            clientA = { id: "a", count: 0 };
            clientB = { id: "b", count: 0 };
            fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral-hook",
                initialState: "idle",
                states,
            });

            const Probe = () => {
                renders.push(useBehavioralFsm(fsm, clientA).state);
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle(clientB, "start");
            });
            await flushReact();
            act(() => {
                fsm.handle(clientA, "start");
            });
            await flushReact();
        });

        it("should preserve unseen state and re-render only for the matching client", () => {
            expect(renders).toEqual([undefined, "active"]);
        });
    });

    describe("when useBehavioralFsm receives a new client", () => {
        type Client = { id: string };
        const states = {
            idle: {
                start: "active",
            },
            active: {},
        } as const;
        let fsm: ReturnType<typeof createBehavioralFsm<Client, typeof states>>;
        let clientA: Client;
        let clientB: Client;
        let latest: ReturnType<typeof useBehavioralFsm<typeof fsm>>;
        let initialHandle: typeof latest.handle;
        let initialCanHandle: typeof latest.canHandle;
        let canHandleAfterTransition: boolean;
        let view: ReturnType<typeof render>;

        beforeEach(async () => {
            clientA = { id: "a" };
            clientB = { id: "b" };
            fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral-client-change",
                initialState: "idle",
                states,
            });

            const Probe = ({ client }: { client: Client }) => {
                latest = useBehavioralFsm(fsm, client);
                return null;
            };

            view = render(createElement(Probe, { client: clientA }));
            initialHandle = latest.handle;
            initialCanHandle = latest.canHandle;
            view.rerender(createElement(Probe, { client: clientB }));
            act(() => {
                initialHandle("start");
            });
            await flushReact();
            canHandleAfterTransition = initialCanHandle("start");
        });

        it("should keep the imperative callback references stable", () => {
            expect(latest.handle).toBe(initialHandle);
            expect(latest.canHandle).toBe(initialCanHandle);
        });

        it("should delegate stable callbacks to the latest client", () => {
            expect(fsm.currentState(clientA)).toBeUndefined();
            expect(fsm.currentState(clientB)).toBe("active");
            expect(canHandleAfterTransition).toBe(false);
        });
    });

    describe("when useBehavioralFsmSelector selects a matching client's state", () => {
        type Client = { id: string };
        const states = {
            idle: {
                start: "active",
            },
            active: {},
        } as const;
        const selectedStates: Array<string | undefined> = [];
        let fsm: ReturnType<typeof createBehavioralFsm<Client, typeof states>>;
        let clientA: Client;
        let clientB: Client;

        beforeEach(async () => {
            selectedStates.length = 0;
            clientA = { id: "a" };
            clientB = { id: "b" };
            fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral-selector",
                initialState: "idle",
                states,
            });

            const Probe = () => {
                selectedStates.push(
                    useBehavioralFsmSelector(fsm, clientA, snapshot => snapshot.state)
                );
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle(clientB, "start");
            });
            await flushReact();
            act(() => {
                fsm.handle(clientA, "start");
            });
            await flushReact();
        });

        it("should skip unmatched client updates and render matching selected changes", () => {
            expect(selectedStates).toEqual([undefined, "active"]);
        });
    });

    describe("when useFsmEvent receives updates and unmounts", () => {
        const firstCallback = jest.fn();
        const secondCallback = jest.fn();
        let fsm: ReturnType<typeof createCounterFsm>;
        let renderCount = 0;
        let view: ReturnType<typeof render>;

        beforeEach(() => {
            firstCallback.mockClear();
            secondCallback.mockClear();
            renderCount = 0;
            fsm = createCounterFsm();

            const Probe = ({ callback }: { callback: (payload: unknown) => void }) => {
                renderCount++;
                useFsmEvent(fsm, "handled", callback);
                return null;
            };

            view = render(createElement(Probe, { callback: firstCallback }));
            view.rerender(createElement(Probe, { callback: secondCallback }));
            act(() => {
                fsm.handle("tick");
            });
            view.unmount();
            act(() => {
                fsm.handle("tick");
            });
        });

        it("should call the freshest callback while subscribed", () => {
            expect(firstCallback).not.toHaveBeenCalled();
            expect(secondCallback).toHaveBeenCalledTimes(1);
        });

        it("should not force a render when events fire", () => {
            expect(renderCount).toBe(2);
        });
    });

    describe("when useFsmEvent subscribes to wildcard events", () => {
        const events: string[] = [];
        let fsm: ReturnType<typeof createCounterFsm>;

        beforeEach(() => {
            events.length = 0;
            fsm = createCounterFsm();

            const Probe = () => {
                useFsmEvent(fsm, "*", eventName => {
                    events.push(eventName);
                });
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle("tick");
            });
        });

        it("should receive wildcard event names", () => {
            expect(events).toEqual(["handling", "handled"]);
        });
    });

    describe("when useBehavioralFsmEvent filters wildcard payloads", () => {
        type Client = { id: string };
        const states = {
            idle: {
                emitClientEvent({
                    ctx,
                    emit,
                }: {
                    ctx: Client;
                    emit: (name: string, data: unknown) => void;
                }) {
                    emit("custom", { client: ctx, id: ctx.id });
                },
            },
        } as const;
        const events: string[] = [];
        let fsm: ReturnType<typeof createBehavioralFsm<Client, typeof states>>;
        let clientA: Client;
        let clientB: Client;

        beforeEach(() => {
            events.length = 0;
            clientA = { id: "a" };
            clientB = { id: "b" };
            fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral-events",
                initialState: "idle",
                states,
            });

            const Probe = () => {
                useBehavioralFsmEvent(fsm, clientA, "*", eventName => {
                    events.push(eventName);
                });
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.emit("global");
                fsm.handle(clientB, "emitClientEvent");
                fsm.handle(clientA, "emitClientEvent");
            });
        });

        it("should receive clientless custom events and matching-client wildcard events only", () => {
            expect(events).toEqual([
                "global",
                "transitioning",
                "transitioned",
                "handling",
                "custom",
                "handled",
            ]);
        });
    });

    describe("when useBehavioralFsmEvent subscribes to a named event", () => {
        type Client = { id: string };
        const states = {
            idle: {
                ping() {},
            },
        } as const;
        const handledClientIds: string[] = [];
        let fsm: ReturnType<typeof createBehavioralFsm<Client, typeof states>>;
        let clientA: Client;
        let clientB: Client;

        beforeEach(() => {
            handledClientIds.length = 0;
            clientA = { id: "a" };
            clientB = { id: "b" };
            fsm = createBehavioralFsm<Client, typeof states>({
                id: "behavioral-named-events",
                initialState: "idle",
                states,
            });

            const Probe = () => {
                useBehavioralFsmEvent(fsm, clientA, "handled", payload => {
                    handledClientIds.push(payload.client.id);
                });
                return null;
            };

            render(createElement(Probe));
            act(() => {
                fsm.handle(clientB, "ping");
                fsm.handle(clientA, "ping");
            });
        });

        it("should call the callback for matching-client payloads only", () => {
            expect(handledClientIds).toEqual(["a"]);
        });
    });
});
