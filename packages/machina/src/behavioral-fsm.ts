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
import { cloneDeep, cloneJsonSafe, NonSerializableValueError } from "./json-safe";
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
    type ClientSnapshot,
    type MachinaInstance,
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
    // Public so inspection tooling (machina-inspect) can read the state graph
    // without private field access. The states object is mutated by wrapChildLinks()
    // at construction time — _child values become ChildLink wrappers in-place.
    readonly states: Record<string, Record<string, unknown>>;
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

        // Object.hasOwn (not `in`) — `in` walks the prototype chain, so
        // toState: "__proto__" (or "constructor", "toString", ...) would pass
        // this check via the inherited Object.prototype member even though no
        // state literally named that was ever declared. Same fix as
        // planSnapshotWrites() got in #184, applied here for parity.
        if (!Object.hasOwn(this.states, toState)) {
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
     * Silently place `client` at `compositeState` with no lifecycle activity —
     * no `_onEnter`, no `_onExit`, no `transitioning`/`transitioned` events.
     * Designed to work with `compositeState()`, which produces the dot-path
     * string that the string form consumes.
     *
     * The snapshot form (pass a `ClientSnapshot` from `dehydrate()`) additionally
     * requeues each level's pending deferred inputs, so a client resumes with the
     * same replay-on-next-transition behavior it had when dehydrated. Both forms
     * validate the ENTIRE hierarchy before writing anything — a throw at any level
     * leaves every level, including this one, unwritten.
     *
     * Throws synchronously for unknown state names, missing `_child` at an inner
     * level, or Fsm children in the hierarchy (Fsm owns its own context; nothing
     * per-client to rehydrate there).
     *
     * No-ops silently when disposed.
     */
    rehydrate(client: TClient, compositeState: string): void;
    rehydrate(client: TClient, snapshot: ClientSnapshot): void;
    rehydrate(client: TClient, input: string | ClientSnapshot): void {
        if (this.disposed) {
            return;
        }

        if (typeof input === "string") {
            this.rehydrateCompositePath(client, input);
            return;
        }

        // Object form: collect write thunks for the WHOLE tree first (this level
        // AND every descendant), then run them only once nothing has thrown.
        // The string-form's children-first recursion gets atomicity "for free"
        // because each level writes only after its child already succeeded — but
        // that couples validation to writing. Here we need every level validated
        // before ANY level writes, since a leaf failing three levels down must
        // not leave levels above it holding a stale write.
        const writes = this.planSnapshotWrites(client, input);
        for (const write of writes) {
            write();
        }
    }

    /**
     * Snapshot everything machina tracks for `client`: current state, pending
     * deferred inputs, and — recursively — the same for every `_child` that has
     * ever seen this client, active or not. Feed the result to the object form
     * of `rehydrate()` to restore it later, deferrals included.
     *
     * Returns `undefined` for a client this FSM has never seen (mirrors
     * `currentState()`) — the call does NOT trigger initialization.
     *
     * Throws if any deferred input's args contain a non-serializable value
     * (function, undefined, symbol, bigint, non-finite number, Date/Map/class
     * instance, or a circular reference) — naming the input, its `until` target
     * if any, the FSM id, and the exact value path. Throws for an Fsm child
     * that's on `client`'s active path *relative to the true root* (consistent
     * with `rehydrate()`'s conditional throw) — an Fsm owns its own context, so
     * there's nothing per-client to snapshot. An Fsm child declared at a state
     * `client` never visited, OR nested under a `BehavioralFsm` child that is
     * itself off-path from the root, is skipped rather than throwing — neither
     * has any per-client state to lose, so one Fsm child anywhere in the
     * hierarchy doesn't disable `dehydrate()` for clients that never reach that
     * branch, no matter how deeply nested the Fsm child is.
     *
     * Meant for clients at rest between `handle()` calls — `currentActionArgs`
     * (the in-flight args mid-handler) has no meaning here and is excluded.
     *
     * @param isOnActivePath - @internal Whether this FSM itself is currently
     * reachable from the true root's active path. Defaults to `true` for the
     * public entry point (this FSM IS the root from its own perspective); the
     * `ChildLink` adapter passes `false` down when recursing into a nested
     * `BehavioralFsm` child that is itself off-path, so that child's own
     * Fsm-child checks don't recompute reachability from its dormant local
     * state alone.
     */
    dehydrate(client: TClient, isOnActivePath = true): ClientSnapshot | undefined {
        const meta = this.clients.get(client);
        if (!meta) {
            return undefined;
        }

        const snapshot: ClientSnapshot = {
            state: meta.state,
            deferred: meta.deferredQueue.map(item => this.snapshotDeferredInput(item)),
        };

        const children = this.collectChildSnapshots(client, meta.state, isOnActivePath);
        if (children) {
            snapshot.children = children;
        }

        return snapshot;
    }

    /**
     * @internal
     * Validates `snapshot` against this level's state graph and recurses into
     * every declared child, returning write thunks to run only once the WHOLE
     * tree — every level — validates successfully. Nothing is written here.
     * Called by the object-form of `rehydrate()` and, recursively, by ChildLink
     * so a nested BehavioralFsm participates in the same validate-then-write
     * pass. Not part of the public persistence API — call `rehydrate()` instead.
     */
    planSnapshotWrites(client: TClient, snapshot: ClientSnapshot): Array<() => void> {
        if (this.disposed) {
            // Mirrors the string form: a disposed FSM mid-hierarchy silently
            // contributes no writes rather than blocking the rest of the tree.
            return [];
        }

        const { state, deferred, children } = snapshot;

        // Object.hasOwn (not `in`) — `in` walks the prototype chain, so a
        // snapshot with state: "__proto__" (or "constructor", "toString", ...)
        // would pass validation via the inherited Object.prototype member even
        // though no state literally named that was ever declared.
        if (!Object.hasOwn(this.states, state)) {
            throw new Error(
                `rehydrate: unknown state "${state}" in FSM "${this.id}". ` +
                    `Valid states: ${Object.keys(this.states).join(", ")}`
            );
        }

        const writes: Array<() => void> = [];

        if (children) {
            for (const stateName of Object.keys(children)) {
                if (!Object.hasOwn(this.states, stateName)) {
                    throw new Error(
                        `rehydrate: unknown state "${stateName}" in FSM "${this.id}" ` +
                            `referenced by snapshot.children.`
                    );
                }

                const childLink = this.states[stateName]?._child as ChildLink | undefined;
                if (!childLink) {
                    throw new Error(
                        `rehydrate: state "${stateName}" in FSM "${this.id}" has no _child, ` +
                            `but the snapshot has a children["${stateName}"] entry.`
                    );
                }

                writes.push(...childLink.planRehydrate(client, children[stateName]));
            }
        }

        // Deep-clone args so the caller's snapshot object isn't aliased into live
        // FSM state — a shallow spread only protects the array itself, not any
        // nested objects/arrays inside it. cloneDeep() is validation-free (unlike
        // dehydrate()'s cloneJsonSafe): rehydrate() trusts the snapshot is already
        // valid data rather than re-validating on the way in.
        const deferredQueue: DeferredInput[] = deferred.map(item => ({
            inputName: item.inputName,
            args: cloneDeep(item.args) as unknown[],
            ...(item.untilState !== undefined ? { untilState: item.untilState } : {}),
        }));

        writes.push(() => {
            // Guard knownClients before writing meta — if the client is already
            // tracked, skip adding another WeakRef to avoid accumulating duplicates.
            if (!this.clients.has(client)) {
                this.knownClients.add(new WeakRef(client));
            }
            this.clients.set(client, { state: state as TStateNames, deferredQueue });
        });

        return writes;
    }

    private rehydrateCompositePath(client: TClient, compositeState: string): void {
        const [state, ...rest] = compositeState.split(".");

        // Object.hasOwn (not `in`) — same rationale as transition()'s check above.
        if (!Object.hasOwn(this.states, state)) {
            throw new Error(
                `rehydrate: unknown state "${state}" in FSM "${this.id}". ` +
                    `Valid states: ${Object.keys(this.states).join(", ")}`
            );
        }

        // Validate and delegate to children BEFORE writing to the parent WeakMap.
        // This ensures a throw mid-hierarchy doesn't leave a half-registered client.
        if (rest.length > 0) {
            const childPath = rest.join(".");
            const stateObj = this.states[state];
            const childLink = stateObj?._child as ChildLink | undefined;

            if (!childLink) {
                throw new Error(
                    `rehydrate: state "${state}" in FSM "${this.id}" has no _child, ` +
                        `but composite path "${compositeState}" requires one.`
                );
            }

            childLink.rehydrate(client, childPath);
        }

        // Guard knownClients before writing meta — if the client is already tracked,
        // skip adding another WeakRef to avoid accumulating duplicate live refs.
        if (!this.clients.has(client)) {
            this.knownClients.add(new WeakRef(client));
        }
        this.clients.set(client, { state: state as TStateNames, deferredQueue: [] });
    }

    /**
     * Walks every declared state's `_child`, dehydrating each one that has ever
     * seen `client`. The same child instance can be declared under multiple
     * state names (shared child) — it's dehydrated once and the result is
     * reused under every declaring state name, matching how the engine already
     * treats shared children elsewhere (dispose, event subscriptions).
     *
     * Declaring names are grouped by `childLink.instance` (the actual FSM
     * instance, not the `ChildLink` wrapper — `wrapChildLinks()` mints a fresh
     * wrapper per declaring state, so grouping by wrapper would never hit for a
     * shared child) BEFORE any `onPath` is computed or any child is dehydrated.
     * A shared child's `onPath` is the OR of `stateName === activeState` across
     * every declaring name in its group: at most one declaring name can ever
     * equal `activeState`, so this combined flag is correct and, critically,
     * independent of `Object.keys(this.states)` iteration order — computing
     * `onPath` per-declaring-name and caching whichever one happened to run
     * first would silently launder an on-path client's Fsm-child throw through
     * an unrelated off-path declaring name.
     *
     * An off-path Fsm child (declared only at states other than `activeState`,
     * OR nested anywhere under a `BehavioralFsm` child that is itself off-path
     * relative to the true root) is skipped entirely rather than dehydrated:
     * Fsm state isn't tracked per-client to begin with, so an off-path Fsm
     * child has nothing to lose by being skipped — unlike a BehavioralFsm
     * child's off-path meta, which is real per-client data. `isOnActivePath`
     * is the inherited "am I even reachable from the root" flag; combining it
     * with the group's `stateNames.includes(activeState)` check (rather than
     * using that check alone) is what keeps a nested Fsm grandchild from
     * throwing when its immediate BehavioralFsm parent is itself off-path —
     * the parent's own dormant `activeState` is irrelevant once the parent
     * isn't reachable. This keeps one Fsm child anywhere in the hierarchy from
     * disabling `dehydrate()` for every client, only for clients actually on
     * that branch.
     */
    private collectChildSnapshots(
        client: TClient,
        activeState: string,
        isOnActivePath: boolean
    ): Record<string, ClientSnapshot> | undefined {
        // Pass 1: group every declaring state name by the child instance it
        // resolves to, so a shared child's combined onPath can be computed
        // before dehydrate() is ever called for it.
        const declaringNamesByInstance = new Map<
            MachinaInstance,
            { childLink: ChildLink; stateNames: string[] }
        >();

        for (const stateName of Object.keys(this.states)) {
            const childLink = this.states[stateName]?._child as ChildLink | undefined;
            if (!childLink) {
                continue;
            }

            const entry = declaringNamesByInstance.get(childLink.instance);
            if (entry) {
                entry.stateNames.push(stateName);
            } else {
                declaringNamesByInstance.set(childLink.instance, {
                    childLink,
                    stateNames: [stateName],
                });
            }
        }

        // Pass 2: dehydrate each unique instance exactly once, using the
        // combined onPath, then fan the result out to every declaring name.
        let children: Record<string, ClientSnapshot> | undefined;

        for (const { childLink, stateNames } of declaringNamesByInstance.values()) {
            const onPath = isOnActivePath && stateNames.includes(activeState);
            const isOffPathFsmChild = childLink.instance[MACHINA_TYPE] === "Fsm" && !onPath;
            if (isOffPathFsmChild) {
                continue;
            }

            // Throws for an Fsm child that IS on the active path — propagates
            // straight through, consistent with rehydrate()'s Fsm-child throw.
            // `onPath` is passed down so a nested BehavioralFsm child applies
            // the same root-relative reachability to its own Fsm children.
            const childSnapshot = childLink.dehydrate(client, onPath);
            if (childSnapshot) {
                children ??= {};
                for (const stateName of stateNames) {
                    children[stateName] = childSnapshot;
                }
            }
        }

        return children;
    }

    private snapshotDeferredInput(item: DeferredInput): DeferredInput {
        let clonedArgs: unknown[];
        try {
            clonedArgs = cloneJsonSafe(item.args, "args") as unknown[];
        } catch (err) {
            if (!(err instanceof NonSerializableValueError)) {
                throw err;
            }
            const untilPart = item.untilState ? ` (until "${item.untilState}")` : "";
            throw new Error(
                `dehydrate: deferred input "${item.inputName}"${untilPart} in FSM "${this.id}" ` +
                    `has a non-serializable value at ${err.path} (${err.label})`
            );
        }

        const snapshot: DeferredInput = { inputName: item.inputName, args: clonedArgs };
        if (item.untilState !== undefined) {
            snapshot.untilState = item.untilState;
        }
        return snapshot;
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
        // Dedup keys on the underlying instance, not the ChildLink wrapper —
        // wrapChildLinks() mints a fresh wrapper per declaring state, so a
        // wrapper-keyed Set never matches for a shared child (the same
        // identity bug setupChildSubscriptions() and collectChildSnapshots()
        // had). Double-dispose was harmless (dispose() is idempotent), but
        // one dedup idiom everywhere beats a latent inconsistency.
        if (!options?.preserveChildren) {
            const seen = new Set<MachinaInstance>();
            for (const stateName of Object.keys(this.states)) {
                const childLink = this.states[stateName]?._child as ChildLink | undefined;
                if (childLink && !seen.has(childLink.instance)) {
                    seen.add(childLink.instance);
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
     * stored for cleanup in dispose(). We deduplicate by `childLink.instance`
     * (the underlying Fsm/BehavioralFsm instance), not the `ChildLink` wrapper —
     * `wrapChildLinks()` mints a fresh wrapper per declaring state, so a child
     * shared across states would otherwise get one subscription PER declaring
     * state, each independently walking known clients and relaying events. That
     * silently double-fires client-less relays (Fsm-child events, or a
     * BehavioralFsm child's custom `emit()` with no `client` in the payload)
     * whenever two different clients are active on two different declaring
     * names at once — the same wrapper-vs-instance identity bug
     * `collectChildSnapshots()` had before its #184 fix.
     */
    private setupChildSubscriptions(): void {
        const seenInstances = new Set<MachinaInstance>();

        for (const stateName of Object.keys(this.states)) {
            const stateObj = this.states[stateName];
            const childLink = stateObj?._child as ChildLink | undefined;

            if (!childLink || seenInstances.has(childLink.instance)) {
                continue;
            }
            seenInstances.add(childLink.instance);

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
     * _child resolves to the same underlying instance as childLink. Returns
     * false if the client has no meta (never initialized) or is in a state
     * with a different (or no) child.
     *
     * Compares `.instance`, not the `ChildLink` wrapper itself — setupChildSubscriptions()
     * dedupes subscriptions by instance and keeps only ONE representative wrapper
     * per shared child, so the client's actual active declaring state may hold a
     * DIFFERENT wrapper for that same instance (wrapChildLinks() mints one per
     * declaring state). Comparing wrappers directly would only ever match the one
     * declaring state whose wrapper happened to be kept for the subscription,
     * silently breaking relay for every other declaring name of a shared child.
     */
    private isChildActiveForClient(client: TClient, childLink: ChildLink): boolean {
        const meta = this.clients.get(client);
        if (!meta) {
            return false;
        }
        const parentStateObj = this.states[meta.state];
        const activeChildLink = parentStateObj?._child as ChildLink | undefined;
        return activeChildLink?.instance === childLink.instance;
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
            instance: child,
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
            rehydrate(client: object, compositeState: string): void {
                child.rehydrate(client, compositeState);
            },
            dehydrate(client: object, isOnActivePath: boolean): ClientSnapshot | undefined {
                return child.dehydrate(client, isOnActivePath);
            },
            planRehydrate(client: object, snapshot: ClientSnapshot): Array<() => void> {
                return child.planSnapshotWrites(client, snapshot);
            },
            dispose(): void {
                child.dispose();
            },
        };
    }

    if (childType === "Fsm") {
        return {
            instance: child,
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
            rehydrate(_client: object, _compositeState: string): void {
                // Fsm owns its context internally — there is no per-client state to restore.
                // Rehydrating into a BehavioralFsm hierarchy that has Fsm children is a
                // structural mismatch; throw immediately so the caller gets a clear signal.
                throw new Error(
                    `rehydrate: cannot rehydrate an Fsm child. Fsm owns its own context; ` +
                        `rehydrate is only valid for BehavioralFsm hierarchies.`
                );
            },
            dehydrate(_client: object, _isOnActivePath: boolean): ClientSnapshot | undefined {
                // Fsm owns a single global context shared across every client of the
                // parent BehavioralFsm — there's no per-client slice of it to snapshot.
                // collectChildSnapshots() only reaches this call when onPath is true
                // (it skips the call entirely otherwise), so this always throws.
                throw new Error(
                    `dehydrate: cannot dehydrate an Fsm child. Fsm owns its own context; ` +
                        `dehydrate is only valid for BehavioralFsm hierarchies.`
                );
            },
            planRehydrate(_client: object, _snapshot: ClientSnapshot): Array<() => void> {
                throw new Error(
                    `rehydrate: cannot rehydrate an Fsm child. Fsm owns its own context; ` +
                        `rehydrate is only valid for BehavioralFsm hierarchies.`
                );
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
