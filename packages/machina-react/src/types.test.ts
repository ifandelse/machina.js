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
import { useFsm, useBehavioralFsm, useFsmEvent, useBehavioralFsmEvent } from "./index";
import type {
    BehavioralFsmEventName,
    BehavioralFsmHookResult,
    FsmEventName,
    FsmHookResult,
} from "./index";

type Expect<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
            ? true
            : false
        : false;
type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false;

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

describe("event hook name and payload typing (machina #183)", () => {
    type CounterEvents = {
        milestone: { count: number };
        reset: undefined;
    };

    const createEventedCounterFsm = () =>
        createFsm<{ events: CounterEvents }>()({
            id: "evented-counter",
            initialState: "idle",
            context: { count: 0 },
            states: {
                idle: {
                    tick({ ctx, emit }) {
                        ctx.count++;
                        emit("milestone", { count: ctx.count });
                    },
                },
            },
        });

    const createEventedSessionFsm = () =>
        createBehavioralFsm<Session, { events: CounterEvents }>()({
            id: "evented-session",
            initialState: "idle",
            states: {
                idle: {
                    tick({ ctx, emit }) {
                        ctx.hits++;
                        emit("milestone", { count: ctx.hits });
                    },
                },
            },
        });

    describe("when the FSM declares an event map", () => {
        const fsm = createEventedCounterFsm();

        type _Names = Expect<
            Equal<
                FsmEventName<typeof fsm>,
                | "transitioning"
                | "transitioned"
                | "handling"
                | "handled"
                | "nohandler"
                | "invalidstate"
                | "deferred"
                | "milestone"
                | "reset"
            >
        >;

        const _typeOnly = () => {
            useFsmEvent(fsm, "milestone", payload => {
                type _Declared = Expect<Equal<typeof payload, { count: number }>>;
                void payload;
            });
            useFsmEvent(fsm, "transitioned", payload => {
                type _BuiltIn = Expect<Equal<typeof payload.toState, "idle">>;
                void payload;
            });
            useFsmEvent(fsm, "*", (eventName, data) => {
                type _Name = Expect<Equal<typeof eventName, string>>;
                void eventName;
                void data;
            });
            // @ts-expect-error -- not a declared event
            useFsmEvent(fsm, "milestones", () => {});
        };

        let result: string;

        beforeEach(() => {
            result = fsm.currentState();
        });

        it("should keep the FSM usable at runtime", () => {
            expect(result).toBe("idle");
        });
    });

    describe("when the FSM declares no event map", () => {
        const fsm = createUntypedCounterFsm();

        type _AnyName = Expect<Equal<FsmEventName<typeof fsm>, string>>;

        const _typeOnly = () => {
            useFsmEvent(fsm, "anythingGoes", payload => {
                type _Unknown = Expect<Equal<IsUnknown<typeof payload>, true>>;
                void payload;
            });
            useFsmEvent(fsm, "handled", payload => {
                type _BuiltInStaysTyped = Expect<Equal<typeof payload, { inputName: string }>>;
                void payload;
            });
        };

        let result: string;

        beforeEach(() => {
            result = fsm.currentState();
        });

        it("should keep the FSM usable at runtime", () => {
            expect(result).toBe("idle");
        });
    });

    describe("when a behavioral FSM declares an event map", () => {
        const fsm = createEventedSessionFsm();
        const session: Session = { hits: 0 };

        type _NamesIncludeDeclared = Expect<
            Equal<"milestone" extends BehavioralFsmEventName<typeof fsm> ? true : false, true>
        >;

        const _typeOnly = () => {
            // A custom payload is exactly the declared type: no client field.
            useBehavioralFsmEvent(fsm, session, "milestone", payload => {
                type _DeclaredOnly = Expect<Equal<typeof payload, { count: number }>>;
                void payload;
            });
            useBehavioralFsmEvent(fsm, session, "handled", payload => {
                type _BuiltInCarriesClient = Expect<Equal<typeof payload.client, Session>>;
                void payload;
            });
            // @ts-expect-error -- not a declared event
            useBehavioralFsmEvent(fsm, session, "milestones", () => {});
        };

        let result: string | undefined;

        beforeEach(() => {
            fsm.handle(session, "tick");
            result = fsm.currentState(session);
        });

        it("should keep the FSM usable at runtime", () => {
            expect(result).toBe("idle");
        });
    });
});
