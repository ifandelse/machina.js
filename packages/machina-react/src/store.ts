import type { RerenderOn } from "./types";

const DEFAULT_RERENDER_ON: RerenderOn = "settled";

type Subscription = { off(): void };
type StoreListener = () => void;
type StoreSubscription = (listener: StoreListener) => () => void;
type SnapshotFactory<TSnapshot> = (version: number) => TSnapshot;

export interface ExternalStore<TSnapshot> {
    getSnapshot(): TSnapshot;
    subscribe(listener: StoreListener): () => void;
}

interface StoreConfig<TSnapshot> {
    createSnapshot: SnapshotFactory<TSnapshot>;
    subscribeToEvents: (mode: RerenderOn, notify: StoreListener) => Subscription[];
    rerenderOn?: RerenderOn;
}

export const createMachinaStore = <TSnapshot>({
    createSnapshot,
    subscribeToEvents,
    rerenderOn,
}: StoreConfig<TSnapshot>): ExternalStore<TSnapshot> => {
    const mode = rerenderOn ?? DEFAULT_RERENDER_ON;
    let version = 0;
    let cachedVersion = -1;
    let cachedSnapshot: TSnapshot | undefined;

    const getSnapshot = () => {
        if (cachedVersion !== version || cachedSnapshot === undefined) {
            cachedSnapshot = createSnapshot(version);
            cachedVersion = version;
        }
        return cachedSnapshot;
    };

    const subscribe: StoreSubscription = listener => {
        let active = true;
        let microtaskQueued = false;

        const notifyNow = () => {
            if (!active) {
                return;
            }
            version++;
            listener();
        };

        const notifySettled = () => {
            if (microtaskQueued) {
                return;
            }
            microtaskQueued = true;
            queueMicrotask(() => {
                microtaskQueued = false;
                notifyNow();
            });
        };

        const subscriptions = subscribeToEvents(
            mode,
            mode === "settled" ? notifySettled : notifyNow
        );

        return () => {
            active = false;
            for (const subscription of subscriptions) {
                subscription.off();
            }
        };
    };

    return { getSnapshot, subscribe };
};

export const eventNamesForMode = (mode: RerenderOn): Array<"handled" | "transitioned"> => {
    if (mode === "transitioned") {
        return ["transitioned"];
    }
    if (mode === "handled") {
        return ["handled"];
    }
    return ["handled", "transitioned"];
};
