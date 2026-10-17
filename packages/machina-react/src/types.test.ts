// =============================================================================
// types.test.ts — Compile-time pins for the hook result types
//
// The payload enforcement under test is type-only, so most assertions here are
// ts-expect-error pins that ts-jest verifies at compile time. The runtime
// assertions confirm the cast in hooks.ts still forwards payloads verbatim.
// =============================================================================
export default {};

import { createElement } from "react";
import { act, render } from "@testing-library/react";
import { createBehavioralFsm, createFsm } from "machina";
import { useFsm, useBehavioralFsm } from "./index";
import type { BehavioralFsmHookResult, FsmHookResult } from "./index";

type CounterInputs = {
    tick: [];
    add: [amount: number];
};

const createTypedCounterFsm = () =>
    createFsm<CounterInputs>()({
        id: "typed-counter",
        initialState: "idle",
        context: { count: 0 },
        states: {
            idle: {
                tick({ ctx }) {
                    ctx.count++;
                },
                add({ ctx }, amount) {
                    ctx.count += amount;
                },
            },
        },
    });

const createUntypedCounterFsm = () =>
    createFsm({
        id: "untyped-counter",
        initialState: "idle",
        context: { count: 0 },
        states: {
            idle: {
                tick({ ctx }) {
                    ctx.count++;
                },
            },
        },
    });

interface Session {
    hits: number;
}

const createTypedSessionFsm = () =>
    createBehavioralFsm<Session, CounterInputs>()({
        id: "typed-session",
        initialState: "idle",
        states: {
            idle: {
                tick({ ctx }) {
                    ctx.hits++;
                },
                add({ ctx }, amount) {
                    ctx.hits += amount;
                },
            },
        },
    });

describe("hook result handle typing", () => {
    describe("when the FSM declares an input payload map", () => {
        type TypedResult = FsmHookResult<ReturnType<typeof createTypedCounterFsm>>;
        const result = null as unknown as TypedResult;

        it("should accept declared calls and reject undeclared ones at compile time", () => {
            const pins = () => {
                result.handle("tick");
                result.handle("add", 2);
                // @ts-expect-error `add` requires its number payload
                result.handle("add");
                // @ts-expect-error `add` takes a number, never a string
                result.handle("add", "2");
                // @ts-expect-error `tick` declares an empty payload tuple
                result.handle("tick", 1);
                // @ts-expect-error the input name must come from the map
                result.handle("nope");
            };
            expect(typeof pins).toEqual("function");
        });
    });

    describe("when the behavioral FSM declares an input payload map", () => {
        type TypedResult = BehavioralFsmHookResult<ReturnType<typeof createTypedSessionFsm>>;
        const result = null as unknown as TypedResult;

        it("should enforce the same payload rules with the client pre-bound", () => {
            const pins = () => {
                result.handle("tick");
                result.handle("add", 3);
                // @ts-expect-error `add` requires its number payload
                result.handle("add");
                // @ts-expect-error the input name must come from the map
                result.handle("nope", 1);
            };
            expect(typeof pins).toEqual("function");
        });
    });

    describe("when the FSM is untyped", () => {
        type UntypedResult = FsmHookResult<ReturnType<typeof createUntypedCounterFsm>>;
        const result = null as unknown as UntypedResult;

        it("should keep payload arguments loose while still checking input names", () => {
            const pins = () => {
                result.handle("tick");
                result.handle("tick", 1, "extra");
                // @ts-expect-error input names stay checked on the untyped path
                result.handle("nope");
            };
            expect(typeof pins).toEqual("function");
        });
    });
});

describe("runtime payload forwarding through the typed handle", () => {
    describe("when a component dispatches a payload-carrying input", () => {
        let fsm: ReturnType<typeof createTypedCounterFsm>;
        let captured: FsmHookResult<ReturnType<typeof createTypedCounterFsm>> | undefined;

        const Capture = () => {
            captured = useFsm(fsm);
            return null;
        };

        beforeEach(() => {
            fsm = createTypedCounterFsm();
            captured = undefined;
            render(createElement(Capture));
            act(() => {
                captured?.handle("add", 5);
            });
        });

        it("should forward the payload to the handler", () => {
            expect(fsm.context).toEqual({ count: 5 });
        });
    });

    describe("when a component dispatches for a behavioral client", () => {
        let fsm: ReturnType<typeof createTypedSessionFsm>;
        let session: Session;
        let captured: BehavioralFsmHookResult<ReturnType<typeof createTypedSessionFsm>> | undefined;

        const Capture = () => {
            captured = useBehavioralFsm(fsm, session);
            return null;
        };

        beforeEach(() => {
            fsm = createTypedSessionFsm();
            session = { hits: 0 };
            captured = undefined;
            render(createElement(Capture));
            act(() => {
                captured?.handle("add", 4);
            });
        });

        it("should forward the payload to the client's handler", () => {
            expect(session).toEqual({ hits: 4 });
        });
    });
});
