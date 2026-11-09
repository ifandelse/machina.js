/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// mount-table.ts — Everything the engine knows about `_child`
//
// A "mount" is a state that declares `_child`. The table is built once per
// BehavioralFsm from the config's states object. It installs a ChildLink
// adapter at every mount, groups mounts by the child instance they share,
// and answers the engine's four child-aware questions (delegate, canHandle,
// resetAt, pathAt). The engine itself never reads `_child`.
//
// See CONTEXT.md ("Hierarchy") for the vocabulary and docs/adr/0001 for why
// the adapter is written back into `states[name]._child` in place.
// =============================================================================

import {
    MACHINA_TYPE,
    type BehavioralFsmEventMap,
    type ChildLink,
    type ChildListener,
    type ClientSnapshot,
    type MachinaInstance,
} from "./types";

// The seven built-in event names, as a runtime set. Both relays key on it:
// the child-event routing reads `payload.client` as the parent's client only
// for these names, and the Fsm wrapper strips `client` from these payloads
// only. A custom payload is opaque, so a `client` key inside one is the
// user's data (#183). Typed as a Record so adding an event to
// BehavioralFsmEventMap without listing it here is a compile error.
const BUILT_IN_EVENT_FLAGS: Record<keyof BehavioralFsmEventMap<object>, true> = {
    transitioning: true,
    transitioned: true,
    handling: true,
    handled: true,
    nohandler: true,
    invalidstate: true,
    deferred: true,
};
export const BUILT_IN_EVENT_NAMES: ReadonlySet<string> = new Set(Object.keys(BUILT_IN_EVENT_FLAGS));

/** One distinct child and every state name that mounts it. */
export interface ChildMounts {
    childLink: ChildLink;
    stateNames: string[];
}

export class MountTable<TClient extends object> {
    // State name → the adapter installed at that mount. Populated by the
    // install walk; the same adapter object is what `states[name]._child`
    // now holds, so tooling and the table read the same thing.
    private readonly byState = new Map<string, ChildLink>();
    // Keyed by the raw child instance, not the adapter: the install walk
    // mints one adapter per mount, so a child shared by two states has two
    // adapters and one entry here. Everything that must happen once per
    // child (subscribe, dispose, snapshot) iterates this map.
    private readonly byChild = new Map<MachinaInstance, ChildMounts>();

    constructor(states: Record<string, Record<string, unknown>>) {
        for (const stateName of Object.keys(states)) {
            const stateObj = states[stateName];
            const rawChild = stateObj?._child;
            if (!rawChild) {
                continue;
            }
            // One check covers the three failure shapes the engine used to
            // test separately (primitive, plain object, unknown MACHINA_TYPE).
            // The message keeps the state name so a misconfigured mount is
            // findable from the stack trace alone.
            if (typeof rawChild !== "object" || !(MACHINA_TYPE in rawChild)) {
                const got = typeof rawChild === "object" ? "a plain object" : String(rawChild);
                throw new Error(
                    `State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, got ${got}`
                );
            }
            const childLink = createChildLink(rawChild, stateName);
            stateObj._child = childLink;
            this.byState.set(stateName, childLink);

            const group = this.byChild.get(childLink.instance);
            if (group) {
                group.stateNames.push(stateName);
            } else {
                this.byChild.set(childLink.instance, { childLink, stateNames: [stateName] });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Lookups
    // -------------------------------------------------------------------------

    /** The adapter mounted at `stateName`, or `undefined` when the state has no `_child`. */
    mountAt(stateName: string): ChildLink | undefined {
        return this.byState.get(stateName);
    }

    /**
     * Every distinct child with the state names that mount it, in the order
     * the install walk first met each child. Persistence groups on this so a
     * shared child is snapshotted once, not once per mount.
     */
    mountsByChild(): ChildMounts[] {
        return [...this.byChild.values()];
    }

    // -------------------------------------------------------------------------
    // Outbound: the engine's four child-aware questions
    // -------------------------------------------------------------------------

    /**
     * Forward `inputName` to the child mounted at `stateName` when that child
     * can handle it. Returns `true` when the input was forwarded and `false`
     * when the caller should handle it locally (no mount, or the child
     * declines).
     */
    delegate(client: TClient, stateName: string, inputName: string, args: unknown[]): boolean {
        const mount = this.byState.get(stateName);
        if (!mount || !mount.canHandle(client, inputName)) {
            return false;
        }
        mount.handle(client, inputName, ...args);
        return true;
    }

    /**
     * Whether the child chain under `stateName` can handle `inputName`. The
     * adapter recurses, so the answer matches the depth `delegate` reaches.
     */
    canHandle(client: TClient, stateName: string, inputName: string): boolean {
        const mount = this.byState.get(stateName);
        return mount ? mount.canHandle(client, inputName) : false;
    }

    /** Reset the child mounted at `stateName` to its initial state. No-op without a mount. */
    resetAt(client: TClient, stateName: string): void {
        this.byState.get(stateName)?.reset(client);
    }

    /**
     * The child's composite path under `stateName` for `client`, or `""` when
     * there is no mount or the child has nothing to report. The engine
     * prefixes the parent state name.
     */
    pathAt(client: TClient, stateName: string): string {
        const mount = this.byState.get(stateName);
        return mount ? mount.compositeState(client) : "";
    }
}

// -----------------------------------------------------------------------------
// createChildLink — adapter factory
//
// Wraps either an Fsm or BehavioralFsm child and presents a uniform interface
// for the table to call. The MACHINA_TYPE discriminant tells us which call
// shape to use. The install walk has already checked that `child` is an
// object carrying MACHINA_TYPE; this only rejects an unknown discriminant.
// -----------------------------------------------------------------------------

const createChildLink = (child: any, stateName: string): ChildLink => {
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
            subscribe(listener: ChildListener): { off(): void } {
                return child.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "nohandler") {
                        const payload = data as {
                            inputName: string;
                            args?: unknown[];
                            client?: object;
                        };
                        listener.onUnhandled(payload.inputName, payload.args ?? [], payload.client);
                        return;
                    }
                    // The engine puts `client` in every built-in payload. A
                    // custom payload is the user's data, so a `client` key
                    // inside one means nothing to the parent (#183).
                    const client = BUILT_IN_EVENT_NAMES.has(eventName)
                        ? (data as { client?: object } | undefined)?.client
                        : undefined;
                    listener.onEvent(eventName, data, client);
                });
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
            subscribe(listener: ChildListener): { off(): void } {
                // An Fsm has one context and no clients. Its relay already
                // strips `client` from built-in payloads, so the parent must
                // decide which of its own clients the event applies to.
                return child.on("*", (eventName: string, data: unknown) => {
                    if (eventName === "nohandler") {
                        const payload = data as { inputName: string; args?: unknown[] };
                        listener.onUnhandled(payload.inputName, payload.args ?? [], undefined);
                        return;
                    }
                    listener.onEvent(eventName, data, undefined);
                });
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
        `State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, ` +
            `got [MACHINA_TYPE] = ${String(childType ?? "undefined")}`
    );
};
