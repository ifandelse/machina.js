// =============================================================================
// types.ts — Shared type foundations for machina v6
//
// Pure type definitions. No runtime code. Every type here is consumed by
// behavioral-fsm.ts, fsm.ts, or both. The factory functions (createFsm,
// createBehavioralFsm) use these as building blocks for their own generics.
//
// =============================================================================

// -----------------------------------------------------------------------------
// Utility types for state/input name extraction
//
// These are the inference primitives that power machina's "zero-ceremony"
// type safety. Given a states config object, they extract the state name
// union and input name union as string literal types.
// -----------------------------------------------------------------------------

/**
 * Keys on a state object that have special meaning and are NOT input names.
 * Used by InputNamesOf to filter these out when collecting input names.
 *
 * @internal Exported from this module only so the factory return types in
 *   fsm.ts / behavioral-fsm.ts can inline InputNamesOf's definition for
 *   readable error text; not re-exported via index.ts.
 */
export type SpecialStateKeys = "_onEnter" | "_onExit" | "_child" | "*";

/**
 * Extracts state names as a string literal union from a states config object.
 *
 * @example
 * ```ts
 * type S = StateNamesOf<{ green: {...}, yellow: {...}, red: {...} }>;
 * // => "green" | "yellow" | "red"
 * ```
 */
export type StateNamesOf<TStates> = keyof TStates & string;

/**
 * Extracts a state config's OWN input names — the handler keys declared
 * directly on its states, before any child FSM's inputs are folded in.
 * Collects all handler keys across ALL states, then strips out lifecycle
 * hooks and special keys (_onEnter, _onExit, _child, *).
 *
 * Split out from `InputNamesOf` so the child-coverage machinery (`CoverageOf`)
 * can ask "what does this FSM handle locally?" without pulling in every
 * descendant's inputs too — coverage is about what THIS level absorbs, not
 * what its children happen to also expose.
 *
 * @example
 * ```ts
 * type I = OwnInputNamesOf<{
 *   idle:    { start: "running", reset: fn };
 *   running: { pause: "paused", stop: "idle" };
 * }>;
 * // => "start" | "reset" | "pause" | "stop"
 * ```
 *
 * How it works:
 * 1. `{ [S in keyof TStates]: keyof TStates[S] & string }` — maps each state
 *    to the union of its handler key names
 * 2. `[keyof TStates]` — collapses the mapped type into a flat union of ALL
 *    handler keys across every state
 * 3. `Exclude<..., SpecialStateKeys>` — strips lifecycle/special keys
 */
