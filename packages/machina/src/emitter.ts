// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;
type WildcardListener = (eventName: string, data: unknown) => void;

/**
 * Returned by `on()`. Call `off()` to remove the subscription.
 * Safe to call multiple times — subsequent calls are no-ops because
 * the underlying Set deduplicates membership.
 */
export type Subscription = { off(): void };

/**
 * Minimal typed event emitter used internally by Fsm and BehavioralFsm.
 *
 * Two listener categories exist at runtime: named listeners (keyed by event
 * name) and wildcard listeners (keyed as `"*"`). The wildcard fires on EVERY
 * emit, regardless of event name, and its callback receives both the event
 * name and the data. Named listeners receive only the data.
 *
 * @typeParam TEventMap - Record mapping event names to their payload types.
 *   Constrains `on()` and `emit()` to matching event/payload pairs.
 */
export class Emitter<TEventMap extends Record<string, unknown>> {
    private listeners = new Map<string, Set<Listener>>();

    /**
     * Subscribe to a named event or the wildcard.
     *
     * Named overload: callback receives only the typed payload.
     * Wildcard overload (`"*"`): callback receives `(eventName, data)` — useful
     * for proxying all events to another emitter, as Fsm does with its bfsm.
     *
     * Wildcard listeners fire BEFORE named listeners. If a wildcard listener
     * removes a named listener via `off()`, the named listener still fires for
     * the current emit — Set iteration is not affected by concurrent deletes.
     *
     * Returns a `Subscription` whose `off()` removes this specific listener.
     */
    on<K extends keyof TEventMap & string>(
        event: K,
        cb: (data: TEventMap[K]) => void
    ): Subscription;
    on(event: "*", cb: WildcardListener): Subscription;
    on(event: string, cb: Listener): Subscription {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(cb);
        return {
            off: () => {
                set.delete(cb);
            },
        };
    }

    /**
     * Emit a named event, notifying wildcard listeners first, then named listeners.
     *
     * Wildcard listeners receive `(eventName, data)`; named listeners receive
     * only `data`. The firing order (wildcards before named) is intentional —
     * it lets relay listeners (like Fsm's bfsm proxy) observe all events
     * before specific subscribers react.
     */
    emit<K extends keyof TEventMap & string>(event: K, data: TEventMap[K]): void {
        const wildcards = this.listeners.get("*");
        if (wildcards) {
            for (const cb of wildcards) {
                (cb as WildcardListener)(event, data);
            }
        }
        const named = this.listeners.get(event);
        if (named) {
            for (const cb of named) {
                cb(data);
            }
        }
    }

    /**
     * Remove all listeners (named and wildcard).
     *
     * Existing `Subscription` objects remain valid — their `off()` closures
     * hold a reference to the now-empty Set, so calling them is harmless.
     * Called by `dispose()` to prevent memory retention after an FSM shuts down.
     */
    clear(): void {
        this.listeners.clear();
    }
}
