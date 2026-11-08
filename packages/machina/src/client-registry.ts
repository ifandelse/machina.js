// =============================================================================
// client-registry.ts — Per-client bookkeeping for one BehavioralFsm
//
// The engine tracks each client's record (state + deferred queue) in a
// WeakMap so a collected client releases its record. The relay and dispose()
// also need to enumerate live clients, which a WeakMap cannot do, so a Set
// of WeakRefs runs alongside it. This module keeps the two collections in
// step so no caller has to remember to update both.
//
// =============================================================================

import type { ClientMeta } from "./types";

/**
 * Stores one client record per client and answers two questions for the
 * engine and the mount table: "what state is this client in" and "which
 * clients are still alive".
 *
 * Reads never create a record. Only `set()` writes, and it adds the weak
 * reference the first time it sees a client, so repeated writes for one
 * client leave exactly one reference in the live set.
 *
 * @typeParam TClient - The client object type (a WeakMap key, so an object).
 * @typeParam TStateNames - The state name union stored on each record.
 */
export class ClientRegistry<TClient extends object, TStateNames extends string> {
    private readonly records = new WeakMap<TClient, ClientMeta<TStateNames>>();
    private readonly liveRefs = new Set<WeakRef<TClient>>();

    /** The client's record, or `undefined` for a client never written. */
    get(client: TClient): ClientMeta<TStateNames> | undefined {
        return this.records.get(client);
    }

    has(client: TClient): boolean {
        return this.records.has(client);
    }

    /** The client's current state, or `undefined` for a client never written. */
    stateOf(client: TClient): TStateNames | undefined {
        return this.records.get(client)?.state;
    }

    /**
     * Write the client's record. A client seen for the first time also joins
     * the live set; a client already present keeps its single reference.
     */
    set(client: TClient, record: ClientMeta<TStateNames>): void {
        if (!this.records.has(client)) {
            this.liveRefs.add(new WeakRef(client));
        }
        this.records.set(client, record);
    }

    /**
     * Every client that is still reachable, in first-seen order. A reference
     * whose client was collected is removed from the live set as the
     * iteration passes it, so the set does not grow with dead entries.
     */
    *liveClients(): IterableIterator<TClient> {
        for (const ref of this.liveRefs) {
            const client = ref.deref();
            if (!client) {
                this.liveRefs.delete(ref);
                continue;
            }
            yield client;
        }
    }
}
