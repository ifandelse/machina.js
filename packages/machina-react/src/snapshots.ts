import type {
    BehavioralFsmEventMap,
    ClientOf,
    ContextOf,
    FsmEventMap,
    StateNamesOfInstance,
} from "machina";
import { createMachinaStore, eventNamesForMode, type ExternalStore } from "./store";
import type {
    BehavioralFsmLike,
    BehavioralFsmSnapshot,
    FsmLike,
    FsmSnapshot,
    RerenderOn,
    UseFsmOptions,
} from "./types";

const isClientPayload = <TClient>(
    payload: unknown,
    client: TClient
): payload is { client: TClient } => {
    return (
        !!payload && typeof payload === "object" && "client" in payload && payload.client === client
    );
};

export const createFsmSnapshotStore = <TFsm extends FsmLike>(
    fsm: TFsm,
    options?: UseFsmOptions
): ExternalStore<FsmSnapshot<StateNamesOfInstance<TFsm>, ContextOf<TFsm>>> => {
    return createMachinaStore({
        rerenderOn: options?.rerenderOn,
        createSnapshot(version) {
            return {
                state: fsm.currentState() as StateNamesOfInstance<TFsm>,
                compositeState: fsm.compositeState(),
                context: fsm.context as ContextOf<TFsm>,
                version,
            };
        },
        subscribeToEvents(mode: RerenderOn, notify) {
            return eventNamesForMode(mode).map(eventName => {
                return fsm.on(
                    eventName as keyof FsmEventMap<StateNamesOfInstance<TFsm>> & string,
                    notify
                );
            });
        },
    });
};

export const createBehavioralFsmSnapshotStore = <TFsm extends BehavioralFsmLike>(
    fsm: TFsm,
    client: ClientOf<TFsm>,
    options?: UseFsmOptions
): ExternalStore<BehavioralFsmSnapshot<StateNamesOfInstance<TFsm>, ClientOf<TFsm>>> => {
    return createMachinaStore({
        rerenderOn: options?.rerenderOn,
        createSnapshot(version) {
            return {
                state: fsm.currentState(client) as StateNamesOfInstance<TFsm> | undefined,
                compositeState: fsm.compositeState(client),
                client,
                version,
            };
        },
        subscribeToEvents(mode: RerenderOn, notify) {
            return eventNamesForMode(mode).map(eventName => {
                return fsm.on(
                    eventName as keyof BehavioralFsmEventMap<
                        ClientOf<TFsm>,
                        StateNamesOfInstance<TFsm>
                    > &
                        string,
                    payload => {
                        if (isClientPayload(payload, client)) {
                            notify();
                        }
                    }
                );
            });
        },
    });
};
