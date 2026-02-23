/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// behavioral-fsm.ts — The core FSM engine
//
// BehavioralFsm defines behavior (states + transitions) while tracking state
// externally per-client via a WeakMap. One FSM definition can drive any number
// of independent client objects.
//
// =============================================================================

import { Emitter, type Subscription } from "./emitter";
import {
    MACHINA_TYPE,
    type FsmConfig,
    type StateNamesOf,
    type InputNamesOf,
    type HandlerArgs,
    type HandlerFn,
    type BehavioralFsmEventMap,
    type ClientMeta,
    type DeferredInput,
    type ChildLink,
    type DisposeOptions,
} from "./types";

// Safety valve for _onEnter → transition loops. Instance-level counter works
// because the engine is synchronous — only one transition chain is active at
// a time. Throws on overflow, then resets so the FSM isn't permanently broken.
const MAX_TRANSITION_DEPTH = 20;

/**
 * Defines FSM behavior (states + transitions) while tracking per-client state
 * in a `WeakMap`. A single `BehavioralFsm` instance can drive any number of
 * independent client objects simultaneously — each gets its own state,
 * deferred queue, and lifecycle.
 *
 * Prefer `createBehavioralFsm()` over constructing this directly — the factory
 * infers all generic parameters from the config object.
 *
 * All public methods silently no-op after `dispose()` is called.
 *
 * @typeParam TClient - The client object type. Must be an object (non-primitive)
 *   so it can serve as a WeakMap key.
 * @typeParam TStateNames - String literal union of valid state names.
 * @typeParam TInputNames - String literal union of valid input names.
 */
export class BehavioralFsm<
    TClient extends object,
    TStateNames extends string,
    TInputNames extends string,
