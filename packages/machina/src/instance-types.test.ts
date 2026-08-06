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

// Pins the three createBehavioralFsm call-form shapes (curried, full-inference,
// explicit-both) described in issue #182 — distinct from the extractor
// describes above, which test ClientOf/StateNamesOfInstance/etc. on an
// already-constructed instance rather than the factory call shape itself.
describe("createBehavioralFsm call-form contract", () => {
    type Connection = { url: string; retries: number };

    const connectivityStates = {
        disconnected: { connect: "connecting" },
        connecting: { connected: "online", failed: "disconnected" },
        online: { disconnect: "disconnected" },
    } as const;

    describe("when constructed via the curried call form", () => {
        const curriedFsm = createBehavioralFsm<Connection>()({
            id: "connectivity",
            initialState: "disconnected",
            states: connectivityStates,
        });

        type CurriedFsm = typeof curriedFsm;

        // TClient must resolve to the real client shape, not `object` or `unknown` —
        // `object` is exactly what a lost-inference regression would produce.
        type _Client = Expect<Equal<ClientOf<CurriedFsm>, Connection>>;
        // TStates must stay a literal union, not widen to `string` — this is the
        // headline feature the curried form exists to preserve.
        type _StateNames = Expect<
            Equal<StateNamesOfInstance<CurriedFsm>, "disconnected" | "connecting" | "online">
        >;
        type _InputNames = Expect<
            Equal<
                InputNamesOfInstance<CurriedFsm>,
                "connect" | "connected" | "failed" | "disconnect"
            >
        >;

        let result: string | undefined;

        beforeEach(() => {
            const client: Connection = { url: "wss://example.com", retries: 0 };
            curriedFsm.handle(client, "connect");
            result = curriedFsm.currentState(client);
        });

        it("should construct a working FSM whose handle() actually transitions", () => {
            expect(result).toBe("connecting");
        });
    });

    describe("when using object-spread handlers under the curried call form", () => {
        // Regression test for the exact bug in issue #182: under the zero-type-arg
        // form, TypeScript won't look inside a `...spread` for an inline `ctx`
        // annotation, so TClient silently widens to `object`. The curried form
        // fixes TClient before the config is ever seen, so spread handlers need
        // no inline annotation at all and still type-check against Connection.
        const sharedGuards = {
            connected: "online",
            failed: "disconnected",
        } as const;

        const _spreadFsm = createBehavioralFsm<Connection>()({
            id: "connectivity-spread",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                connecting: { ...sharedGuards },
                online: { disconnect: "disconnected" },
            },
        });

        type _Client = Expect<Equal<ClientOf<typeof _spreadFsm>, Connection>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should type-check spread-composed handlers under the curried form", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when invalid usage is attempted", () => {
        // Each pin below MUST be a genuine compile error — ts-jest fails the
        // suite if a @ts-expect-error directive goes unused, so these are
        // self-verifying in both directions (an unguarded regression fails to
        // compile; a directive with nothing to suppress also fails to compile).

        const _invalidTransitionTarget = createBehavioralFsm<Connection>()({
            id: "invalid-transition-target",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                connecting: {
                    // @ts-expect-error -- "onilne" is not a declared state name; the string-shorthand transition target must be rejected
                    connected: "onilne",
                    failed: "disconnected",
                },
                online: { disconnect: "disconnected" },
            },
        });

        const _invalidInitialState = createBehavioralFsm<Connection>()({
            id: "invalid-initial-state",
            // @ts-expect-error -- "pending" is not a key of connectivityStates; initialState must be validated even under the curried form
            initialState: "pending",
            states: connectivityStates,
        });

        const curriedFsm = createBehavioralFsm<Connection>()({
            id: "connectivity-negative",
            initialState: "disconnected",
            states: connectivityStates,
        });
        // @ts-expect-error -- "unknownInput" is not a member of the literal input-name union; handle() must reject it
        curriedFsm.handle({ url: "wss://example.com", retries: 0 }, "unknownInput");

        // @ts-expect-error -- the old single-type-arg direct call must stay rejected; if this ever compiles, TStates silently gained an unsafe default and every literal validation above is dead
        const _oldBrokenForm = createBehavioralFsm<Connection>({
            id: "old-broken-form",
            initialState: "disconnected",
            states: connectivityStates,
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject every invalid usage above at compile time", () => {
            expect(result).toBe("checked");
        });
    });
});

