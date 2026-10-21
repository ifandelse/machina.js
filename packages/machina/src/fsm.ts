/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// fsm.ts — Single-client FSM convenience wrapper
//
// Fsm wraps a BehavioralFsm, using the config's `context` object as the
// internal client. Same engine, same lifecycle, but without the client
// parameter on every method call.
//
// =============================================================================

import { Emitter, type Subscription } from "./emitter";
import { BehavioralFsm } from "./behavioral-fsm";
import {
    MACHINA_TYPE,
    type FsmConfig,
    type FsmEventMap,
    type EventMap,
    type EventMapLike,
    type EmitArgs,
    type InputNamesOfInstance,
    type DisposeOptions,
    type SpecialStateKeys,
    type InputMap,
    type InputCall,
    type InputMapLike,
    type VocabularyLike,
    type VocabularyInputs,
    type VocabularyEvents,
} from "./types";

// The seven built-in event names, as a runtime set. The relay below strips
// `client` from these payloads only. Typed as a Record so adding an event to
// FsmEventMap without listing it here is a compile error.
const BUILT_IN_EVENT_FLAGS: Record<keyof FsmEventMap, true> = {
    transitioning: true,
    transitioned: true,
    handling: true,
    handled: true,
    nohandler: true,
    invalidstate: true,
    deferred: true,
};
const BUILT_IN_EVENT_NAMES: ReadonlySet<string> = new Set(Object.keys(BUILT_IN_EVENT_FLAGS));

/**
 * Single-client FSM. Wraps a BehavioralFsm and uses the config's `context`
 * object as the implicit client, so callers never pass a client argument.
 *
 * Prefer `createFsm()` over constructing this directly — the factory infers
 * all generic parameters from the config object.
 *
 * All public methods silently no-op after `dispose()` is called.
 *
 * @typeParam TCtx - The context type, inferred from `config.context`.
 * @typeParam TStateNames - String literal union of valid state names.
 * @typeParam TInputNames - String literal union of valid input names.
 * @typeParam TBubbles - String literal union of inputs this FSM declares via
 *   `bubbles`. Type-only — carried so `BubblesOfInstance` can extract it from
 *   a constructed instance; nothing at runtime reads this generic.
 * @typeParam TInputs - The input payload map (#195). Defaults to the wide
 *   map, under which `handle()`'s signature reduces to exactly the untyped
 *   behavior. `createFsm<TInputs>()` passes the user's map here.
 * @typeParam TEvents - The event payload map (#183). Defaults to the wide
 *   map, under which `on()` accepts any name with an `unknown` payload and
 *   `emit()` accepts any name and payload. `createFsm<{ events: TEvents }>()`
 *   passes the user's map here, which keys both by the declared names.
 */
export class Fsm<
    TCtx extends object,
    TStateNames extends string,
    TInputNames extends string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- phantom marker: never referenced in the class body, only read back out externally via BubblesOfInstance's `infer`.
    TBubbles extends string = never,
    TInputs extends InputMapLike<TInputs> = InputMap,
    TEvents extends EventMapLike<TEvents> = EventMap,