> {
    readonly id: string;
    readonly initialState: TStateNames;
    // Type discriminant — lets ChildLink adapter identify this at runtime
    readonly [MACHINA_TYPE] = "BehavioralFsm" as const;
    private readonly states: Record<string, Record<string, unknown>>;
    private readonly emitter = new Emitter<BehavioralFsmEventMap<TClient, TStateNames>>();
    private readonly clients = new WeakMap<TClient, ClientMeta<TStateNames>>();
    // Tracks all initialized clients so the Fsm-child nohandler listener can
    // find which clients need bubbling (Fsm events have no client in payload).
    // WeakRef prevents retention; clients clean themselves up naturally.
    private readonly knownClients: Set<WeakRef<TClient>> = new Set();
    // Subscriptions to child FSM wildcard events, keyed by state name.
    // Set up once during construction, torn down in dispose().
    private readonly childSubscriptions: Array<{ off(): void }> = [];
    private disposed = false;
    private transitionDepth = 0;

    constructor(config: FsmConfig<TClient, Record<string, Record<string, unknown>>>) {
        this.id = config.id;
        this.initialState = config.initialState as TStateNames;
        this.states = config.states as Record<string, Record<string, unknown>>;
        this.wrapChildLinks();
        this.setupChildSubscriptions();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Dispatch an input to the given client's current state handler.
     *
     * Delegation order: if the current state has a `_child` FSM that can
     * handle the input, it is dispatched there. If the child emits `nohandler`,
     * the input bubbles up to this FSM's local handler. If no handler exists
     * here either, `nohandler` is emitted on this FSM's emitter.
     *
     * No-ops silently when disposed.
     */
    handle(client: TClient, inputName: TInputNames, ...args: unknown[]): void {
        if (this.disposed) {
            return;
        }

        const meta = this.getOrCreateClientMeta(client);
        meta.currentActionArgs = args;

        // Delegation: if the current state has a _child and the child can
        // handle this input, send it there. Otherwise fall through to
        // handleLocally(). No nohandler emitted for the delegation path.
        const stateObj = this.states[meta.state];
        const childLink = stateObj?._child as ChildLink | undefined;
        if (childLink) {
            if (childLink.canHandle(client, inputName)) {
                try {
                    childLink.handle(client, inputName, ...args);
                } finally {
                    // Clear args even if the child handler throws — stale args
                    // on meta would corrupt subsequent handle() calls for this client.
                    meta.currentActionArgs = undefined;
                }
                return;
            }
        }

        this.handleLocally(client, inputName, args, meta);
    }

    /**
     * Returns true if the client's current state has a handler for `inputName`
     * (or a catch-all `"*"` handler). Does NOT initialize the client — no
     * `_onEnter`, no events, no side effects. Unseen clients are treated as
     * if they were already in `initialState`. Returns false when disposed.
     */
    canHandle(client: TClient, inputName: string): boolean {
        if (this.disposed) {
            return false;
        }
        // Does NOT initialize the client. We want a pure state check —
        // no side effects, no _onEnter, no events. Use initialState as the
        // fallback for unseen clients (they'd start there anyway).
        const state = this.clients.get(client)?.state ?? this.initialState;
        const stateObj = this.states[state];
        return !!(stateObj?.[inputName] ?? stateObj?.["*"]);
    }

    /**
     * Transition the client back to `initialState`, firing `_onEnter` and
     * lifecycle events as if entering it fresh. No-ops when disposed.
     */
    reset(client: TClient): void {
        if (this.disposed) {
            return;
        }
        this.transition(client, this.initialState);
    }

    /**
     * Returns the client's current state, or `undefined` if the client has
     * never been initialized (i.e. `handle()`, `transition()`, or `reset()`
     * have never been called for it). Does NOT trigger initialization.
     */
    currentState(client: TClient): TStateNames | undefined {
        // Intentionally uses WeakMap.get() directly — does NOT trigger initialization.
        // Returns undefined for clients the FSM has never seen.
        return this.clients.get(client)?.state;
    }

    /**
     * Directly transition `client` to `toState`, running the full lifecycle:
     * `_onExit` for the current state → `transitioning` event → update state →
     * `_onEnter` for new state → `transitioned` event → child reset → deferred
     * queue replay → bounce (if `_onEnter` returned a state name).
     *
     * Same-state transitions are silently ignored. Transitions to unknown state
     * names emit `invalidstate` instead of throwing. Throws if the transition
     * depth exceeds `MAX_TRANSITION_DEPTH` (likely an `_onEnter` → transition loop).
     *
     * No-ops when disposed.
     */
    transition(client: TClient, toState: TStateNames): void {
        if (this.disposed) {
            return;
        }

        const meta = this.getOrCreateClientMeta(client);
        const fromState = meta.state;

        if (toState === fromState) {
            return;
        }

        if (!(toState in this.states)) {
            this.emitter.emit("invalidstate", { stateName: toState, client });
            return;
        }

        this.transitionDepth++;
        if (this.transitionDepth > MAX_TRANSITION_DEPTH) {
            this.transitionDepth = 0;
            throw new Error(
                `Max transition depth (${MAX_TRANSITION_DEPTH}) exceeded in FSM "${this.id}". ` +
                    "Likely an infinite _onEnter → transition loop."
            );
        }

        try {
            const curStateObj = this.states[fromState];
            const newStateObj = this.states[toState];

            // _onExit for current state. The optional chain handles two cases:
            // 1. First-time initialization — fromState is `undefined as TStateNames`,
            //    so this.states[undefined] is undefined; no exit hook to run.
            // 2. States that simply have no _onExit defined — equally valid, equally ignored.
            if (curStateObj?._onExit && typeof curStateObj._onExit === "function") {
                const exitArgs = this.buildHandlerArgs(client, "", meta);
                (curStateObj._onExit as HandlerFn<TClient, TStateNames>)(exitArgs);
                // _onExit return value is intentionally ignored — you're already leaving
            }

            meta.state = toState;

            const payload = { fromState, toState, client };
            this.emitter.emit("transitioning", payload);

            // _onEnter for new state — return value is a bounce target
            let bounceTarget: TStateNames | void = undefined;
            if (newStateObj?._onEnter && typeof newStateObj._onEnter === "function") {
                const enterArgs = this.buildHandlerArgs(client, "", meta);
                bounceTarget = (newStateObj._onEnter as HandlerFn<TClient, TStateNames>)(enterArgs);
            }

            this.emitter.emit("transitioned", payload);

            // Reset child FSM after entering the new state. This ensures the child
            // always starts from its initialState when the parent enters. Happens
            // after _onEnter and transitioned but before deferred queue processing,
            // so deferred inputs see the post-reset child state.
            const childLink = newStateObj?._child as ChildLink | undefined;
            if (childLink) {
                childLink.reset(client);
            }

            // Replay deferred inputs targeting this state
            this.processQueue(client, meta);

            // Bounce: _onEnter returned a state name. Only fires if we're still
            // in the state _onEnter belongs to — a deferred replay might have
            // already moved us elsewhere.
            if (typeof bounceTarget === "string" && meta.state === toState) {
                this.transition(client, bounceTarget);
            }
        } finally {
            this.transitionDepth--;
        }
    }

    /**
     * Returns the client's state as a dot-delimited path including any active
     * child FSM states (e.g. `"active.connecting.retrying"`). Returns just the
     * current state name when no child is active. Returns `""` for clients that
     * have never been initialized (unlike `currentState()` which returns `undefined`).
     */
    compositeState(client: TClient): string {
        const meta = this.clients.get(client);
        if (!meta) {
            // Returns "" (not undefined like currentState()) because compositeState
            // produces dot-delimited paths ("stateA.child.grandchild") for hierarchies.
            // Empty string is the correct "nothing to report" sentinel for string concat.
            return "";
        }

        const stateObj = this.states[meta.state];
        const childLink = stateObj?._child as ChildLink | undefined;
        if (childLink) {
            const childComposite = childLink.compositeState(client);
            if (childComposite) {
                return `${meta.state}.${childComposite}`;
            }
        }

        return meta.state;
    }

    /**
     * Subscribe to a built-in lifecycle event or the wildcard.
     *
     * Named overload: typed payload includes `{ client: TClient }` so you can
     * identify which client the event pertains to. Wildcard (`"*"`) receives
     * `(eventName, data)` for every event. Returns a no-op `Subscription`
     * when disposed.
     */
    on<K extends keyof BehavioralFsmEventMap<TClient, TStateNames> & string>(
        eventName: K,
        callback: (data: BehavioralFsmEventMap<TClient, TStateNames>[K]) => void
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
     * No-ops when disposed.
     */
    emit(eventName: string, data?: unknown): void {
        if (this.disposed) {
            return;
        }
        // Public emit is for user-defined custom events. Built-in events are
        // emitted automatically by the engine.
        (this.emitter as any).emit(eventName, data);
    }

    /**
     * Permanently shut down this FSM. Irreversible — all subsequent method
     * calls become silent no-ops. Tears down child subscriptions, clears all
     * listeners, and cascades disposal to child FSMs (unless `preserveChildren`
     * is set). The same child appearing in multiple states is disposed once.
     */
    dispose(options?: DisposeOptions): void {
        this.disposed = true;
        // Tear down all child wildcard subscriptions before clearing our emitter.
        for (const sub of this.childSubscriptions) {
            sub.off();
        }
        // Cascade disposal to child FSMs unless explicitly opted out.
        // Deduplication via Set handles the same child appearing in multiple states.
        if (!options?.preserveChildren) {
            const seen = new Set<ChildLink>();
            for (const stateName of Object.keys(this.states)) {
                const childLink = this.states[stateName]?._child as ChildLink | undefined;
                if (childLink && !seen.has(childLink)) {
                    seen.add(childLink);
                    childLink.dispose();
                }
            }
        }
        this.emitter.clear();
        // WeakMap entries are GC'd naturally — can't iterate, don't need to
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /**
     * Walks all states at construction time, detects raw FSM instances assigned
     * to _child, and wraps them into ChildLink adapters via createChildLink().
     * Must run BEFORE setupChildSubscriptions() so the subscriptions see
     * ChildLink objects, not raw FSM instances.
     */
    private wrapChildLinks(): void {
        for (const stateName of Object.keys(this.states)) {
            const stateObj = this.states[stateName];
            const rawChild = stateObj?._child;
            if (!rawChild) {
                continue;
            }
            if (typeof rawChild !== "object") {
                throw new Error(
                    `State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, got ${String(rawChild)}`
                );
            }
            if (!(MACHINA_TYPE in rawChild)) {
                throw new Error(
                    `State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, got a plain object`
                );
            }
            stateObj._child = createChildLink(rawChild);
        }
    }

    /**
     * Walks all states at construction time, finds states with _child, and
     * subscribes once to each unique child's wildcard events. Subscriptions are
     * stored for cleanup in dispose(). We deduplicate by child reference to
     * avoid double-subscribing when the same child appears in multiple states.
     */
    private setupChildSubscriptions(): void {
        const seenChildren = new Set<ChildLink>();

        for (const stateName of Object.keys(this.states)) {
            const stateObj = this.states[stateName];
            const childLink = stateObj?._child as ChildLink | undefined;

            if (!childLink || seenChildren.has(childLink)) {
                continue;
            }
            seenChildren.add(childLink);

            // Subscribe to all child events. We use the wildcard so we get
            // every event type in a single listener.
            const sub = childLink.onAny((eventName: string, data: unknown) => {
                // Nohandler from child = child couldn't handle the input.
                // Re-dispatch to parent via handleLocally() (not handle(), to
                // avoid re-entering the delegation path and looping).
                if (eventName === "nohandler") {
                    const payload = data as {
                        inputName: string;
                        args: unknown[];
                        client?: TClient;
                    };

                    if (payload.client !== undefined) {
                        // BehavioralFsm child: payload includes the client.
                        // Filter stale events: only bubble if this client is
                        // currently in a state that has this child.
                        this.bubbleNohandler(
                            payload.client,
                            childLink,
                            payload.inputName,
                            payload.args ?? []
                        );
                    } else {
                        // Fsm child: single-client, no client in payload.
                        // Walk all known clients and bubble for any that are
                        // currently in a state with this child.
                        for (const ref of this.knownClients) {
                            const client = ref.deref();
                            if (client === undefined) {
                                // GC'd — clean up the dead ref
                                this.knownClients.delete(ref);
                                continue;
                            }
                            this.bubbleNohandler(
                                client,
                                childLink,
                                payload.inputName,
                                payload.args ?? []
                            );
                        }
                    }
                    return;
                }

                // All other child events: only relay if at least one client
                // is currently in a parent state that delegates to this child.
                // Prevents stale events from leaking through the parent emitter
                // when the child fires during construction or after the parent
                // has moved to a different state.
                const payload = data as Record<string, unknown> | undefined;
                if (payload && typeof payload === "object" && "client" in payload) {
                    // BehavioralFsm child: payload includes the client.
                    if (this.isChildActiveForClient(payload.client as TClient, childLink)) {
                        (this.emitter as any).emit(eventName, data);
                    }
                } else {
                    // Fsm child (or payload without client): walk known clients,
                    // relay if ANY client is currently in a state with this child.
                    for (const ref of this.knownClients) {
                        const client = ref.deref();
                        if (!client) {
                            this.knownClients.delete(ref);
                            continue;
                        }
                        if (this.isChildActiveForClient(client, childLink)) {
                            (this.emitter as any).emit(eventName, data);
                            break; // one match is enough — relay once
                        }
                    }
                }
            });

            this.childSubscriptions.push(sub);
        }
    }

    /**
     * Bubbles a child nohandler to the parent for the given client.
     * Only fires if the client is currently in a state that has this childLink.
     * Extracted from the lambda in setupChildSubscriptions to keep it readable.
     */
    private bubbleNohandler(
        client: TClient,
        childLink: ChildLink,
        inputName: string,
        args: unknown[]
    ): void {
        if (!this.isChildActiveForClient(client, childLink)) {
            return;
        }
        // Safe to assert — isChildActiveForClient confirmed meta exists AND
        // the client is in a state whose _child matches childLink.
        const meta = this.clients.get(client)!;
        meta.currentActionArgs = args;
        this.handleLocally(client, inputName as TInputNames, args, meta);
    }

    /**
     * Returns true if the given client is currently in a parent state whose
     * _child is the specified childLink. Returns false if the client has no
     * meta (never initialized) or is in a state with a different (or no) child.
     */
    private isChildActiveForClient(client: TClient, childLink: ChildLink): boolean {
        const meta = this.clients.get(client);
        if (!meta) {
            return false;
        }
        const parentStateObj = this.states[meta.state];
        return parentStateObj?._child === childLink;
    }

    /**
     * The inner handler dispatch — no delegation, no initialization side effects
     * beyond what getOrCreateClientMeta already did. Called by handle() after
     * the delegation check, and by the nohandler child listener for bubbling.
     */
    private handleLocally(
        client: TClient,
        inputName: TInputNames | string,
        args: unknown[],
        meta: ClientMeta<TStateNames>
    ): void {
        const stateObj = this.states[meta.state];
        const handler = stateObj?.[inputName] ?? stateObj?.["*"];

        if (!handler) {
            this.emitter.emit("nohandler", { inputName: inputName as string, args, client });
            meta.currentActionArgs = undefined;
            return;
        }

        try {
            this.emitter.emit("handling", { inputName: inputName as string, client });

            const handlerArgs = this.buildHandlerArgs(client, inputName as string, meta);
            let targetState: TStateNames | void = undefined;

            if (typeof handler === "string") {
                targetState = handler as TStateNames;
            } else if (typeof handler === "function") {
                targetState = (handler as HandlerFn<TClient, TStateNames>)(handlerArgs, ...args);
            }

            this.emitter.emit("handled", { inputName: inputName as string, client });

            if (typeof targetState === "string") {
                this.transition(client, targetState);
            }
        } finally {
            meta.currentActionArgs = undefined;
        }
    }

    private getOrCreateClientMeta(client: TClient): ClientMeta<TStateNames> {
        let meta = this.clients.get(client);
        if (meta) {
            return meta;
        }

        // State starts as undefined so transition()'s same-state check passes
        // (undefined !== initialState). The transition immediately sets state
        // to initialState before returning, so any code that triggered
        // initialization (handle/reset/transition) sees the correct state.
        // currentState() for uninitialized clients still returns undefined —
        // it reads the WeakMap directly without triggering init.
        meta = {
            state: undefined as unknown as TStateNames,
            deferredQueue: [],
        };
        this.clients.set(client, meta);
        // Track this client weakly so Fsm-child nohandler listeners can find
        // which clients to bubble to (Fsm events carry no client in payload).
        this.knownClients.add(new WeakRef(client));

        // v5-style active initialization: full transition into initialState.
        // Fires _onEnter, emits transitioning/transitioned, processes deferred
        // queue. _onExit is skipped (no state object for undefined).
        this.transition(client, this.initialState);

        return meta;
    }

    private buildHandlerArgs(
        client: TClient,
        inputName: string,
        meta: ClientMeta<TStateNames>
    ): HandlerArgs<TClient, TStateNames> {
        return {
            ctx: client,
            inputName,
            defer: (opts?: { until: TStateNames }) => {
                // Only meaningful inside a handle() context where currentActionArgs
                // is set. No-ops during lifecycle hooks (matches v5 behavior).
                if (!meta.currentActionArgs) {
                    return;
                }
                const deferred: DeferredInput = {
                    inputName,
                    args: [...meta.currentActionArgs],
                    untilState: opts?.until,
                };
                meta.deferredQueue.push(deferred);
                this.emitter.emit("deferred", { inputName, client });
            },
            emit: (evtName: string, evtData?: unknown) => {
                (this.emitter as any).emit(evtName, evtData);
            },
        };
    }

    private processQueue(client: TClient, meta: ClientMeta<TStateNames>): void {
        const toReplay: DeferredInput[] = [];
        const remaining: DeferredInput[] = [];

        for (const item of meta.deferredQueue) {
            if (item.untilState === undefined || item.untilState === meta.state) {
                toReplay.push(item);
            } else {
                remaining.push(item);
            }
        }

        meta.deferredQueue = remaining;

        for (const item of toReplay) {
            this.handle(client, item.inputName as TInputNames, ...item.args);
        }
    }
}

// -----------------------------------------------------------------------------
// createChildLink — internal adapter factory
//
// Wraps either an Fsm or BehavioralFsm child and presents a uniform interface
// for the parent engine to call. Never exported. The MACHINA_TYPE discriminant
// tells us which call shape to use.
// -----------------------------------------------------------------------------

/**
 * Internal factory called by `wrapChildLinks()` during construction.
 * Wraps a raw Fsm or BehavioralFsm instance in a uniform `ChildLink` adapter
 * so the parent engine doesn't need to know which type it's talking to.
 *
 * Users never call this directly — they assign an FSM instance to `_child`
 * in their state config and `wrapChildLinks()` handles the wrapping.
 */
function createChildLink(child: any): ChildLink {
    if (!child || typeof child !== "object") {
        throw new Error(
            `createChildLink: expected an Fsm or BehavioralFsm instance, got ${String(child)}`
        );
    }
    const childType: string = child[MACHINA_TYPE];

    if (childType === "BehavioralFsm") {
        return {
            canHandle(client: object, inputName: string): boolean {
                return child.canHandle(client, inputName);
            },
            handle(client: object, inputName: string, ...args: unknown[]): void {
                child.handle(client, inputName, ...args);
            },
            reset(client: object): void {
                child.transition(client, child.initialState);
            },
            onAny(callback: (eventName: string, data: unknown) => void): { off(): void } {
                return child.on("*", callback);
            },
            compositeState(client: object): string {
                return child.compositeState(client);
            },
            dispose(): void {
                child.dispose();
            },
        };
    }

    if (childType === "Fsm") {
        return {
            canHandle(_client: object, inputName: string): boolean {
                return child.canHandle(inputName);
            },
            handle(_client: object, inputName: string, ...args: unknown[]): void {
                child.handle(inputName, ...args);
            },
            reset(_client: object): void {
                child.reset();
            },
            onAny(callback: (eventName: string, data: unknown) => void): { off(): void } {
                return child.on("*", callback);
            },
            compositeState(_client: object): string {
                return child.compositeState();
            },
            dispose(): void {
                child.dispose();
            },
        };
    }

    throw new Error(
        `createChildLink: expected an Fsm or BehavioralFsm instance, ` +
            `got [MACHINA_TYPE] = ${String(childType ?? "undefined")}`
    );
}

/**
 * Create a behavioral FSM (one definition, many clients) from a config object.
 *
 * Generic parameters are inferred automatically:
 * - `TClient` must be provided explicitly as a type parameter (it can't be
 *   inferred from the config since no `context` property exists at the FSM level).
 * - `TStates` is captured with `const` inference to preserve string literal
 *   types, enabling compile-time validation of transition targets and `handle()`
 *   input names.
 *
 * State names, input names, and all handler signatures derive from `TStates`.
 *
 * @example
 * ```ts
 * interface Connection { url: string; retries: number; }
 *
 * const connFsm = createBehavioralFsm<Connection>({
 *   id: "connectivity",
 *   initialState: "disconnected",
 *   states: {
 *     disconnected: { connect: "connecting" },
 *     connecting:   { connected: "online", failed: "disconnected" },
 *     online:       { disconnect: "disconnected" },
 *   },
 * });
 *
 * const conn = { url: "wss://example.com", retries: 0 };
 * connFsm.handle(conn, "connect");
 * ```
 */
export function createBehavioralFsm<
    TClient extends object,
    const TStates extends Record<string, Record<string, unknown>>,
>(
    config: FsmConfig<TClient, TStates>
): BehavioralFsm<TClient, StateNamesOf<TStates>, InputNamesOf<TStates>> {
    return new BehavioralFsm(config as FsmConfig<TClient, Record<string, Record<string, unknown>>>);
}
