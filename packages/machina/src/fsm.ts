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
    type InputNamesOfInstance,
    type DisposeOptions,
    type SpecialStateKeys,
    type InputMap,
    type InputCall,
    type InputMapLike,
} from "./types";

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
 */
export class Fsm<
    TCtx extends object,
    TStateNames extends string,
    TInputNames extends string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- phantom marker: never referenced in the class body, only read back out externally via BubblesOfInstance's `infer`.
    TBubbles extends string = never,
    TInputs extends InputMapLike<TInputs> = InputMap,
> {
    readonly id: string;
    readonly initialState: TStateNames;
    // Type discriminant — lets ChildLink adapter identify this at runtime
    readonly [MACHINA_TYPE] = "Fsm" as const;
    // Public so inspection tooling (machina-inspect) can read the state graph.
    // Set from config.states — same object reference as BehavioralFsm.states,
    // so ChildLink wrapping done by wrapChildLinks() is reflected automatically.
    readonly states: Record<string, Record<string, unknown>>;
    private readonly bfsm: BehavioralFsm<TCtx, TStateNames, TInputNames, never, TInputs>;
    // Public readonly so external tooling (and walkAll's invariant) can read
    // context without needing to plumb it through every call site. The context
    // is already visible inside handlers via ctx — this just makes it accessible
    // from outside the FSM instance too.
    readonly context: TCtx;
    // FsmEventMap is an interface, which lacks the implicit index signature
    // that Emitter's Record<string, unknown> constraint needs. The mapped type
    // BehavioralFsmEventMap doesn't have this issue. Intersect with Record to
    // satisfy the constraint while preserving typed event signatures.
    private readonly emitter = new Emitter<FsmEventMap<TStateNames> & Record<string, unknown>>();
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
        // handler emit() or public emit()) pass through unchanged.
        this.bfsm.on("*", (eventName: string, data: unknown) => {
            if (data && typeof data === "object" && "client" in data) {
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
     * Subscribe to a built-in lifecycle event or the wildcard.
     *
     * Named overload: typed payload, no event name in callback.
     * Wildcard (`"*"`): receives `(eventName, data)` for every event.
     * Returns a no-op `Subscription` when disposed.
     */
    on<K extends keyof FsmEventMap<TStateNames> & string>(
        eventName: K,
        callback: (data: FsmEventMap<TStateNames>[K]) => void
    ): Subscription;
    on(eventName: "*", callback: (eventName: string, data: unknown) => void): Subscription;
    on(eventName: string, callback: (...args: any[]) => void): Subscription {
        if (this.disposed) {
            return { off() {} };
        }
        return this.emitter.on(eventName as any, callback as any);
    }

    /**
     * Emit a custom event through the FSM. Built-in lifecycle events are
     * emitted automatically — this is for user-defined events from handlers.
     * Routes through the BehavioralFsm so all relay paths are consistent.
     * No-ops when disposed.
     */
    emit(eventName: string, data?: unknown): void {
        if (this.disposed) {
            return;
        }
        // Route through BehavioralFsm so custom events from handler emit()
        // and public fsm.emit() take the same path through the relay.
        this.bfsm.emit(eventName, data);
    }

    /**
     * Permanently shut down this FSM. Irreversible — all subsequent method
     * calls become silent no-ops. Clears all listeners and cascades disposal
     * to child FSMs (unless `preserveChildren` is set).
     */
    dispose(options?: DisposeOptions): void {
        this.disposed = true;
        this.bfsm.dispose(options);
        this.emitter.clear();
    }
}

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
 */
export function createFsm<TInputs extends InputMapLike<TInputs>>(): <
    TCtx extends object,
    const TStates extends Record<string, Record<string, unknown>>,
    TStateNames extends string = keyof TStates & string,
    // Constrained to the map: a bubble declares "I will fire this input",
    // and the map is the complete set of fireable inputs. A bubble outside
    // the map is unfireable — reject it at the declaration (#195).
    TBubbles extends keyof TInputs & string = never,
>(
    config: FsmConfig<TCtx, TStates, TStateNames, TBubbles, TInputs>
) => Fsm<
    TCtx,
    keyof TStates & string,
    // The map is the complete input vocabulary (#195), so it replaces the
    // config-inferred union as handle()'s key source. Payload flow through
    // `_child` mounts is phase 2 — a typed parent does not yet accept its
    // children's inputs.
    keyof TInputs & string,
    TBubbles,
    TInputs
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