export type OwnInputNamesOf<TStates> = Exclude<
    { [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates],
    SpecialStateKeys
>;

/**
 * Extracts input names as a string literal union from a states config object.
 * This is what flows into `handle(inputName)` to provide compile-time
 * validation of input names.
 *
 * A parent's `handle()` genuinely accepts everything its `_child` FSMs accept:
 * the engine checks the child first and only falls through to the parent's
 * own handlers if the child can't handle the input (see `BehavioralFsm.handle`).
 * `InputNamesOf` mirrors that at the type level by unioning the config's own
 * input names with every declared child's input names (recursively —
 * grandchildren ride along because each child's own `InputNamesOfInstance`
 * already folded in ITS children when that child was created).
 *
 * @example
 * ```ts
 * type I = InputNamesOf<{
 *   idle:    { start: "running", reset: fn };
 *   running: { pause: "paused", stop: "idle" };
 * }>;
 * // => "start" | "reset" | "pause" | "stop"
 * ```
 */
export type InputNamesOf<TStates> = OwnInputNamesOf<TStates> | ChildInputNamesOf<TStates>;

/**
 * Walks every state looking for a `_child`, and folds in that child instance's
 * own input names (via `InputNamesOfInstance`). Not exported — `InputNamesOf`
 * is the public surface; this is just the "look inside _child" half of it.
 */
type ChildInputNamesOf<TStates> = {
    [S in keyof TStates]: TStates[S] extends { _child: infer C } ? InputNamesOfInstance<C> : never;
}[keyof TStates];

/**
 * Extracts state names from a concrete machina FSM instance.
 *
 * Unlike `keyof TFsm`, this reads the class generic that stores user-defined
 * state names, so adapter signatures stay tied to the configured states
 * instead of widening to method/property names.
 */
export type StateNamesOfInstance<TFsm> = TFsm extends import("./fsm").Fsm<
    infer _TCtx extends object,
    infer TStateNames extends string,
    infer _TInputNames extends string
>
    ? TStateNames
    : TFsm extends import("./behavioral-fsm").BehavioralFsm<
            infer _TClient extends object,
            infer TStateNames extends string,
            infer _TInputNames extends string
        >
      ? TStateNames
      : never;

/**
 * Extracts input names from a concrete machina FSM instance.
 */
export type InputNamesOfInstance<TFsm> = TFsm extends import("./fsm").Fsm<
    infer _TCtx extends object,
    infer _TStateNames extends string,
    infer TInputNames extends string
>
    ? TInputNames
    : TFsm extends import("./behavioral-fsm").BehavioralFsm<
            infer _TClient extends object,
            infer _TStateNames extends string,
            infer TInputNames extends string
        >
      ? TInputNames
      : never;

/**
 * Extracts the context object type from a concrete single-client FSM instance.
 */
export type ContextOf<TFsm> = TFsm extends import("./fsm").Fsm<
    infer TCtx extends object,
    infer _TStateNames extends string,
    infer _TInputNames extends string
>
    ? TCtx
    : never;

/**
 * Extracts the client object type from a concrete behavioral FSM instance.
 */
export type ClientOf<TFsm> = TFsm extends import("./behavioral-fsm").BehavioralFsm<
    infer TClient extends object,
    infer _TStateNames extends string,
    infer _TInputNames extends string
>
    ? TClient
    : never;

/**
 * Extracts the declared `bubbles` union from a concrete machina FSM instance —
 * the inputs that FSM fires at itself without handling, expecting a `_child`
 * mount point to catch them (see `ChildCoverage`). `never` for an instance
 * that declared no `bubbles` (the common case) or for a non-machina type.
 */
export type BubblesOfInstance<TFsm> = TFsm extends import("./fsm").Fsm<
    infer _TCtx extends object,
    infer _TStateNames extends string,
    infer _TInputNames extends string,
    infer TBubbles extends string
>
    ? TBubbles
    : TFsm extends import("./behavioral-fsm").BehavioralFsm<
            infer _TClient extends object,
            infer _TStateNames extends string,
            infer _TInputNames extends string,
            infer TBubbles extends string
        >
      ? TBubbles
      : never;

// -----------------------------------------------------------------------------
// Handler argument object
//
// Every handler in machina receives this as its first argument. This replaces
// the old v5 pattern of binding `this` to the FSM and passing the client as
// a separate parameter. Benefits:
//   - Works with arrow functions (no `this` caveat)
//   - BehavioralFsm and Fsm handler signatures are identical
//   - Destructure only what you need: tick({ ctx }) { ... }
//   - Easy to mock in tests: just construct the object
//
// Handlers RETURN a state name to trigger a transition (or void/undefined
// to stay in the current state). This replaces the imperative transition()
// call and mirrors gen_fsm's {next_state, StateName, NewStateData} pattern.
// -----------------------------------------------------------------------------

/**
 * The single combined object passed to every handler.
 *
 * Handlers return a state name to transition, or void to stay put.
 * This replaces imperative `transition()` calls — closer to gen_fsm's
 * return-based model and symmetrical with string shorthand handlers.
 *
 * @typeParam TCtx - The context type. For Fsm this is the config-defined
 *   context object. For BehavioralFsm this is the client object itself.
 * @typeParam TStateNames - String literal union of valid state names.
 *   Defaults to `string` for loose usage; the factory functions narrow this
 *   to the actual state names inferred from the config.
 *
 * @example
 * ```ts
 * // Conditional transition — return the target state:
 * timeout({ ctx }) {
 *   if (ctx.tickCount >= 3) return "yellow";
 * }
 *
 * // Side effects without transition — return nothing:
 * tick({ ctx }) {
 *   ctx.tickCount++;
 * }
 *
 * // In a catch-all — inputName tells you what was received:
 * "*"({ inputName }) {
 *   console.log(`unhandled input: ${inputName}`);
 * }
 * ```
 */
export interface HandlerArgs<TCtx, TStateNames extends string = string> {
    /** The context (Fsm) or client object (BehavioralFsm) */
    ctx: TCtx;

    /**
     * The name of the input currently being handled.
     *
     * Typed as `string` rather than the inferred input union because:
     * 1. Inside a named handler you already know the input name
     * 2. In a catch-all (*) handler it could be anything
     * 3. Narrowing to the literal per-handler would require complex
     *    mapped types for zero practical benefit
     */
    inputName: string;

    /**
     * Defer the current input for replay after a future transition.
     * Erlang's selective receive, in JS form.
     *
     * @example
     * ```ts
     * // Replay on the next transition to any state
     * defer();
     *
     * // Replay only when entering "yellow"
     * defer({ until: "yellow" });
     * ```
     */
    defer(opts?: { until: TStateNames }): void;

    /**
     * Emit a custom event through the FSM's emitter.
     * Built-in events (transitioning, transitioned, etc.) are emitted
     * automatically by the FSM engine — this is for user-defined events.
     */
    emit(eventName: string, data?: unknown): void;
}

// -----------------------------------------------------------------------------
// Handler function type
//
// A single callable type for all handler forms: state input handlers,
// lifecycle hooks (_onEnter, _onExit), and the catch-all (*).
//
// Handlers return a state name to trigger a transition, or void/undefined
// to stay in the current state. This is the dynamic counterpart to string
// shorthand — same concept (determine next state), two expressions.
// -----------------------------------------------------------------------------

/**
 * A function handler for state inputs, lifecycle hooks (_onEnter, _onExit),
 * and catch-all (*) handlers.
 *
 * **Return value determines transition:**
 * - Return a valid state name → FSM transitions to that state
 * - Return void/undefined → FSM stays in the current state
 *
 * This mirrors gen_fsm's `{next_state, StateName, NewStateData}` return.
 * Guards are just `if` statements. Actions are just code before the return.
 *
 * The `...extra` rest parameter captures additional arguments passed through
 * `handle(inputName, ...extraArgs)`. These are untyped (`unknown[]`) because
 * correlating per-input arg types with handle() call sites would require
 * prohibitively complex mapped types for minimal benefit.
 *
 * @example
 * ```ts
 * // Side effects only, no transition:
 * tick({ ctx }) { ctx.tickCount++; }
 *
 * // Conditional transition (replaces guard + target):
 * timeout({ ctx }) {
 *   if (ctx.tickCount >= 3) return "yellow";
 * }
 *
 * // Unconditional transition with side effect (replaces action + target):
 * timeout({ ctx }) {
 *   console.log("transitioning after", ctx.tickCount, "ticks");
 *   return "yellow";
 * }
 *
 * // Handler with extra args passed via handle("success", responseData):
 * success({ ctx }, data) { ctx.result = data; }
 * ```
 */
export type HandlerFn<TCtx, TStateNames extends string = string> = (
    args: HandlerArgs<TCtx, TStateNames>,
    ...extra: unknown[]
) => TStateNames | void;

// -----------------------------------------------------------------------------
// Handler definition forms
//
// A handler property on a state object is one of two things:
//   1. A string — auto-transition shorthand: `timeout: "yellow"`
//   2. A function — returns target state or void: `tick({ ctx }) { ... }`
//
// Two forms, one concept: "a handler determines the next state."
// String is the static case, function is the dynamic case.
//
// The FSM engine checks typeof at runtime: "string" → immediate transition,
// "function" → call it and transition if it returns a state name.
// -----------------------------------------------------------------------------

/**
 * The union of valid handler definition forms for a state input.
 *
 * - `TStateNames` — string shorthand, auto-transitions to that state
 * - `HandlerFn` — function that returns a state name (transition) or void (stay)
 * - `MachinaInstance` — NOT a handler you'd write under an input key. It's here
 *   because `ValidateStates` types every state as the SAME `Record` value type,
 *   which combines named properties (`_onEnter`, `_onExit`, `_child`, `"*"`)
 *   with a `[input: string]: HandlerDef<...>` index signature covering
 *   everything else. TypeScript requires every named property's type to be
 *   assignable to the index signature's type, so `_child?: MachinaInstance`
 *   only type-checks if `HandlerDef` itself includes `MachinaInstance` in its
 *   union. Remove this member and `_child: someChildFsm` stops compiling.
 *
 * @example
 * ```ts
 * states: {
 *   green: {
 *     timeout: "yellow",                    // string shorthand
 *     tick({ ctx }) { ctx.tickCount++; },   // function, no transition
 *     emergency({ ctx }) {                  // function, conditional transition
 *       if (ctx.severity > 5) return "red";
 *     },
 *   },
 * }
 * ```
 */
export type HandlerDef<TCtx, TStateNames extends string = string> =
    | TStateNames
    | HandlerFn<TCtx, TStateNames>
    | MachinaInstance;

// -----------------------------------------------------------------------------
// State validation
//
// ValidateStates is the mapped type that makes config-inferred type safety
// work. This is where typos in string shorthand targets get caught at
// compile time. Getting there needs THREE separate mechanisms, not one:
//
// 1. Literal capture — TStates itself is inferred from a naked intersection
//    member on FsmConfig (`states: TStates & ...`), so it just holds whatever
//    object literal the user wrote. Plain object-literal inference doesn't
//    care what's INSIDE a state, so an empty state (`{}`) or a function-only
//    state (only _onEnter/_onExit, no string shorthand) can't poison it —
//    there's nothing here for TypeScript to "give up" on (see #188/#189
//    history below for why this matters).
//
// 2. Early state-name capture — TStateNames is a SEPARATE generic parameter,
//    defaulted to `keyof TStates & string` but inferred keys-only through
//    ValidateStates' `Record<TStateNames, ...>` shape. "Keys-only" is the
//    load-bearing part: this inference pass completes BEFORE handler bodies
//    are checked (handler bodies are context-sensitive — TypeScript defers
//    them until surrounding inference settles). That ordering is what fixes
//    #189: `defer({ until })`, lifecycle return values, and shorthand targets
//    all see the REAL literal state-name union while a handler body is being
//    type-checked, not a placeholder that hasn't resolved yet.
//
// 3. Validation — THIS type. A `Record` keyed by TStateNames (not
//    `keyof TStates` — re-deriving the key union from TStates here would
//    re-enter the same self-referential inference that broke #188/#189 in
//    the first place), with named special keys (_onEnter, _onExit, _child,
//    "*") plus an index signature for everything else. Every VALUE-position
//    reference to TStateNames is wrapped in `NoInfer`: without it, shorthand
//    VALUES (not just keys) become inference candidates for TStateNames, and
//    a typo'd target (`timeout: "yellw"`) would add itself to the union and
//    legalize itself — the typo silently becomes a "valid" state name instead
//    of an error.
//
// History: #188 filed "an empty state disables validation config-wide."
// #189 filed "defer({ until }) isn't narrowed." Both traced back to the same
// root cause — one type (the old single-parameter ValidateStates) trying to
// both INFER TStates and VALIDATE it against itself. Splitting inference
// (mechanisms 1-2) from validation (mechanism 3) fixes both at once.
// -----------------------------------------------------------------------------

/**
 * Validates and constrains the states object at the type level.
 *
 * A `Record` keyed by `TStateNames` (see the module-level comment above for
 * why it's keyed by this dedicated parameter rather than re-deriving keys
 * from `TStates`). Every state gets the same value shape: named optional
 * keys for lifecycle hooks / `_child` / catch-all, plus an index signature
 * for ordinary inputs.
 *
 * | Key              | Expected type                           |
 * |------------------|-----------------------------------------|
 * | `_onEnter`       | HandlerFn (lifecycle hook)              |
 * | `_onExit`        | HandlerFn (lifecycle hook)              |
 * | `_child`         | MachinaInstance (Fsm or BehavioralFsm)  |
 * | `*`              | HandlerFn (catch-all)                   |
 * | anything else    | HandlerDef (string or fn)               |
 *
 * @typeParam TCtx - Context/client type, flows into handler signatures
 * @typeParam TStates - The literal states object type. Only used here to
 *   default `TStateNames` — every other reference in this type uses
 *   `TStateNames` directly, never `TStates`, to avoid re-entering inference.
 * @typeParam TStateNames - The state-name union. Defaults to
 *   `keyof TStates & string`, but callers that already resolved it
 *   (the factory functions) pass it through explicitly.
 */
export type ValidateStates<
    TCtx,
    TStates extends Record<string, Record<string, unknown>>,
    TStateNames extends string = keyof TStates & string,
> = Record<
    TStateNames,
    {
        _onEnter?: HandlerFn<TCtx, NoInfer<TStateNames>>;
        _onExit?: HandlerFn<TCtx, NoInfer<TStateNames>>;
        _child?: MachinaInstance;
        "*"?: HandlerFn<TCtx, NoInfer<TStateNames>>;
    } & {
        [input: string]: HandlerDef<TCtx, NoInfer<TStateNames>>;
    }
>;

// -----------------------------------------------------------------------------
// D2 — bubbled-input coverage contract
//
// An FSM can declare `bubbles: [...]` — inputs it fires at itself expecting a
// container to catch them via nohandler bubbling (see BehavioralFsm.handle's
// delegation order). Any config that mounts that FSM via `_child` must
// account for every declared bubble: handle it directly (any state), re-declare
// it in the mounting FSM's own `bubbles` (passing the obligation up a level),
// or carry a `"*"` catch-all somewhere. ChildCoverage enforces this on the
// `states` property itself, so a violation surfaces as a compile error
// anchored on the `_child` key that introduced the uncovered mount.
// -----------------------------------------------------------------------------

/**
 * True when at least one state in `TStates` declares a `"*"` catch-all —
 * a catch-all absorbs every input, including any bubbled one, so it counts
 * as coverage for the whole FSM regardless of which state it lives on.
 */
type HasCatchAll<TStates> = {
    [S in keyof TStates]: "*" extends keyof TStates[S] ? true : never;
}[keyof TStates] extends never
    ? false
    : true;

/**
 * What this FSM absorbs, for the purpose of covering a mounted child's
 * bubbled inputs: everything it handles locally (`OwnInputNamesOf`), plus
 * everything it re-declares as its OWN `bubbles` (re-exporting the
 * obligation to whatever mounts THIS FSM), plus — if a catch-all exists
 * anywhere — literally anything.
 */
type CoverageOf<TStates, TBubbles extends string> =
    | OwnInputNamesOf<TStates>
    | TBubbles
    | (HasCatchAll<TStates> extends true ? string : never);

/**
 * For state `S`, if it mounts a `_child`, the child's declared bubbles that
 * this FSM's `CoverageOf` doesn't account for. `never` when the state has no
 * `_child`, or when every bubble is covered.
 */
type UncoveredChildBubbles<
    TStates extends Record<string, Record<string, unknown>>,
    S extends string,
    TBubbles extends string,
> = TStates[S] extends { _child: infer C }
    ? Exclude<BubblesOfInstance<C>, CoverageOf<TStates, TBubbles>>
    : never;

/**
 * Enforces the bubbled-input wiring contract across an entire `states`
 * config. Intersected onto `FsmConfig.states` alongside `TStates` and
 * `ValidateStates`, so a violation reports on the `states` object itself.
 *
 * Per state: `unknown` (a no-op intersection member) when that state's
 * `_child` mount — if any — has no uncovered bubbles. Otherwise, an
 * impossible-to-satisfy `_child` type whose single property name IS the
 * error message, naming exactly which inputs are uncovered. Coverage is
 * FSM-wide rather than mount-state-local: a bubbled input re-dispatches
 * against whatever state the parent happens to be in when the bubble
 * fires, which can be any state — so coverage declared ANYWHERE in the
 * config (or in this FSM's own `bubbles`, or via a `"*"` anywhere) counts,
 * matching that runtime reality exactly.
 */
export type ChildCoverage<
    TStates extends Record<string, Record<string, unknown>>,
    TStateNames extends string,
    TBubbles extends string,
> = {
    [S in TStateNames]: UncoveredChildBubbles<NoInfer<TStates>, S, NoInfer<TBubbles>> extends never
        ? unknown
        : {
              _child: {
                  "child bubbles up inputs this FSM neither handles nor re-declares": UncoveredChildBubbles<
                      NoInfer<TStates>,
                      S,
                      NoInfer<TBubbles>
                  >;
              };
          };
};

// -----------------------------------------------------------------------------
// FSM configuration
//
// The config shape passed to createFsm() and createBehavioralFsm().
// Both factory functions share this type — the difference is in how TCtx
// is resolved:
//   - createFsm: TCtx inferred from the `context` property
//   - createBehavioralFsm: TCtx is the client type (context property ignored)
// -----------------------------------------------------------------------------

/**
 * Configuration object for creating an FSM.
 *
 * @typeParam TCtx - The context type (Fsm) or client type (BehavioralFsm).
 *   For Fsm, this is inferred from the `context` property. For BehavioralFsm,
 *   it's the client object type provided explicitly or as a generic parameter.
 *
 * @typeParam TStates - The literal states object type. Captured directly from
 *   the naked `states: TStates & ...` intersection member below (ideally with
 *   `const` on the factory's generic to preserve string literal types) —
 *   deliberately NOT derived from `ValidateStates`, so an empty or
 *   function-only state can't disable inference (see `ValidateStates`'
 *   module comment for the full mechanism). Defaults to a loose record for
 *   unconstrained usage.
 *
 * @typeParam TStateNames - The state-name union, defaulted from `TStates` but
 *   captured as its OWN parameter (see `ValidateStates`) so it's available,
 *   fully resolved, while handler bodies are still being type-checked.
 *
 * @typeParam TBubbles - The union of inputs this FSM declares via `bubbles`.
 *   Defaults to `never` — most FSMs bubble nothing.
 *
 * @example
 * ```ts
 * // TCtx inferred as { tickCount: number }, TStates inferred from states object:
 * createFsm({
 *   id: "traffic-light",
 *   initialState: "green",         // validated against state keys
 *   context: { tickCount: 0 },     // inference site for TCtx
 *   states: {
 *     green:  { timeout: "yellow" }, // "yellow" validated against state keys
 *     yellow: { timeout: "red" },
 *     red:    { timeout: "green" },
 *   },
 * });
 * ```
 *
 * @example Declaring bubbled inputs for a child FSM
 * ```ts
 * // This FSM fires "phaseComplete" at itself but never handles it — it
 * // expects whatever mounts it via `_child` to catch the bubble.
 * const phaseController = createFsm({
 *   id: "phase-controller",
 *   initialState: "green",
 *   bubbles: ["phaseComplete"],
 *   states: {
 *     green: { advance: "red" },
 *     red: {
 *       _onEnter({ ctx }) {
 *         setTimeout(() => phaseController.handle("phaseComplete"), 0);
 *       },
 *     },
 *   },
 * });
 *
 * // Mounting it without handling "phaseComplete" (and without re-declaring
 * // it in this FSM's own `bubbles`) is a compile error on `_child` below.
 * const intersection = createFsm({
 *   id: "intersection",
 *   initialState: "northSouth",
 *   states: {
 *     northSouth: {
 *       _child: phaseController,
 *       phaseComplete: "clearance", // this line is what covers the bubble
 *     },
 *     clearance: { advance: "northSouth" },
 *   },
 * });
 * ```
 */
export interface FsmConfig<
    TCtx,
    TStates extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
    TStateNames extends string = keyof TStates & string,
    TBubbles extends string = never,
> {
    /** Unique identifier for this FSM */
    id: string;

    /**
     * The state to start in. Must be a key of `states`.
     *
     * Wrapped in NoInfer to prevent TypeScript from using this value as an
     * inference site for TStateNames. Without it, `initialState: "green"`
     * could narrow the state-name union to only have a "green" key. We want
     * inference to come exclusively from the `states` property.
     */
    initialState: NoInfer<TStateNames>;

    /**
     * Initial context data. The type is inferred from this value and flows
     * into every handler's `ctx` parameter.
     *
     * For BehavioralFsm, this property is optional and serves only as a
     * type constraint — the client object IS the context.
     */
    context?: TCtx;

    /**
     * Inputs this FSM fires at itself without handling them — expecting
     * whatever mounts it via `_child` to catch them through machina's
     * nohandler-bubbling mechanism (see the "Input delegation" section of the
     * hierarchical states guide). Declaring a bubble does two things:
     *
     * 1. Joins this FSM's own typed input union, so a self-directed
     *    `fsm.handle("phaseComplete")` (e.g. from inside `_onEnter`)
     *    type-checks without a cast.
     * 2. Becomes part of this FSM's mounting contract: any config that
     *    mounts it via `_child` must handle every declared bubble in some
     *    state, re-declare it in its OWN `bubbles` (passing the obligation
     *    up another level), or carry a `"*"` catch-all — enforced at compile
     *    time by `ChildCoverage`, which is intersected onto `states` below.
     *
     * A bubble name is NOT a state name — it can't be used as a string
     * shorthand transition target. Omit `bubbles` entirely (the default) for
     * an FSM that never expects a container to catch anything from it — such
     * an FSM can be mounted via `_child` anywhere with no obligations.
     */
    bubbles?: readonly TBubbles[];

    /**
     * State definitions. Keys become the state name union.
     *
     * The intersection with the bare `TStates` is what makes literal-type
     * capture work for empty and function-only states (see `ValidateStates`'
     * module comment) — `ValidateStates` and `ChildCoverage` layer validation
     * and the bubble-coverage contract on top without becoming the inference
     * source themselves.
     */
    states: TStates &
        ValidateStates<TCtx, TStates, TStateNames> &
        ChildCoverage<TStates, TStateNames, TBubbles>;
}

// -----------------------------------------------------------------------------
// Type discriminant — runtime distinguishing of Fsm vs BehavioralFsm
//
// Used internally by the ChildLink adapter to normalize delegation calls
// without introducing circular imports. Not exported to users.
// -----------------------------------------------------------------------------

/**
 * Symbol used as a property key to identify machina FSM instances at runtime.
 * Each class stamps itself with a MachinaType value so the ChildLink adapter
 * can dispatch handle()/canHandle()/reset() correctly without circular imports.
 */
export const MACHINA_TYPE = Symbol("machina.type");

/**
 * Discriminant values stamped onto FSM instances via `MACHINA_TYPE`.
 * Used by the `ChildLink` adapter to dispatch calls correctly without
 * importing either class directly (which would create circular dependencies).
 */
export type MachinaType = "Fsm" | "BehavioralFsm";

/** Structural type matching any machina FSM instance (Fsm or BehavioralFsm) */
export type MachinaInstance = { readonly [MACHINA_TYPE]: MachinaType };

// -----------------------------------------------------------------------------
// ChildLink — internal adapter interface
//
// Normalizes Fsm (no client arg) vs BehavioralFsm (client arg) delegation.
// The BehavioralFsm engine uses this internally; never exported to users.
// -----------------------------------------------------------------------------

/**
 * Internal adapter that wraps either an Fsm or BehavioralFsm child,
 * presenting a uniform API for parent-initiated delegation.
 */
export interface ChildLink {
    /** Check if the child's current state can handle this input */
    canHandle(client: object, inputName: string): boolean;
    /** Dispatch the input to the child */
    handle(client: object, inputName: string, ...args: unknown[]): void;
    /** Reset the child to its initialState */
    reset(client: object): void;
    /** Subscribe to all child events (wildcard). Returns unsubscribe fn. */
    onAny(callback: (eventName: string, data: unknown) => void): { off(): void };
    /** The child FSM's compositeState for the given client */
    compositeState(client: object): string;
    /**
     * Silently place `client` at the given composite state within the child hierarchy.
     * Throws for Fsm children (no per-client state to rehydrate).
     */
    rehydrate(client: object, compositeState: string): void;
    /**
     * Snapshot everything this child tracks for `client`, recursing into its own
     * children. `undefined` when the child has never seen this client. Throws for
     * Fsm children that are on the active path — an Fsm owns its own context, so
     * there's nothing per-client to snapshot. `isOnActivePath` is threaded down
     * from the true root's dehydrate() call: it's `false` whenever ANY ancestor
     * declaring state didn't match its own parent's active state, so a nested
     * BehavioralFsm child correctly treats every one of its own Fsm children as
     * off-path once the child itself is off-path, rather than recomputing
     * reachability from its own (possibly dormant) state alone.
     */
    dehydrate(client: object, isOnActivePath: boolean): ClientSnapshot | undefined;
    /**
     * Validates `snapshot` against this child's state graph (recursing into its
     * own children) and returns write thunks to run only once the ENTIRE tree
     * validates — nothing is written here. Throws for Fsm children, matching
     * `dehydrate()`.
     */
    planRehydrate(client: object, snapshot: ClientSnapshot): Array<() => void>;
    /** Dispose the child FSM */
    dispose(): void;
    /**
     * The raw Fsm or BehavioralFsm instance this ChildLink wraps.
     * Exposed for inspection tooling (machina-inspect) — allows external
     * tools to introspect child graph structure without reaching through
     * private fields.
     */
    instance: MachinaInstance;
}

/**
 * Options for FSM disposal.
 */
export interface DisposeOptions {
    /**
     * When true, child FSMs declared via _child are NOT disposed.
     * Default: false (children ARE disposed along with the parent).
     */
    preserveChildren?: boolean;
}

// -----------------------------------------------------------------------------
// Built-in FSM event maps
//
// machina FSMs emit lifecycle events that external code can subscribe to.
// These types define the payload shape for each built-in event. Custom
// events (emitted via emit() in handlers) are untyped — they flow through
// the emitter's wildcard path with `unknown` payloads.
//
// Event naming follows a grammatical pattern:
//   - Present participle = "about to happen": transitioning, handling
//   - Past participle = "just happened": transitioned, handled
// -----------------------------------------------------------------------------

/**
 * Built-in event map for Fsm instances.
 * Payloads do NOT include a client reference (Fsm is its own client).
 *
 * @typeParam TStateNames - The state name union, flows into transition
 *   event payloads so fromState/toState are narrowed to actual state names.
 */
export interface FsmEventMap<TStateNames extends string = string> {
    /** Fired just before a state transition occurs */
    transitioning: { fromState: TStateNames; toState: TStateNames };

    /** Fired just after a state transition completes */
    transitioned: { fromState: TStateNames; toState: TStateNames };

    /** Fired when an input is about to be dispatched to a handler */
    handling: { inputName: string };

    /** Fired after an input has been successfully handled */
    handled: { inputName: string };

    /** Fired when an input has no matching handler in the current state */
    nohandler: { inputName: string; args: unknown[] };

    /** Fired when a transition targets a state that doesn't exist */
    invalidstate: { stateName: string };

    /** Fired when an input is deferred for later replay */
    deferred: { inputName: string };
}

/**
 * Built-in event map for BehavioralFsm instances.
 * Every payload is intersected with `{ client: TClient }` so subscribers
 * can identify which client the event pertains to.
 *
 * @typeParam TClient - The client object type
 * @typeParam TStateNames - The state name union
 */
export type BehavioralFsmEventMap<TClient, TStateNames extends string = string> = {
    [K in keyof FsmEventMap<TStateNames>]: FsmEventMap<TStateNames>[K] & {
        client: TClient;
    };
};

// -----------------------------------------------------------------------------
// Internal per-client metadata
//
// BehavioralFsm tracks per-client state in a WeakMap<TClient, ClientMeta>.
// When the client object is garbage collected, its metadata goes with it.
// This replaces v5's __machina__ property stamping on client objects.
// -----------------------------------------------------------------------------

/**
 * A deferred input queue entry. Created when a handler calls
 * deferUntilTransition() — the input is stored here and replayed
 * after a future state transition.
 */
export interface DeferredInput {
    /** The input name that was deferred */
    inputName: string;

    /** The original arguments passed to handle() for this input */
    args: unknown[];

    /**
     * If set, only replay when entering this specific state.
     * When undefined, replays on the next transition to any state.
     */
    untilState?: string;
}

/**
 * Internal metadata stored per client in the WeakMap.
 * This is the bookkeeping the FSM engine needs — NOT user-facing data.
 *
 * @typeParam TStateNames - The state name union. The `state` field is
 *   typed to this so internal code gets compile-time validation.
 */
export interface ClientMeta<TStateNames extends string = string> {
    /** The client's current state */
    state: TStateNames;

    /** Queue of inputs deferred for later replay */
    deferredQueue: DeferredInput[];

    /**
     * The args array for the currently-executing handle() call.
     * Captured before handler dispatch so that deferUntilTransition()
     * can snapshot them for later replay. Cleared after dispatch.
     */
    currentActionArgs?: unknown[];
}

// -----------------------------------------------------------------------------
// ClientSnapshot — the dehydrate()/rehydrate() persistence contract
//
// Everything machina tracks for one client, as plain serializable data.
// Nested per hierarchy level: each FSM in the `_child` chain contributes its
// own node, keyed by the PARENT state name that declares it. Deliberately
// excludes `currentActionArgs` — that field only exists mid-handle() and has
// no meaning for a client "at rest" between calls.
// -----------------------------------------------------------------------------

/**
 * Plain-data snapshot of everything machina tracks for one client at a given
 * level of the FSM hierarchy. Produced by `dehydrate()`, consumed by the
 * object-overload of `rehydrate()`.
 *
 * `children` covers every state whose `_child` holds tracking data for this
 * client — active or not. A child the client never reached has no entry
 * (there's nothing to restore). This full-fidelity walk is what makes a
 * rehydrated client behaviorally indistinguishable from one that never left
 * memory: off-path child state and its pending deferrals travel too, and
 * replay/reset exactly as they would have in-memory on the parent's next
 * re-entry.
 */
export interface ClientSnapshot {
    /** This level's state name (not the composite dot-path). */
    state: string;

    /** This level's pending deferred inputs, in FIFO replay order. */
    deferred: DeferredInput[];

    /**
     * One entry per state (at this level) whose `_child` has tracking data
     * for this client, keyed by that state's name. Omitted entirely when no
     * state's child has ever seen this client.
     */
    children?: { [stateName: string]: ClientSnapshot };
}
