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
 */
type SpecialStateKeys = "_onEnter" | "_onExit" | "_child" | "*";

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
 * Extracts input names as a string literal union from a states config object.
 * Collects all handler keys across ALL states, then strips out lifecycle hooks
 * and special keys (_onEnter, _onExit, _child, *).
 *
 * This is what flows into `handle(inputName)` to provide compile-time
 * validation of input names.
 *
 * @example
 * ```ts
 * type I = InputNamesOf<{
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
export type InputNamesOf<TStates> = Exclude<
    { [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates],
    SpecialStateKeys
>;

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
/**
 * The union of valid handler definition forms for a state input.
 *
 * - `TStateNames` — string shorthand, auto-transitions to that state
 * - `HandlerFn` — function that returns a state name (transition) or void (stay)
 * - `MachinaInstance` — included to satisfy TypeScript's structural widening
 *   when `ValidateStates` falls back to its constraint type. The per-key
 *   restriction on `_child` is still enforced by `ValidateStates`; this
 *   union member just prevents the inference engine from rejecting
 *   `_child: childFsm` before the conditional mapping can evaluate it.
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
// work. It re-maps the user's states object, constraining each property to
// the correct type based on its key name. This is where typos in string
// shorthand targets get caught at compile time.
//
// The key trick: `keyof TStates & string` is self-referential — it derives
// the state name union FROM the same states object being validated. So when
// a user writes `timeout: "yellw"`, TypeScript checks "yellw" against the
// actual state keys and reports the error.
// -----------------------------------------------------------------------------

/**
 * Validates and constrains the states object at the type level.
 *
 * This is a mapped type that walks every state and every property within
 * each state, assigning the correct expected type based on the property key:
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
 * @typeParam TStates - The literal states object type captured by the
 *   factory function's generic parameter
 */
export type ValidateStates<TCtx, TStates extends Record<string, Record<string, unknown>>> = {
    [S in keyof TStates]: {
        [K in keyof TStates[S]]: K extends "_onEnter" | "_onExit"
            ? HandlerFn<TCtx, keyof TStates & string>
            : K extends "_child"
              ? MachinaInstance
              : K extends "*"
                ? HandlerFn<TCtx, keyof TStates & string>
                : HandlerDef<TCtx, keyof TStates & string>;
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
 * @typeParam TStates - The literal states object type. Captured by the factory
 *   function's generic parameter (ideally with `const` to preserve string
 *   literal types). Defaults to a loose record for unconstrained usage.
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
 */
export interface FsmConfig<
    TCtx,
    TStates extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
> {
    /** Unique identifier for this FSM */
    id: string;

    /**
     * The state to start in. Must be a key of `states`.
     *
     * Wrapped in NoInfer to prevent TypeScript from using this value as an
     * inference site for TStates. Without it, `initialState: "green"` could
     * narrow TStates to only have a "green" key. We want inference to come
     * exclusively from the `states` property.
     */
    initialState: NoInfer<keyof TStates & string>;

    /**
     * Initial context data. The type is inferred from this value and flows
     * into every handler's `ctx` parameter.
     *
     * For BehavioralFsm, this property is optional and serves only as a
     * type constraint — the client object IS the context.
     */
    context?: TCtx;

    /** State definitions. Keys become the state name union. */
    states: ValidateStates<TCtx, TStates>;
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
