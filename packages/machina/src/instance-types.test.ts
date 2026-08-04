export default {};

import {
    createBehavioralFsm,
    createFsm,
    type ClientOf,
    type ContextOf,
    type InputNamesOfInstance,
    type StateNamesOfInstance,
} from "./index";

type Expect<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
            ? true
            : false
        : false;
type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false;

describe("instance type extractors", () => {
    describe("when extracting from a single-client FSM instance", () => {
        const fsm = createFsm({
            id: "traffic",
            initialState: "green",
            context: { ticks: 0 },
            states: {
                green: {
                    tick({ ctx }) {
                        ctx.ticks++;
                    },
                    timeout: "yellow",
                },
                yellow: {
                    timeout: "green",
                },
            },
        });

        type FsmInstance = typeof fsm;

        type _StateNames = Expect<Equal<StateNamesOfInstance<FsmInstance>, "green" | "yellow">>;
        type _InputNames = Expect<Equal<InputNamesOfInstance<FsmInstance>, "tick" | "timeout">>;
        type _Context = Expect<Equal<ContextOf<FsmInstance>, { ticks: number }>>;
        type _Client = Expect<Equal<ClientOf<FsmInstance>, never>>;
        type _StateNamesDoNotWidenToString = Expect<
            Equal<string extends StateNamesOfInstance<FsmInstance> ? true : false, false>
        >;
        type _InputNamesDoNotWidenToMethods = Expect<
            Equal<"handle" extends InputNamesOfInstance<FsmInstance> ? true : false, false>
        >;
        type _ContextDoesNotBecomeUnknown = Expect<Equal<IsUnknown<ContextOf<FsmInstance>>, false>>;

        let result: string;

        beforeEach(() => {
            result = fsm.currentState();
        });

        it("should preserve the runtime FSM behavior used for type extraction", () => {
            expect(result).toBe("green");
        });
    });

    describe("when extracting from a behavioral FSM instance", () => {
        type Client = { id: string; count: number };

        const states = {
            idle: {
                start: "active",
            },
            active: {
                increment({ ctx }: { ctx: Client }) {
                    ctx.count++;
                },
                stop: "idle",
            },
        } as const;

        const fsm = createBehavioralFsm<Client, typeof states>({
            id: "counter",
            initialState: "idle",
            states,
        });

        type FsmInstance = typeof fsm;

        type _StateNames = Expect<Equal<StateNamesOfInstance<FsmInstance>, "idle" | "active">>;
        type _InputNames = Expect<
            Equal<InputNamesOfInstance<FsmInstance>, "start" | "increment" | "stop">
        >;
        type _Client = Expect<Equal<ClientOf<FsmInstance>, Client>>;
        type _Context = Expect<Equal<ContextOf<FsmInstance>, never>>;
        type _StateNamesDoNotWidenToString = Expect<
            Equal<string extends StateNamesOfInstance<FsmInstance> ? true : false, false>
        >;
        type _InputNamesDoNotWidenToMethods = Expect<
            Equal<"transition" extends InputNamesOfInstance<FsmInstance> ? true : false, false>
        >;
        type _ClientDoesNotBecomeUnknown = Expect<Equal<IsUnknown<ClientOf<FsmInstance>>, false>>;

        let result: string | undefined;

        beforeEach(() => {
            result = fsm.currentState({ id: "a", count: 0 });
        });

        it("should preserve unseen-client state semantics", () => {
            expect(result).toBeUndefined();
        });
    });

    describe("when extracting from a non-machina object", () => {
        type NotFsm = {
            currentState(): "idle";
            handle(inputName: string): void;
        };

        type _StateNames = Expect<Equal<StateNamesOfInstance<NotFsm>, never>>;
        type _InputNames = Expect<Equal<InputNamesOfInstance<NotFsm>, never>>;
        type _Context = Expect<Equal<ContextOf<NotFsm>, never>>;
        type _Client = Expect<Equal<ClientOf<NotFsm>, never>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject structural lookalikes at the type level", () => {
            expect(result).toBe("checked");
        });
    });
});