> {
    readonly id: string;
    readonly initialState: TStateNames;
    // Type discriminant — lets ChildLink adapter identify this at runtime
    readonly [MACHINA_TYPE] = "Fsm" as const;
    // Public so inspection tooling (machina-inspect) can read the state graph.
    // Set from config.states — same object reference as BehavioralFsm.states,
    // so ChildLink wrapping done by wrapChildLinks() is reflected automatically.
    readonly states: Record<string, Record<string, unknown>>;
    private readonly bfsm: BehavioralFsm<TCtx, TStateNames, TInputNames, never, TInputs, TEvents>;
    // Public readonly so external tooling (and walkAll's invariant) can read
    // context without needing to plumb it through every call site. The context
    // is already visible inside handlers via ctx — this just makes it accessible
    // from outside the FSM instance too.
    readonly context: TCtx;
    // FsmEventMap is an interface, which lacks the implicit index signature
    // that Emitter's Record<string, unknown> constraint needs. The mapped type
    // BehavioralFsmEventMap doesn't have this issue. Intersect with Record to
    // satisfy the constraint while preserving typed event signatures.
    private readonly emitter = new Emitter<FsmEventMap<TStateNames> & EventMap>();
    private disposed = false;

    constructor(config: FsmConfig<TCtx, Record<string, Record<string, unknown>>>) {
        this.id = config.id;
        this.initialState = config.initialState as TStateNames;
        this.context = (config.context ?? {}) as TCtx;

        this.bfsm = new BehavioralFsm(config);
        // Assign after bfsm construction so ChildLink wrapping (done by
        // BehavioralFsm.wrapChildLinks) is already reflected in config.states.
        this.states = config.states as Record<string, Record<string, unknown>>;

        // Relay events from BehavioralFsm → Fsm emitter, stripping the
        // `client` field from built-in event payloads. Custom events (from
        // handler emit() or public emit()) pass through unchanged, including
        // a custom payload that happens to carry its own `client` key: the
        // strip is keyed by event name, not by payload shape (#183).
        this.bfsm.on("*", (eventName: string, data: unknown) => {
            if (
                BUILT_IN_EVENT_NAMES.has(eventName) &&
                data &&
                typeof data === "object" &&
                "client" in data
            ) {
                const { client: _, ...payload } = data as Record<string, unknown>;
                (this.emitter as any).emit(eventName, payload);
            } else {
                (this.emitter as any).emit(eventName, data);
            }
        });

        // Eager init: call bfsm.transition() to enter initialState now.
        // bfsm.transition() calls getOrCreateClientMeta(), which bootstraps
        // the client and calls this.transition() internally (the real init,
        // which fires _onEnter and emits transitioning/transitioned). After
        // that inner call completes, meta.state === initialState, so the
        // original bfsm.transition() call hits the same-state guard and exits.
        this.bfsm.transition(this.context, config.initialState as TStateNames);
    }

    // -------------------------------------------------------------------------
    // Public API — same as BehavioralFsm, minus the client parameter
    // -------------------------------------------------------------------------

    /**
     * Dispatch an input to the current state's handler.
     * If a `_child` FSM in the current state can handle it, delegation occurs
     * there first; unhandled inputs bubble up to the parent.
     * No-ops silently when disposed.
     */
    handle(...call: InputCall<TInputNames, TInputs>): void {
        if (this.disposed) {
            return;
        }
        // The rest tuple keeps the input name and its payload correlated at
        // the call site; past this point the runtime treats them uniformly.
        const [inputName, ...args] = call;
        this.bfsm.handle(
            this.context,
            ...([inputName, ...args] as InputCall<TInputNames, TInputs>)
        );
    }

    /**
     * Returns true if the current state has a handler for `inputName`
     * (or a catch-all `"*"` handler), or if the current state's `_child`
     * chain can handle it (checked recursively, matching `handle()`'s
     * delegation reach). Does not trigger initialization or any side
     * effects. Returns false when disposed.
     */
    canHandle(inputName: string): boolean {
        if (this.disposed) {
            return false;
        }
        return this.bfsm.canHandle(this.context, inputName);
    }

    /**
     * Transition back to `initialState`, firing `_onEnter` and lifecycle
     * events as if entering it fresh. No-ops silently when disposed.
     */
    reset(): void {
        if (this.disposed) {
            return;
        }
        this.bfsm.reset(this.context);
    }

    /**
     * Returns the current state name. Always defined — Fsm eagerly
     * initializes into `initialState` during construction.
     */
    currentState(): TStateNames {
        return this.bfsm.currentState(this.context) as TStateNames;
    }

    /**
     * Directly transition to `toState`, firing `_onExit`, `_onEnter`, and
     * lifecycle events. Same-state transitions are silently ignored.
     * No-ops when disposed.
     */
    transition(toState: TStateNames): void {
        if (this.disposed) {
            return;
        }
        this.bfsm.transition(this.context, toState);
    }

    /**
     * Returns the current state as a dot-delimited path that includes
     * any active child FSM states (e.g. `"active.connecting.retrying"`).
     * Returns just the current state name when no child is active.
     */
    compositeState(): string {
        return this.bfsm.compositeState(this.context);
    }

    /**
     * Subscribe to a built-in lifecycle event, a custom event, or the wildcard.
     *
     * Named overload: the callback receives the payload only. A built-in
     * name gets its typed payload. A custom name gets the payload type its
     * event map declares, or `unknown` when the FSM declares no map; under a
     * declared map an undeclared name is a compile error (#183).
     * Wildcard (`"*"`): receives `(eventName, data)` for every event. It is
     * listed first because the named overload's key type is `string` under
     * the wide map, so `"*"` would otherwise match it.
     * Returns a no-op `Subscription` when disposed.
     */
    on(eventName: "*", callback: (eventName: string, data: unknown) => void): Subscription;
    on<K extends keyof (FsmEventMap<TStateNames> & TEvents) & string>(
        eventName: K,
        callback: (data: (FsmEventMap<TStateNames> & TEvents)[K]) => void
    ): Subscription;
    on(eventName: string, callback: (...args: any[]) => void): Subscription {
        if (this.disposed) {
            return { off() {} };
        }
        return this.emitter.on(eventName as any, callback as any);
    }

    /**
     * Emit a custom event through the FSM. Built-in lifecycle events are
     * emitted automatically — this is for user-defined events from handlers.
     * Under a declared event map (#183) the name and payload are checked
     * against it. Routes through the BehavioralFsm so all relay paths are
     * consistent. No-ops when disposed.
     */
    emit<K extends keyof TEvents & string>(eventName: K, ...data: EmitArgs<TEvents[K]>): void {
        if (this.disposed) {
            return;
        }
        // Route through BehavioralFsm so custom events from handler emit()
        // and public fsm.emit() take the same path through the relay.
        this.bfsm.emit(eventName, ...data);
    }

    /**
     * Permanently shut down this FSM. Irreversible — all subsequent method
     * calls become silent no-ops. Runs the config's `onDispose` hook with the
     * context, clears all listeners, and cascades disposal to child FSMs
     * (unless `preserveChildren` is set). A second call is a no-op.
     *
     * A throwing `onDispose` hook (or child disposal) does not stop teardown:
     * the delegate rethrows the failures as one `AggregateError` after its
     * own cleanup, and this wrapper's listeners clear regardless.
     */
    dispose(options?: DisposeOptions): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        try {
            this.bfsm.dispose(options);
        } finally {
            this.emitter.clear();
        }
    }
}

