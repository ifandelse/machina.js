export default {};

import {
    createBehavioralFsm,
    createFsm,
    BehavioralFsm,
    Fsm,
    type ClientOf,
    type ContextOf,
    type HandlerArgs,
    type InputNamesOfInstance,
    type StateNamesOfInstance,
    type BubblesOfInstance,
    type FsmConfig,
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
                // @ts-expect-error -- "onilne" is not a declared state name; the string-shorthand transition target must be rejected. Anchored on the state-object line (not the property) because ValidateStates now types the whole state as one Record value — the mismatch surfaces where "connecting" is assigned, not on the "connected" property itself.
                connecting: {
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

    describe("when defer({ until }) is exercised under the curried form (#189)", () => {
        type Connection = { url: string; retries: number };

        // #189 fix: TStateNames is now captured keys-only (see ValidateStates'
        // module comment in types.ts) BEFORE handler bodies are type-checked, so
        // defer()'s `until` option narrows to the real literal state-name union
        // instead of widening to `string`. Paired positive (valid target compiles)
        // and negative (typo'd target rejected) pins, self-verifying in both
        // directions under ts-jest.
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

        const _connectivityWithBadDefer = createBehavioralFsm<Connection>()({
            id: "connectivity-bad-defer",
            initialState: "disconnected",
            states: {
                disconnected: {
                    connect({ defer }) {
                        // @ts-expect-error -- "onlien" is a typo; defer({ until }) must be narrowed to the literal state-name union under the curried form, not widened to `string`
                        defer({ until: "onlien" });
                        return "connecting";
                    },
                },
                connecting: { connected: "online", failed: "disconnected" },
                online: { disconnect: "disconnected" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should type-check a handler that calls defer({ until }) with a valid target under the curried form", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when defer({ until }) is exercised under the full-inference form (#189)", () => {
        type Connection = { url: string; retries: number };

        // Same fix, zero-type-arg direct call form: TClient inferred from the
        // inline `ctx` annotation, TStateNames still captured keys-only.
        const _fullInferenceWithDefer = createBehavioralFsm({
            id: "full-inference-defer",
            initialState: "disconnected",
            states: {
                disconnected: {
                    connect({ ctx: _ctx }: { ctx: Connection }) {
                        return "connecting";
                    },
                },
                connecting: {
                    connected: "online",
                    heartbeat({ defer }) {
                        defer({ until: "online" });
                    },
                },
                online: { disconnect: "disconnected" },
            },
        });

        type _Client = Expect<Equal<ClientOf<typeof _fullInferenceWithDefer>, Connection>>;

        const _fullInferenceWithBadDefer = createBehavioralFsm({
            id: "full-inference-bad-defer",
            initialState: "disconnected",
            states: {
                disconnected: {
                    connect({ ctx: _ctx }: { ctx: Connection }) {
                        return "connecting";
                    },
                },
                connecting: {
                    connected: "online",
                    heartbeat({ defer }) {
                        // @ts-expect-error -- "onlien" is a typo; defer({ until }) must be narrowed under the full-inference form too, not just the curried form
                        defer({ until: "onlien" });
                    },
                },
                online: { disconnect: "disconnected" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should type-check a handler that calls defer({ until }) with a valid target under the full-inference form", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when defer({ until }) is exercised alongside a declared bubbles param (#189 + D2)", () => {
        type Connection = { url: string; retries: number };

        // Regression guard: adding the fourth (TBubbles) type parameter to
        // FsmConfig/the factory signatures must not disturb the #189 fix —
        // defer() still narrows correctly with `bubbles` present.
        const _withBubblesAndDefer = createBehavioralFsm<Connection>()({
            id: "bubbles-and-defer",
            initialState: "idle",
            bubbles: ["exhausted"],
            states: {
                idle: {
                    start({ defer }) {
                        // @ts-expect-error -- "runnin" is a typo; defer must stay narrowed even with `bubbles` present on the config
                        defer({ until: "runnin" });
                        return "running";
                    },
                },
                running: { stop: "idle" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should keep defer({ until }) narrowed when the config also declares bubbles", () => {
            expect(result).toBe("checked");
        });
    });
});

// =============================================================================
// #188 — an empty state ({}) or a function-only state (only unannotated
// handler functions, no string shorthand — e.g. a state with only _onEnter)
// must not disable literal-type validation for the rest of the config. Both
// variants previously widened TStates inference to the loose
// Record<string, Record<string, unknown>> constraint, degrading every
// literal check config-wide. Pinned across curried, full-inference, and
// explicit-both call forms, plus one createFsm case.
// =============================================================================

describe("#188 — empty and function-only states keep validation", () => {
    type Connection = { url: string; retries: number };

    describe("when a state is a genuinely empty object ({})", () => {
        const _typo = createBehavioralFsm<Connection>()({
            id: "empty-state-typo",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                // @ts-expect-error -- "onilne" is not a declared state name; an empty sibling state ("closed": {}) must not disable shorthand validation under the curried form. Anchored on the state-object line, matching the Task 3 anchor fix.
                connecting: {
                    connected: "onilne",
                    failed: "disconnected",
                },
                online: { disconnect: "disconnected" },
                closed: {},
            },
        });

        const _badInitial = createBehavioralFsm<Connection>()({
            id: "empty-state-bad-initial",
            // @ts-expect-error -- "pending" is not a declared state name; an empty sibling state must not disable initialState validation under the curried form
            initialState: "pending",
            states: {
                disconnected: { connect: "connecting" },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {},
            },
        });

        const emptyStateFsm = createBehavioralFsm<Connection>()({
            id: "empty-state-handle",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {},
            },
        });
        // @ts-expect-error -- "unknownInput" is not a member of the literal input-name union; an empty sibling state must not widen handle() to accept any string
        emptyStateFsm.handle({ url: "wss://example.com", retries: 0 }, "unknownInput");

        type _StateNames = Expect<
            Equal<
                StateNamesOfInstance<typeof emptyStateFsm>,
                "disconnected" | "connecting" | "online" | "closed"
            >
        >;
        type _InputNames = Expect<
            Equal<
                InputNamesOfInstance<typeof emptyStateFsm>,
                "connect" | "connected" | "disconnect"
            >
        >;

        // The typo lives in the SAME annotated handler's return value (not a
        // separate sibling shorthand property) — under the full-inference form,
        // a type error on an unrelated sibling property can destabilize the
        // TClient inference this form depends on (verified against the spike),
        // so this is the form-appropriate way to pin "return-value validation
        // survives an empty sibling state" without also tripping that unrelated
        // TClient-inference quirk.
        const _fullInferenceTypo = createBehavioralFsm({
            id: "empty-state-full-inference",
            initialState: "disconnected",
            states: {
                // @ts-expect-error -- "connceting" (connect's return value below) is not a declared state name; an empty sibling state ("closed": {}) must not disable return-value validation under the full-inference form
                disconnected: {
                    connect({ ctx: _ctx }: { ctx: Connection }) {
                        return "connceting";
                    },
                },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {},
            },
        });

        const emptyStateExplicitStates = {
            disconnected: { connect: "connecting" },
            connecting: { connected: "onilne", failed: "disconnected" },
            online: { disconnect: "disconnected" },
            closed: {},
        } as const;

        const _explicitTypo = createBehavioralFsm<Connection, typeof emptyStateExplicitStates>({
            id: "empty-state-explicit",
            initialState: "disconnected",
            // @ts-expect-error -- "onilne" is not a declared state name; the explicit-both form supplies a concrete TStates directly (skips inference) and was never broken by #188 — pinned as a regression guard that it stays rejected
            states: emptyStateExplicitStates,
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject every invalid usage above while keeping StateNamesOfInstance/InputNamesOfInstance exact", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a state has only unannotated handler functions (no string shorthand)", () => {
        const _typo = createBehavioralFsm<Connection>()({
            id: "function-only-typo",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                connecting: {
                    // @ts-expect-error -- "onilne" is not a declared state name; a sibling state with only unannotated handler functions ("closed" below) must not disable shorthand validation under the curried form. Anchored on the property line here (not the state-object line) — TypeScript's diagnostic anchor for this shape reports at the property, one of the "elaborations carry the signal" variations the fix documentation calls out.
                    connected: "onilne",
                    failed: "disconnected",
                },
                online: { disconnect: "disconnected" },
                closed: {
                    _onEnter({ ctx }) {
                        ctx.retries = 0;
                    },
                    _onExit() {},
                },
            },
        });

        const _badInitial = createBehavioralFsm<Connection>()({
            id: "function-only-bad-initial",
            // @ts-expect-error -- "pending" is not a declared state name; a sibling function-only state must not disable initialState validation under the curried form
            initialState: "pending",
            states: {
                disconnected: { connect: "connecting" },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {
                    _onEnter() {},
                },
            },
        });

        const functionOnlyFsm = createBehavioralFsm<Connection>()({
            id: "function-only-handle",
            initialState: "disconnected",
            states: {
                disconnected: { connect: "connecting" },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {
                    _onEnter() {},
                },
            },
        });
        // @ts-expect-error -- "unknownInput" is not a member of the literal input-name union; a sibling function-only state must not widen handle() to accept any string
        functionOnlyFsm.handle({ url: "wss://example.com", retries: 0 }, "unknownInput");

        type _StateNames = Expect<
            Equal<
                StateNamesOfInstance<typeof functionOnlyFsm>,
                "disconnected" | "connecting" | "online" | "closed"
            >
        >;
        type _InputNames = Expect<
            Equal<
                InputNamesOfInstance<typeof functionOnlyFsm>,
                "connect" | "connected" | "disconnect"
            >
        >;

        // Same rationale as the empty-state variant above: the typo lives in
        // the SAME annotated handler's return value so it doesn't destabilize
        // TClient inference for the full-inference form.
        const _fullInferenceTypo = createBehavioralFsm({
            id: "function-only-full-inference",
            initialState: "disconnected",
            states: {
                // @ts-expect-error -- "connceting" (connect's return value below) is not a declared state name; a sibling function-only state must not disable return-value validation under the full-inference form
                disconnected: {
                    connect({ ctx: _ctx }: { ctx: Connection }) {
                        return "connceting";
                    },
                },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
                closed: {
                    _onEnter() {},
                },
            },
        });

        const functionOnlyExplicitStates = {
            disconnected: { connect: "connecting" },
            connecting: { connected: "onilne", failed: "disconnected" },
            online: { disconnect: "disconnected" },
            closed: {
                _onEnter() {},
            },
        } as const;

        const _explicitTypo = createBehavioralFsm<Connection, typeof functionOnlyExplicitStates>({
            id: "function-only-explicit",
            initialState: "disconnected",
            // @ts-expect-error -- "onilne" is not a declared state name; the explicit-both form was never broken by #188 — pinned as a regression guard that it stays rejected even with a function-only sibling state
            states: functionOnlyExplicitStates,
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject every invalid usage above while keeping StateNamesOfInstance/InputNamesOfInstance exact", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when createFsm's config combines both variants", () => {
        // createFsm shares the same ValidateStates/FsmConfig machinery as
        // createBehavioralFsm — neither an empty sibling state nor a
        // function-only sibling state may disable validation here either.
        const _combined = createFsm({
            id: "combined-variants-createfsm",
            initialState: "green",
            context: { ticks: 0 },
            states: {
                // @ts-expect-error -- "yellw" is not a declared state name; must be rejected despite the function-only and empty sibling states below
                green: { go: "yellw" },
                yellow: {
                    _onEnter() {}, // function-only state — no string shorthand
                },
                done: {}, // genuinely empty state
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject the typo under createFsm despite function-only and empty sibling states", () => {
            expect(result).toBe("checked");
        });
    });
});

// =============================================================================
// D1 — a parent's handle() accepts inputs handled by its _child FSMs,
// recursively through grandchildren. The engine already delegates to the
// child before the parent's own handlers (BehavioralFsm.handle's delegation
// order); InputNamesOf mirrors that at the type level.
// =============================================================================

describe("D1 — child-input surfacing", () => {
    describe("when an Fsm parent mounts an Fsm child which itself mounts a grandchild", () => {
        const grandchild = createFsm({
            id: "d1-grandchild",
            initialState: "idle",
            context: {},
            states: {
                idle: { activate: "running" },
                running: { deactivate: "idle" },
            },
        });

        const child = createFsm({
            id: "d1-child",
            initialState: "off",
            context: {},
            states: {
                off: { poweron: "on" },
                on: { _child: grandchild, poweroff: "off" },
            },
        });

        const parent = createFsm({
            id: "d1-parent",
            initialState: "active",
            context: {},
            states: {
                active: { _child: child },
                inactive: {},
            },
        });

        // @ts-expect-error -- "bogus" is not part of parent's own input union or any child/grandchild's input union; D1 folding must not widen handle() to accept arbitrary strings
        parent.handle("bogus");

        type _ExactUnion = Expect<
            Equal<
                InputNamesOfInstance<typeof parent>,
                "poweron" | "poweroff" | "activate" | "deactivate"
            >
        >;

        let compositeAfterChildInput: string;
        let compositeAfterGrandchildInput: string;

        beforeEach(() => {
            parent.handle("poweron"); // child's own input, D1 — no cast needed
            compositeAfterChildInput = parent.compositeState();

            // "activate" is the GRANDCHILD's own input. D1 makes this type-check
            // on parent.handle() with no cast (the point of this pin), but the
            // engine's delegation is gated by canHandle(), which only checks the
            // IMMEDIATE child's current state — it does not recurse into that
            // child's own _child. So this call type-checks per D1, then no-ops
            // as `nohandler` on the parent at runtime rather than reaching the
            // grandchild. That's expected: this feature is type-level only (see
            // "Runtime changes: none" in the design), and reaching a grandchild's
            // input from the top requires dispatching through the intermediate
            // child directly, not a single call from the root.
            parent.handle("activate");
            compositeAfterGrandchildInput = parent.compositeState();
        });

        it("should delegate a D1-surfaced direct-child input one level down", () => {
            expect(compositeAfterChildInput).toBe("active.on.idle");
        });

        it("should type-check a D1-surfaced grandchild input without it reaching the grandchild at runtime (single-hop canHandle gate)", () => {
            expect(compositeAfterGrandchildInput).toBe("active.on.idle");
        });
    });

    describe("when a BehavioralFsm parent mounts an Fsm child", () => {
        type Widget = { id: string };

        const fsmChild = createFsm({
            id: "d1-fsm-child",
            initialState: "off",
            context: {},
            states: {
                off: { poweron: "on" },
                on: { poweroff: "off" },
            },
        });

        const behavioralParent = createBehavioralFsm<Widget>()({
            id: "d1-behavioral-parent",
            initialState: "active",
            states: {
                active: { _child: fsmChild },
                inactive: {},
            },
        });

        type _ExactUnion = Expect<
            Equal<InputNamesOfInstance<typeof behavioralParent>, "poweron" | "poweroff">
        >;

        let result: string | undefined;

        beforeEach(() => {
            const client: Widget = { id: "w1" };
            behavioralParent.handle(client, "poweron"); // Fsm child's own input, D1 — no cast needed
            result = behavioralParent.compositeState(client);
        });

        it("should delegate a D1-surfaced Fsm-child input through a BehavioralFsm parent", () => {
            expect(result).toBe("active.on");
        });
    });
});

// =============================================================================
// D2 — bubbles declarations + the child-coverage wiring contract. An FSM that
// fires an input at itself expecting a container to catch it declares that
// input via `bubbles`. Mounting it via _child then requires the mounting
// config to handle it, re-declare it in its own `bubbles`, or carry a "*".
// =============================================================================

describe("D2 — bubbles declarations and the child-coverage contract", () => {
    const lightChild = createFsm({
        id: "d2-light",
        initialState: "green",
        context: { ticks: 0 },
        bubbles: ["phaseComplete"],
        states: {
            green: { advance: "yellow" },
            yellow: { advance: "red" },
            red: {
                _onEnter({ ctx }) {
                    ctx.ticks++;
                },
            },
        },
    });

    // Declared bubbles join the child's own typed input union.
    lightChild.handle("phaseComplete");
    lightChild.handle("advance");
    // @ts-expect-error -- "closedForParade" is not a declared input or bubble; declaring bubbles must not widen handle() to accept arbitrary strings
    lightChild.handle("closedForParade");

    type _LightBubbles = Expect<Equal<BubblesOfInstance<typeof lightChild>, "phaseComplete">>;
    type _LightInputs = Expect<
        Equal<InputNamesOfInstance<typeof lightChild>, "advance" | "phaseComplete">
    >;
    type _LightStates = Expect<
        Equal<StateNamesOfInstance<typeof lightChild>, "green" | "yellow" | "red">
    >;

    // Multi-element bubbles union.
    const _chattyChild = createFsm({
        id: "d2-chatty",
        initialState: "a",
        context: {},
        bubbles: ["done", "cancelled"],
        states: { a: { go: "b" }, b: {} },
    });
    type _ChattyBubbles = Expect<
        Equal<BubblesOfInstance<typeof _chattyChild>, "done" | "cancelled">
    >;

    // No bubbles declared — BubblesOfInstance resolves to never.
    const plainChild = createFsm({
        id: "d2-plain",
        initialState: "x",
        context: {},
        states: { x: { go: "y" }, y: {} },
    });
    type _PlainBubbles = Expect<Equal<BubblesOfInstance<typeof plainChild>, never>>;

    describe("when a parent covers the child's bubble via a handler", () => {
        const parent = createFsm({
            id: "d2-covered-handler",
            initialState: "ns",
            context: { n: 0 },
            states: {
                ns: {
                    _child: lightChild,
                    phaseComplete({ ctx }) {
                        ctx.n++;
                    },
                },
                ew: {},
            },
        });

        let result: number;

        beforeEach(() => {
            result = parent.context.n;
        });

        it("should compile and construct with a handler-covered bubble", () => {
            expect(result).toBe(0);
        });
    });

    describe("when a parent covers the child's bubble via string shorthand", () => {
        const parent = createFsm({
            id: "d2-covered-shorthand",
            initialState: "ns",
            context: {},
            states: {
                ns: { _child: lightChild, phaseComplete: "ew" },
                ew: { phaseComplete: "ns" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = parent.currentState();
        });

        it("should compile and construct with a shorthand-covered bubble", () => {
            expect(result).toBe("ns");
        });
    });

    describe("when a parent mounts the child but covers the bubble on a different state", () => {
        // Coverage is FSM-wide, not mount-state-local — a bubble re-dispatches
        // against whatever state the parent happens to be in when it fires
        // (which can be any state), so coverage declared elsewhere still counts.
        const _elsewhereCovered = createFsm({
            id: "d2-elsewhere-covered",
            initialState: "a",
            context: {},
            states: {
                a: { _child: lightChild },
                b: { phaseComplete: "a" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should compile when coverage lives on a state other than the mount point", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a parent mounts the child under a catch-all handler", () => {
        const _catchAllParent = createFsm({
            id: "d2-catchall-parent",
            initialState: "a",
            context: {},
            states: {
                a: {
                    _child: lightChild,
                    "*"({ inputName }) {
                        void inputName;
                    },
                },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should compile when a catch-all covers every bubble", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a parent mounts a bubble-free child", () => {
        // Omitting `bubbles` entirely (the default) means no coverage
        // obligation at all — such a child can be mounted anywhere.
        const _plainParent = createFsm({
            id: "d2-plain-parent",
            initialState: "x",
            context: {},
            states: { x: { _child: plainChild }, y: {} },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should compile with no coverage obligation for a bubble-free child", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a parent mounts the child without covering its bubble", () => {
        const _uncoveredParent = createFsm({
            id: "d2-uncovered-parent",
            initialState: "ns",
            context: {},
            states: {
                // @ts-expect-error -- lightChild declares bubbles: ["phaseComplete"], and this mount handles it in neither this state nor any other, nor re-declares it in the parent's own bubbles, nor carries a catch-all; ChildCoverage must reject the mount
                ns: { _child: lightChild },
                ew: {},
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject a mount that leaves a declared bubble uncovered", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a mid-level FSM re-declares a mounted bubble in its own bubbles", () => {
        // Re-declaring passes the obligation up a level instead of discharging
        // it: `mid` doesn't handle phaseComplete itself, but its OWN `bubbles`
        // covers the mount, so `mid` now owes phaseComplete to whatever mounts IT.
        const mid = createFsm({
            id: "d2-mid",
            initialState: "on",
            context: {},
            bubbles: ["phaseComplete"],
            states: {
                on: { _child: lightChild, off: "off" },
                off: { on: "on" },
            },
        });
        type _MidBubbles = Expect<Equal<BubblesOfInstance<typeof mid>, "phaseComplete">>;

        const _grandparentUncovered = createFsm({
            id: "d2-grandparent-uncovered",
            initialState: "top",
            context: {},
            states: {
                // @ts-expect-error -- mid re-declares (rather than handles) phaseComplete via its own bubbles, so mounting mid still leaves phaseComplete uncovered one level up
                top: { _child: mid },
            },
        });

        const _grandparentCovered = createFsm({
            id: "d2-grandparent-covered",
            initialState: "top",
            context: { g: 0 },
            states: {
                top: {
                    _child: mid,
                    phaseComplete({ ctx }) {
                        ctx.g++;
                    },
                },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should pass a re-declared bubble up exactly one level at a time", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a BehavioralFsm parent mounts an Fsm child with a bubble", () => {
        type Client = { id: string };

        describe("and covers it", () => {
            const _behavioralCovered = createBehavioralFsm<Client>()({
                id: "d2-behavioral-covered",
                initialState: "s1",
                states: {
                    s1: { _child: lightChild, phaseComplete: "s2" },
                    s2: { reset: "s1" },
                },
            });

            let result: string;

            beforeEach(() => {
                result = "checked";
            });

            it("should compile when the BehavioralFsm parent covers the bubble", () => {
                expect(result).toBe("checked");
            });
        });

        describe("and does not cover it", () => {
            const _behavioralUncovered = createBehavioralFsm<Client>()({
                id: "d2-behavioral-uncovered",
                initialState: "s1",
                states: {
                    // @ts-expect-error -- lightChild's declared phaseComplete bubble is uncovered here; the contract applies to BehavioralFsm parents exactly as it does to Fsm parents
                    s1: { _child: lightChild },
                    s2: { reset: "s1" },
                },
            });

            let result: string;

            beforeEach(() => {
                result = "checked";
            });

            it("should reject an uncovered mount under a BehavioralFsm parent", () => {
                expect(result).toBe("checked");
            });
        });
    });

    describe("when the explicit-both form combines with bubbles", () => {
        // Known limitation (release-note material): supplying only TCtx and
        // TStates explicitly leaves TStateNames and TBubbles at their
        // DEFAULTS — TypeScript does not infer the remaining positional type
        // parameters from the config once earlier ones were supplied
        // explicitly — so TBubbles defaults to `never` instead of being
        // inferred from the `bubbles` array. Workaround: supply all four type
        // arguments explicitly, e.g.
        // createBehavioralFsm<Client, typeof probeStates, "a" | "b", "finished">(...).
        type Client = { id: string };
        const probeStates = {
            a: { go: "b" },
            b: {},
        } as const;

        const _explicitWithBubbles = createBehavioralFsm<Client, typeof probeStates>({
            id: "d2-explicit-with-bubbles",
            initialState: "a",
            // @ts-expect-error -- Type 'string' is not assignable to type 'never'. TBubbles isn't inferred here (only TCtx/TStates were supplied explicitly), so it defaults to `never` and any non-empty `bubbles` array is rejected — see the workaround comment above
            bubbles: ["finished"],
            states: probeStates,
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should document the explicit-both + bubbles limitation as an expected error", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a declared bubble is used as a transition target", () => {
        const _noPollution = createFsm({
            id: "d2-no-pollution",
            initialState: "a",
            context: {},
            bubbles: ["finished"],
            states: {
                // @ts-expect-error -- "finished" is a declared bubble, not a state name; it must not become a valid string-shorthand transition target
                a: {
                    go: "finished",
                },
                b: {},
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject a bubble name used as a transition target", () => {
            expect(result).toBe("checked");
        });
    });
});

// =============================================================================
// Compat pins — the fourth (TBubbles) class generic and the FsmConfig
// restructure must not break pre-existing annotation patterns.
// =============================================================================

describe("compat — pre-existing annotation patterns keep working", () => {
    describe("when a handler uses the blessed HandlerArgs<TCtx> method-style annotation", () => {
        type Connection = { url: string; retries: number };

        // Method-style parameter annotations (not destructured arrow-function
        // properties) get TypeScript's bivariant method-parameter check, so the
        // wider HandlerArgs<Connection> (TStateNames defaults to `string`) still
        // compiles here even though the config's real TStateNames is the
        // narrower "disconnected" | "connecting" | "online".
        const _handlerArgsAnnotated = createBehavioralFsm<Connection>()({
            id: "handler-args-annotated",
            initialState: "disconnected",
            states: {
                disconnected: {
                    connect(args: HandlerArgs<Connection>) {
                        return args.ctx.retries > 0 ? "connecting" : "connecting";
                    },
                },
                connecting: { connected: "online" },
                online: { disconnect: "disconnected" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should compile a method-style HandlerArgs<TCtx> annotation inside a narrowed config", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a 3-argument BehavioralFsm<TClient, TStateNames, TInputNames> annotation targets a 4-generic instance", () => {
        // Pre-existing annotations written before TBubbles existed must keep
        // working — TBubbles is trailing and defaulted, so a 3-arg annotation
        // just widens TBubbles to its default (never) instead of failing to match.
        type Client = { id: string };
        const threeArgFsm = createBehavioralFsm<Client>()({
            id: "compat-three-arg",
            initialState: "idle",
            states: {
                idle: { start: "running" },
                running: { stop: "idle" },
            },
        });

        const describedAsThreeArg: BehavioralFsm<Client, "idle" | "running", "start" | "stop"> =
            threeArgFsm;

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof describedAsThreeArg>, "idle" | "running">
        >;

        let result: string | undefined;

        beforeEach(() => {
            const client: Client = { id: "c1" };
            describedAsThreeArg.handle(client, "start");
            result = describedAsThreeArg.currentState(client);
        });

        it("should accept a pre-existing 3-argument BehavioralFsm annotation against a 4-generic instance", () => {
            expect(result).toBe("running");
        });
    });

    describe("when a 3-argument Fsm<TCtx, TStateNames, TInputNames> annotation targets a 4-generic instance", () => {
        // Same compat guarantee as above, for the single-client Fsm class.
        const threeArgLight = createFsm({
            id: "compat-three-arg-fsm",
            initialState: "green",
            context: { ticks: 0 },
            states: {
                green: { timeout: "yellow" },
                yellow: { timeout: "green" },
            },
        });

        const describedAsThreeArgFsm: Fsm<{ ticks: number }, "green" | "yellow", "timeout"> =
            threeArgLight;

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof describedAsThreeArgFsm>, "green" | "yellow">
        >;

        let result: string;

        beforeEach(() => {
            describedAsThreeArgFsm.handle("timeout");
            result = describedAsThreeArgFsm.currentState();
        });

        it("should accept a pre-existing 3-argument Fsm annotation against a 4-generic instance", () => {
            expect(result).toBe("yellow");
        });
    });
});

// =============================================================================
// Boundary conditions and adversarial configs beyond the acceptance-criteria
// pins above — single-state FSMs, names that collide with special keys or
// each other, spread/wrapper/hoisting variations on literal capture, and the
// D2 contract's behavior when names coincidentally collide.
// =============================================================================

describe("boundary — numeric-literal state keys collapse TStateNames to never", () => {
    // `keyof TStates` for a numeric-literal key (`1: {...}`) is the NUMBER
    // literal type `1`, not the string literal `"1"` — even though JS coerces
    // it to the string key "1" at runtime (Object.keys always returns strings).
    // `TStateNames extends string = keyof TStates & string` intersects that
    // away to `never`, so a states config keyed entirely by number literals
    // has no valid TStateNames at all: initialState, shorthand targets, and
    // handle() inputs all need an explicit cast to compile. Pre-existing to
    // this feature — `keyof TStates & string` predates #188/#189 — not a
    // regression, but a real limitation worth knowing about before naming
    // states with bare number literals.
    const _numericKeyed = createFsm({
        id: "numeric-keyed-states",
        initialState: 1 as never,
        context: {},
        states: {
            1: { go: 2 as never },
            2: {},
        },
    });

    type _StateNames = Expect<Equal<StateNamesOfInstance<typeof _numericKeyed>, never>>;

    let result: string;

    beforeEach(() => {
        result = "checked";
    });

    it("should collapse TStateNames to never for a states config keyed entirely by number literals", () => {
        expect(result).toBe("checked");
    });
});

describe("boundary — single-state FSM", () => {
    describe("when the states config has exactly one state", () => {
        const solo = createFsm({
            id: "solo",
            initialState: "only",
            context: { pings: 0 },
            states: {
                only: {
                    ping({ ctx }) {
                        ctx.pings++;
                    },
                },
            },
        });

        type _StateNames = Expect<Equal<StateNamesOfInstance<typeof solo>, "only">>;
        type _InputNames = Expect<Equal<InputNamesOfInstance<typeof solo>, "ping">>;

        // @ts-expect-error -- "elsewhere" isn't the sole declared state name; a singleton TStateNames union (not yet a real union at all) must still reject an invalid transition target
        solo.transition("elsewhere");

        let result: string;

        beforeEach(() => {
            result = solo.currentState();
        });

        it("should keep validation intact when TStateNames collapses to a single literal", () => {
            expect(result).toBe("only");
        });
    });
});

describe("weird-but-legal state and input names", () => {
    describe("when a state is named '__proto__' via a BARE object-literal key", () => {
        // `{ __proto__: {...} }` written as a bare literal key does NOT create
        // an enumerable own property — JS special-cases it to set the object's
        // actual [[Prototype]] instead. TypeScript's type inference does NOT
        // mirror that special case: the inferred TStates (and therefore
        // StateNamesOfInstance) still lists "__proto__" as a real state name,
        // because from TypeScript's perspective it's just another property key
        // in the object literal's inferred type. That's a genuine type/runtime
        // divergence — the types promise a state that Object.hasOwn (what
        // transition()'s guard actually checks, added for exactly this reason)
        // will never see, so entering it silently fails as `invalidstate`
        // rather than transitioning. Pre-existing to this feature (the same
        // `keyof TStates` extraction predates #188/#189) and not something
        // #188/#189/D1/D2 changed — documented here as a permanent regression
        // guard, and as the reason the computed-key form is required below.
        const bareProtoFsm = createFsm({
            id: "bare-proto-key-divergence",
            initialState: "b",
            context: {},
            states: {
                __proto__: { go: "b" },
                b: {},
            },
        });

        type _StateNamesPromiseIncludesProto = Expect<
            Equal<StateNamesOfInstance<typeof bareProtoFsm>, "b" | "__proto__">
        >;

        let ownStateKeys: string[];
        let stateAfterAttemptedTransition: string;

        beforeEach(() => {
            ownStateKeys = Object.keys(bareProtoFsm.states);
            bareProtoFsm.transition("__proto__");
            stateAfterAttemptedTransition = bareProtoFsm.currentState();
        });

        it("should never actually create an own '__proto__' state at runtime despite the type system promising one", () => {
            expect(ownStateKeys).toEqual(["b"]);
        });

        it("should silently fail to transition into the type-promised '__proto__' state", () => {
            expect(stateAfterAttemptedTransition).toBe("b");
        });
    });

    describe("when states are named like inherited Object.prototype members", () => {
        // "constructor" is safe to write as a bare object-literal key — it creates
        // a normal own property that shadows the inherited one. "__proto__" is
        // NOT safe as a bare key: `{ __proto__: {...} }` sets the object's actual
        // prototype instead of creating an enumerable own property, so it has to
        // be written as a computed key (`["__proto__"]: {...}`) to become a real
        // state that Object.hasOwn — the guard transition()/rehydrate() already
        // use for exactly this reason — will recognize.
        const protoNamedFsm = createFsm({
            id: "proto-named-states",
            initialState: "safe",
            context: {},
            states: {
                safe: { advance: "constructor" },
                constructor: { advance: "__proto__" },
                ["__proto__"]: { retreat: "safe" },
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof protoNamedFsm>, "safe" | "constructor" | "__proto__">
        >;

        let compositeAfterFirstAdvance: string;
        let compositeAfterSecondAdvance: string;

        beforeEach(() => {
            protoNamedFsm.handle("advance");
            compositeAfterFirstAdvance = protoNamedFsm.currentState();
            protoNamedFsm.handle("advance");
            compositeAfterSecondAdvance = protoNamedFsm.currentState();
        });

        it("should transition into a state named 'constructor' declared with a bare object-literal key", () => {
            expect(compositeAfterFirstAdvance).toBe("constructor");
        });

        it("should transition into a state named '__proto__' declared with a computed property key", () => {
            expect(compositeAfterSecondAdvance).toBe("__proto__");
        });
    });

    describe("when an input name is identical to a state name", () => {
        const selfNamedInputFsm = createFsm({
            id: "self-named-input",
            initialState: "idle",
            context: { count: 0 },
            states: {
                idle: {
                    idle({ ctx }) {
                        ctx.count++;
                        return "running";
                    },
                },
                running: { stop: "idle" },
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof selfNamedInputFsm>, "idle" | "running">
        >;
        type _InputNames = Expect<
            Equal<InputNamesOfInstance<typeof selfNamedInputFsm>, "idle" | "stop">
        >;

        let result: string;

        beforeEach(() => {
            selfNamedInputFsm.handle("idle");
            result = selfNamedInputFsm.currentState();
        });

        it("should keep the state-name and input-name unions independent when they share a literal", () => {
            expect(result).toBe("running");
        });
    });

    describe("when a state is literally named '_onEnter' (a top-level state name, not the lifecycle hook)", () => {
        const lifecycleNamedFsm = createFsm({
            id: "lifecycle-named-state",
            initialState: "_onEnter",
            context: {},
            states: {
                _onEnter: { advance: "settled" },
                settled: {
                    _onEnter() {
                        // The REAL lifecycle hook, nested one level down inside
                        // "settled" — unrelated to the top-level state named
                        // "_onEnter" above. SpecialStateKeys only strips
                        // lifecycle-hook keys from OwnInputNamesOf; it never
                        // touches top-level state names.
                    },
                },
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof lifecycleNamedFsm>, "_onEnter" | "settled">
        >;
        type _InputNames = Expect<Equal<InputNamesOfInstance<typeof lifecycleNamedFsm>, "advance">>;

        let result: string;

        beforeEach(() => {
            lifecycleNamedFsm.handle("advance");
            result = lifecycleNamedFsm.currentState();
        });

        it("should treat a top-level state named '_onEnter' as an ordinary state, not a lifecycle hook", () => {
            expect(result).toBe("settled");
        });
    });

    describe("when state and input names use unicode characters", () => {
        const unicodeFsm = createFsm({
            id: "unicode-names",
            initialState: "🚦green",
            context: { changes: 0 },
            states: {
                "🚦green": {
                    変わる({ ctx }) {
                        ctx.changes++;
                        return "🚦red";
                    },
                },
                "🚦red": {},
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof unicodeFsm>, "🚦green" | "🚦red">
        >;
        type _InputNames = Expect<Equal<InputNamesOfInstance<typeof unicodeFsm>, "変わる">>;

        let result: string;

        beforeEach(() => {
            unicodeFsm.handle("変わる");
            result = unicodeFsm.currentState();
        });

        it("should validate unicode state and input names exactly like ASCII ones", () => {
            expect(result).toBe("🚦red");
        });
    });
});

describe("inference edge cases", () => {
    describe("when the top-level states object (not just one state's handlers) is composed via spread", () => {
        const baseStates = {
            idle: { start: "running" },
        } as const;

        const extraStates = {
            running: { stop: "idle" },
        } as const;

        const _spreadTopLevelFsm = createFsm({
            id: "spread-top-level-states",
            initialState: "idle",
            context: {},
            states: {
                ...baseStates,
                ...extraStates,
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof _spreadTopLevelFsm>, "idle" | "running">
        >;

        const _typo = createFsm({
            id: "spread-top-level-typo",
            initialState: "idle",
            context: {},
            states: {
                ...baseStates,
                // @ts-expect-error -- "sttop" is a typo; spreading two separately-declared states objects into the top-level `states` property must not disable shorthand validation. Anchored on the state-object line, matching the anchor pattern for a fully-populated (non-empty, non-function-only) sibling.
                running: { stop: "sttop" },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should preserve literal validation when the top-level states object is composed via spread", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a handler's return value is a conditional union of two different valid state names", () => {
        const conditionalUnionFsm = createFsm({
            id: "conditional-union-return",
            initialState: "idle",
            context: { severity: 0 },
            states: {
                idle: {
                    dispatch({ ctx }) {
                        return ctx.severity > 5 ? "critical" : "warning";
                    },
                },
                warning: { resolve: "idle" },
                critical: { resolve: "idle" },
            },
        });

        type _StateNames = Expect<
            Equal<StateNamesOfInstance<typeof conditionalUnionFsm>, "idle" | "warning" | "critical">
        >;

        const _typoInOneBranch = createFsm({
            id: "conditional-union-typo",
            initialState: "idle",
            context: { severity: 0 },
            states: {
                // @ts-expect-error -- "critcal" is a typo in one branch of the conditional return; every member of a handler's returned union must be validated, not just whichever branch a naive check might look at first. Anchored on the state-object line, matching the shorthand-typo anchor pattern.
                idle: {
                    dispatch({ ctx }) {
                        return ctx.severity > 5 ? "critcal" : "warning";
                    },
                },
                warning: { resolve: "idle" },
                critical: { resolve: "idle" },
            },
        });

        let result: string;

        beforeEach(() => {
            conditionalUnionFsm.handle("dispatch");
            result = conditionalUnionFsm.currentState();
        });

        it("should transition according to a conditionally-returned union of valid state names", () => {
            expect(result).toBe("warning");
        });
    });

    describe("when defer({ until }) is called from inside _onEnter rather than a named input handler", () => {
        // _onEnter/_onExit are separate NAMED properties in ValidateStates (not
        // the dynamic index signature ordinary inputs go through) — this proves
        // the same NoInfer-wrapped HandlerFn narrowing applies there too.
        const _onEnterDeferTypo = createFsm({
            id: "onenter-defer-typo",
            initialState: "idle",
            context: {},
            states: {
                idle: { start: "running" },
                running: {
                    _onEnter({ defer }) {
                        // @ts-expect-error -- "idl" is a typo; defer({ until }) must stay narrowed to the literal state-name union inside _onEnter too, not just inside named input handlers
                        defer({ until: "idl" });
                    },
                    stop: "idle",
                },
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject a defer({ until }) typo called from inside _onEnter", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a generic wrapper function forwards a states object into createFsm", () => {
        // Real-world pattern: a library consumer wraps createFsm in their own
        // factory function, with TStates flowing through an intermediate
        // generic parameter rather than being inferred directly at the
        // createFsm call site.

        describe("and forwards the abstract TStates value as-is (no cast)", () => {
            // Pre-existing limitation, not something #188/#189/D1/D2 introduced:
            // the OLD single-parameter ValidateStates had this exact same
            // intersection shape. Inside a generic function body, TStates is
            // only known by its (much looser) constraint — TypeScript can't
            // prove an abstract, not-yet-instantiated TStates also satisfies
            // ValidateStates/ChildCoverage's structural requirements, so the
            // intersection assignment fails.
            function _naiveForward<const TStates extends Record<string, Record<string, unknown>>>(
                states: TStates,
                initialState: keyof TStates & string
            ) {
                return createFsm({
                    id: "naive-forward",
                    initialState,
                    context: {},
                    // @ts-expect-error -- an abstract, generically-typed `states` value can't satisfy ValidateStates/ChildCoverage's structural intersection inside a generic function body — only a concrete literal or an explicit cast (see the sibling describe below) can
                    states,
                });
            }

            let result: string;

            beforeEach(() => {
                result = "checked";
            });

            it("should reject forwarding an abstract TStates value into createFsm without a cast", () => {
                expect(result).toBe("checked");
            });
        });

        describe("and forwards TStates via an explicit FsmConfig cast", () => {
            // The same workaround createFsm's OWN implementation uses internally
            // (`config as FsmConfig<TCtx, Record<string, Record<string, unknown>>>`)
            // — the blessed way for a wrapper to stay generic over TStates.
            function castForward<const TStates extends Record<string, Record<string, unknown>>>(
                states: TStates,
                initialState: keyof TStates & string
            ) {
                return createFsm({
                    id: "cast-forward",
                    initialState,
                    context: {},
                    states,
                } as FsmConfig<Record<string, never>, TStates>);
            }

            const wrapped = castForward(
                {
                    off: { flip: "on" },
                    on: { flip: "off" },
                },
                "off"
            );

            type _StateNames = Expect<Equal<StateNamesOfInstance<typeof wrapped>, "off" | "on">>;
            type _InputNames = Expect<Equal<InputNamesOfInstance<typeof wrapped>, "flip">>;

            let result: string;

            beforeEach(() => {
                wrapped.handle("flip");
                result = wrapped.currentState();
            });

            it("should preserve literal state/input inference through a cast-forwarding generic wrapper", () => {
                expect(result).toBe("on");
            });
        });
    });

    describe("when a states object is hoisted into a variable without 'as const'", () => {
        const looseStates = {
            green: { timeout: "yellow" },
            yellow: { timeout: "red" },
            red: { timeout: "green" },
        };

        const _loose = createFsm({
            id: "loose-hoisted-states",
            initialState: "green",
            context: {},
            // @ts-expect-error -- without `as const`, every shorthand value widens to `string`, which is not assignable to the literal state-name union ValidateStates demands; a hoisted config still needs `as const` (or an inline literal) to preserve literal types
            states: looseStates,
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should reject a hoisted states variable that widened its shorthand values by omitting 'as const'", () => {
            expect(result).toBe("checked");
        });
    });
});

describe("D2 — additional hardening", () => {
    const sharedBubbler = createFsm({
        id: "d2-shared-bubbler",
        initialState: "on",
        context: {},
        bubbles: ["done"],
        states: { on: { off: "off" }, off: { on: "on" } },
    });

    describe("when the same bubbling child is mounted in two independent parent configs", () => {
        const _coveringParent = createFsm({
            id: "d2-shared-child-covering-parent",
            initialState: "active",
            context: {},
            states: {
                active: { _child: sharedBubbler, done: "idle" },
                idle: {},
            },
        });

        const _uncoveredParent = createFsm({
            id: "d2-shared-child-uncovered-parent",
            initialState: "active",
            context: {},
            states: {
                // @ts-expect-error -- sharedBubbler's declared "done" bubble is uncovered HERE even though a different, unrelated parent config covers it — coverage is evaluated per mounting config, not somehow shared globally by the child instance
                active: { _child: sharedBubbler },
                idle: {},
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should evaluate coverage independently per mounting config for the same shared child instance", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when a child's bubble name collides with the mounting parent's own state name", () => {
        const collidingChild = createFsm({
            id: "d2-name-collision-child",
            initialState: "x",
            context: {},
            bubbles: ["ns"],
            states: { x: { go: "y" }, y: {} },
        });

        const _uncoveredDespiteNameMatch = createFsm({
            id: "d2-name-collision-parent",
            initialState: "ns",
            context: {},
            states: {
                // @ts-expect-error -- collidingChild's bubble is literally named "ns", matching this mounting state's own name — that's a naming coincidence, not coverage; there's still no "ns" handler anywhere, so the mount must stay rejected
                ns: { _child: collidingChild },
                ew: {},
            },
        });

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should not treat a bubble name matching a state name as accidental coverage", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when an FSM declares a bubble whose name matches one of its own state names", () => {
        const _selfCollidingBubbles = createFsm({
            id: "d2-self-collision",
            initialState: "green",
            context: {},
            bubbles: ["green"],
            states: {
                green: { advance: "red" },
                red: {},
            },
        });

        type _Bubbles = Expect<Equal<BubblesOfInstance<typeof _selfCollidingBubbles>, "green">>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should allow a bubble name to collide with the FSM's own state name without conflict", () => {
            expect(result).toBe("checked");
        });
    });

    describe("when bubbles is declared as an empty array", () => {
        const _emptyBubbles = createFsm({
            id: "d2-empty-bubbles",
            initialState: "a",
            context: {},
            bubbles: [],
            states: { a: { go: "b" }, b: {} },
        });

        type _Bubbles = Expect<Equal<BubblesOfInstance<typeof _emptyBubbles>, never>>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should treat an empty bubbles array the same as omitting bubbles entirely", () => {
            expect(result).toBe("checked");
        });
    });
});

describe("compat — FsmConfig used directly as a type annotation", () => {
    describe("when a consumer hoists a config object typed with the 2-argument FsmConfig<TCtx, TStates> form", () => {
        type Toggle = { flips: number };
        const toggleStates = {
            off: { flip: "on" },
            on: { flip: "off" },
        } as const;

        const hoistedConfig: FsmConfig<Toggle, typeof toggleStates> = {
            id: "hoisted-config",
            initialState: "off",
            context: { flips: 0 },
            states: toggleStates,
        };

        const fsm = createFsm(hoistedConfig);

        type _StateNames = Expect<Equal<StateNamesOfInstance<typeof fsm>, "off" | "on">>;

        let result: string;

        beforeEach(() => {
            fsm.handle("flip");
            result = fsm.currentState();
        });

        it("should construct correctly from a hoisted, 2-argument FsmConfig annotation", () => {
            expect(result).toBe("on");
        });
    });

    describe("when a consumer hoists a config typed with all four FsmConfig type arguments, including bubbles", () => {
        // Workaround for the explicit-both + bubbles limitation pinned in the D2
        // section above: rather than calling createBehavioralFsm<Client, TStates>
        // directly (which locks TBubbles to its `never` default), annotate a
        // hoisted config with all four type arguments up front, then call the
        // factory with ZERO explicit type arguments so it infers everything —
        // including TBubbles — from the already-fully-typed config object.
        type Client = { id: string };
        const probeStates = {
            a: { go: "b" },
            b: {},
        } as const;

        const hoistedWithBubbles: FsmConfig<Client, typeof probeStates, "a" | "b", "finished"> = {
            id: "hoisted-with-bubbles",
            initialState: "a",
            bubbles: ["finished"],
            states: probeStates,
        };

        const _fsmWithBubbles = createBehavioralFsm(hoistedWithBubbles);

        type _Bubbles = Expect<Equal<BubblesOfInstance<typeof _fsmWithBubbles>, "finished">>;

        let result: string;

        beforeEach(() => {
            result = "checked";
        });

        it("should infer TBubbles from a fully-typed hoisted FsmConfig annotation", () => {
            expect(result).toBe("checked");
        });
    });
});