describe("createBehavioralFsm curried form — additional hardening", () => {
    describe("when the curried factory is invoked with no explicit type argument", () => {
        // No <TClient> supplied, and the zero-arg overload takes no parameters
        // for TS to infer TClient from either — it falls back to the generic's
        // constraint, `object`. This is distinct from the zero-type-arg DIRECT
        // call form (full inference), which infers TClient from an inline `ctx`
        // annotation visible on a handler; here there's no config yet at the
        // outer call site for TS to look at at all.
        const _bareFsm = createBehavioralFsm()({
            id: "bare",
            initialState: "idle",
            states: {
                idle: {
                    poke({ ctx }) {
                        // @ts-expect-error -- ctx fell back to `object` (TClient's constraint, not a real client shape) since no type argument or inferable config was available at the zero-arg call site
                        return ctx.anything ? "idle" : "idle";
                    },
                },
            },
        });

        type BareFsm = typeof _bareFsm;
        type _Client = Expect<Equal<ClientOf<BareFsm>, object>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should fall TClient back to its `object` constraint, making handler ctx property access a compile error", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when TClient is a union of object types", () => {
        type Wifi = { kind: "wifi"; ssid: string };
        type Cellular = { kind: "cellular"; carrier: string };
        type Radio = Wifi | Cellular;

        const _radioFsm = createBehavioralFsm<Radio>()({
            id: "radio",
            initialState: "idle",
            states: {
                idle: {
                    connect({ ctx }) {
                        // @ts-expect-error -- "carrier" only exists on the Cellular member of the Radio union; accessing it without first narrowing on "kind" must be rejected
                        return ctx.carrier ? "connecting" : "connecting";
                    },
                },
                connecting: { connected: "online" },
                online: {},
            },
        });

        type RadioFsm = typeof _radioFsm;
        type _Client = Expect<Equal<ClientOf<RadioFsm>, Radio>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should preserve the union client shape through the curried factory instead of collapsing it", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when TClient has readonly and optional properties", () => {
        type ImmutableProfile = {
            readonly id: string;
            nickname?: string;
        };

        const _profileFsm = createBehavioralFsm<ImmutableProfile>()({
            id: "profile",
            initialState: "idle",
            states: {
                idle: {
                    rename({ ctx }) {
                        // @ts-expect-error -- "id" is readonly on ImmutableProfile; the curried form must preserve that modifier rather than widening ctx to a mutable shape
                        ctx.id = "someone-else";
                    },
                    greet({ ctx }) {
                        // @ts-expect-error -- "nickname" is optional; calling a string method on it without a guard must be rejected rather than widened to a required string
                        return ctx.nickname.toUpperCase() ? "idle" : "idle";
                    },
                },
            },
        });

        type ProfileFsm = typeof _profileFsm;
        type _Client = Expect<Equal<ClientOf<ProfileFsm>, ImmutableProfile>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject a readonly-property write and an unguarded optional-property access", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when defer({ until }) is exercised under the curried form", () => {
        type Connection = { url: string; retries: number };

        // NOTE: defer()'s `until` option is NOT narrowed to the literal state-name
        // union here (or under any other call form — verified this predates the
        // curried overload and reproduces identically under the zero-type-arg
        // full-inference direct call). `HandlerArgs.defer`'s `TStateNames` binding
        // silently widens to `string` while the handler function body is
        // type-checked, even though the SAME TStateNames correctly narrows the
        // handler's own return-target and every string-shorthand transition value
        // (see the "invalid usage" block above). This is a genuine, pre-existing
        // gap in defer()'s type, not something this factory-currying change
        // introduced or fixes — tracked as a follow-up, not asserted here as
        // rejected, since doing so would pin a false expectation.
        const _connectivityWithDefer = createBehavioralFsm<Connection>()({
            id: "connectivity-defer",
            initialState: "disconnected",
            states: {
                disconnected: {
                    connect({ defer }) {
                        defer({ until: "online" });
                        return "connecting";
                    },
                },
                connecting: { connected: "online", failed: "disconnected" },
                online: { disconnect: "disconnected" },
            },
        });

        type _Client = Expect<Equal<ClientOf<typeof _connectivityWithDefer>, Connection>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should type-check a handler that calls defer({ until }) with a valid target under the curried form", () => {
            expect(result).toBe("checked");
        });
    });
});