/**
 * The function `createFsm<TVocab>()` returns: it takes the config and infers
 * everything else from it.
 *
 * The two `infer ... extends` clauses are the proof that the maps extracted
 * from the vocabulary slot satisfy `Fsm`'s constraints. `VocabularyInputs`
 * and `VocabularyEvents` are conditional types, and TypeScript will not hand
 * a conditional type to a constrained type parameter while the type it
 * depends on (`TVocab`) is still unresolved, so the overload cannot write
 * `Fsm<..., VocabularyInputs<TVocab>, ...>` directly. Re-inferring each map
 * under its constraint defers the check to the call site, where `TVocab` is
 * concrete, both conditionals resolve, and the result is the plain generic
 * function below. The `never` branches are unreachable for any argument that
 * passed `VocabularyLike`.
 *
 * @typeParam TInputsIn - `VocabularyInputs<TVocab>`, not yet proven.
 * @typeParam TEventsIn - `VocabularyEvents<TVocab>`, not yet proven.
 */
export type CurriedFsmFactory<TInputsIn, TEventsIn> = TInputsIn extends infer TInputs extends
    InputMapLike<TInputs>
    ? TEventsIn extends infer TEvents extends EventMapLike<TEvents>
        ? <
              TCtx extends object,
              const TStates extends Record<string, Record<string, unknown>>,
              TStateNames extends string = keyof TStates & string,
              // Constrained to the map: a bubble declares "I will fire this
              // input", and the map is the complete set of fireable inputs.
              // A bubble outside the map is unfireable — reject it at the
              // declaration (#195). On the wide map the constraint reduces
              // to `string`.
              TBubbles extends keyof TInputs & string = never,
          >(
              config: FsmConfig<TCtx, TStates, TStateNames, TBubbles, TInputs, TEvents>
          ) => Fsm<
              TCtx,
              keyof TStates & string,
              // With a real input map (#195), the map is the complete input
              // vocabulary, so it replaces the config-inferred union as
              // handle()'s key source. `string extends keyof TInputs`
              // detects the wide map (a bag with no `inputs` member), where
              // the union stays inferred from the config exactly as the
              // direct form infers it. Payload flow through `_child` mounts
              // is phase 2 — a typed parent does not yet accept its
              // children's inputs.
              string extends keyof TInputs
                  ? | Exclude<
                          { [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates],
                          SpecialStateKeys
                      >
                    | {
                          [S in keyof TStates]: TStates[S] extends { _child: infer C }
                              ? InputNamesOfInstance<C>
                              : never;
                      }[keyof TStates]
                    | TBubbles
                  : keyof TInputs & string,
              TBubbles,
              TInputs,
              TEvents
          >
        : never
    : never;

/**
 * Create a single-client FSM from a config object.
 *
 * Generic parameters are inferred automatically:
 * - `TCtx` comes from `config.context` (defaults to `{}` if omitted).
 * - `TStates` is captured with `const` inference to preserve string literal
 *   types, enabling compile-time validation of transition targets and `handle()`
 *   input names.
 *
 * State names, input names, and all handler signatures derive from `TStates`.
 *
 * A config-level `onDispose` hook (#194) runs from `dispose()` with the
 * context; see `FsmConfig.onDispose` for the contract.
 *
 * To type each input's payload as well (#195), call the curried form with an
 * input payload map: `createFsm<TInputs>()({...})`. The zero-argument call
 * fixes `TInputs`; the returned function infers everything else from the
 * config exactly as the direct form does. The split exists because TypeScript
 * has no partial type-argument inference — the map can't ride along with the
 * inferred parameters. Under a map, handler payload parameters are inferred
 * from the map's tuples and `handle()` enforces them at the call site. The
 * map is also the complete input vocabulary: handler keys outside it are
 * compile errors.
 *
 * To type custom events as well (#183), put a vocabulary bag in the same
 * slot: `createFsm<{ events: TEvents }>()` for events alone, or
 * `createFsm<{ inputs: TInputs; events: TEvents }>()` for both. Under an
 * event map, `emit()` in handlers and on the instance is keyed by the map's
 * names and checks each payload, and `on()` types the declared events
 * alongside the built-in ones.
 *
 * @example
 * ```ts
 * const light = createFsm({
 *   id: "traffic-light",
 *   initialState: "green",
 *   context: { tickCount: 0 },
 *   states: {
 *     green:  { timeout: "yellow" },
 *     yellow: { timeout: "red" },
 *     red:    { timeout: "green" },
 *   },
 * });
 *
 * light.handle("timeout"); // transitions green → yellow
 * ```
 *
 * @example Typed input payloads via the curried form
 * ```ts
 * type TrafficLightInputs = {
 *   timeout: [];
 *   emergency: [event: { severity: number }];
 * };
 *
 * const light = createFsm<TrafficLightInputs>()({
 *   id: "traffic-light",
 *   initialState: "green",
 *   context: { minSeverity: 3 },
 *   states: {
 *     green: {
 *       timeout: "yellow",
 *       // `event` is inferred as { severity: number }
 *       emergency({ ctx }, event) {
 *         if (event.severity < ctx.minSeverity) { return; }
 *         return "red";
 *       },
 *     },
 *     yellow: { timeout: "red" },
 *     red: {},
 *   },
 * });
 *
 * light.handle("emergency", { severity: 5 }); // payload enforced
 * ```
 *
 * @example Typed custom events via a vocabulary bag
 * ```ts
 * type TrafficLightEvents = {
 *   cycleCompleted: { cycles: number };
 *   maintenanceDue: undefined; // payload-free
 * };
 *
 * const light = createFsm<{ events: TrafficLightEvents }>()({
 *   id: "traffic-light",
 *   initialState: "green",
 *   context: { cycles: 0 },
 *   states: {
 *     green: { timeout: "yellow" },
 *     yellow: { timeout: "red" },
 *     red: {
 *       timeout({ ctx, emit }) {
 *         ctx.cycles++;
 *         emit("cycleCompleted", { cycles: ctx.cycles }); // payload checked
 *         emit("maintenanceDue");                          // payload optional
 *         return "green";
 *       },
 *     },
 *   },
 * });
 *
 * light.on("cycleCompleted", ({ cycles }) => console.log(cycles)); // typed
 * ```
 */
export function createFsm<TVocab extends VocabularyLike<TVocab> = InputMap>(): CurriedFsmFactory<
    VocabularyInputs<TVocab>,
    VocabularyEvents<TVocab>
>;
// The direct overload must stay LAST (matching createBehavioralFsm). Utility
// types that collapse an overload set — ReturnType<typeof createFsm> in
// particular — resolve to the final signature. Downstream code relies on that
// signature being the Fsm-returning form, not the curried function.
export function createFsm<
    TCtx extends object = Record<string, never>,
    const TStates extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
    TStateNames extends string = keyof TStates & string,
    TBubbles extends string = never,
>(
    config: FsmConfig<TCtx, TStates, TStateNames, TBubbles>
): Fsm<
    TCtx,
    // Both unions below are inlined rather than written as `StateNamesOf<TStates>`
    // / `InputNamesOf<TStates>`: a named alias reference keeps its alias symbol
    // in compiler diagnostics, so a rejected handle()/transition() call would
    // display "InputNamesOf<{...entire config...}>" instead of the flat literal
    // union. Inlining the aliases' right-hand sides forces eager evaluation and
    // keeps error text readable. Display-only — hover types are identical.
    keyof TStates & string,
    | Exclude<{ [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates], SpecialStateKeys>
    | {
          [S in keyof TStates]: TStates[S] extends { _child: infer C }
              ? InputNamesOfInstance<C>
              : never;
      }[keyof TStates]
    | TBubbles,
    TBubbles
>;
export function createFsm<
    TCtx extends object = Record<string, never>,
    const TStates extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
    TStateNames extends string = keyof TStates & string,
    TBubbles extends string = never,
>(config?: FsmConfig<TCtx, TStates, TStateNames, TBubbles>) {
    if (config === undefined) {
        return (curriedConfig: FsmConfig<TCtx, TStates, TStateNames, TBubbles>) =>
            new Fsm(curriedConfig as FsmConfig<TCtx, Record<string, Record<string, unknown>>>);
    }
    return new Fsm(config as FsmConfig<TCtx, Record<string, Record<string, unknown>>>);
}
