import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";
import type {
    BehavioralFsmEventMap,
    ClientOf,
    ContextOf,
    FsmEventMap,
    InputNamesOfInstance,
    StateNamesOfInstance,
} from "machina";
import { createBehavioralFsmSnapshotStore, createFsmSnapshotStore } from "./snapshots";
import type {
    BehavioralFsmEventName,
    BehavioralFsmHookResult,
    BehavioralFsmLike,
    BehavioralFsmSnapshot,
    FsmEventName,
    FsmHookResult,
    FsmLike,
    FsmSnapshot,
    UseFsmOptions,
    UseFsmSelectorOptions,
} from "./types";

const objectIs = <T>(a: T, b: T) => Object.is(a, b);

type FsmEventCallback<
    TFsm extends FsmLike,
    TEventName extends FsmEventName<TFsm> | "*",
> = TEventName extends "*"
    ? (eventName: string, data: unknown) => void
    : (payload: FsmEventMap<StateNamesOfInstance<TFsm>>[TEventName & FsmEventName<TFsm>]) => void;

type BehavioralFsmEventCallback<
    TFsm extends BehavioralFsmLike,
    TEventName extends BehavioralFsmEventName<TFsm> | "*",
> = TEventName extends "*"
    ? (eventName: string, data: unknown) => void
    : (
          payload: BehavioralFsmEventMap<ClientOf<TFsm>, StateNamesOfInstance<TFsm>>[TEventName &
              BehavioralFsmEventName<TFsm>]
      ) => void;

export const useFsm = <TFsm extends FsmLike>(
    fsm: TFsm,
    options?: UseFsmOptions
): FsmHookResult<TFsm> => {
    const fsmRef = useRef(fsm);
    fsmRef.current = fsm;

    const store = useMemo(() => createFsmSnapshotStore(fsm, options), [fsm, options?.rerenderOn]);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

    const handleRef = useRef((inputName: InputNamesOfInstance<TFsm>, ...args: unknown[]) => {
        fsmRef.current.handle(inputName, ...args);
    });
    const canHandleRef = useRef((inputName: string) => {
        return fsmRef.current.canHandle(inputName);
    });

    return useMemo(
        () => ({
            ...snapshot,
            handle: handleRef.current,
            canHandle: canHandleRef.current,
        }),
        [snapshot]
    );
};

export const useBehavioralFsm = <TFsm extends BehavioralFsmLike>(
    fsm: TFsm,
    client: ClientOf<TFsm>,
    options?: UseFsmOptions
): BehavioralFsmHookResult<TFsm> => {
    const fsmRef = useRef(fsm);
    const clientRef = useRef(client);
    fsmRef.current = fsm;
    clientRef.current = client;

    const store = useMemo(
        () => createBehavioralFsmSnapshotStore(fsm, client, options),
        [fsm, client, options?.rerenderOn]
    );
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

    const handleRef = useRef((inputName: InputNamesOfInstance<TFsm>, ...args: unknown[]) => {
        fsmRef.current.handle(clientRef.current, inputName, ...args);
    });
    const canHandleRef = useRef((inputName: string) => {
        return fsmRef.current.canHandle(clientRef.current, inputName);
    });

    return useMemo(
        () => ({
            ...snapshot,
            handle: handleRef.current,
            canHandle: canHandleRef.current,
        }),
        [snapshot]
    );
};

export const useFsmSelector = <TFsm extends FsmLike, TSelected>(
    fsm: TFsm,
    selector: (snapshot: FsmSnapshot<StateNamesOfInstance<TFsm>, ContextOf<TFsm>>) => TSelected,
    options?: UseFsmSelectorOptions<TSelected>
): TSelected => {
    const store = useMemo(() => createFsmSnapshotStore(fsm, options), [fsm, options?.rerenderOn]);

    return useSyncExternalStoreWithSelector(
        store.subscribe,
        store.getSnapshot,
        undefined,
        selector,
        options?.isEqual ?? objectIs
    );
};

export const useBehavioralFsmSelector = <TFsm extends BehavioralFsmLike, TSelected>(
    fsm: TFsm,
    client: ClientOf<TFsm>,
    selector: (
        snapshot: BehavioralFsmSnapshot<StateNamesOfInstance<TFsm>, ClientOf<TFsm>>
    ) => TSelected,
    options?: UseFsmSelectorOptions<TSelected>
): TSelected => {
    const store = useMemo(
        () => createBehavioralFsmSnapshotStore(fsm, client, options),
        [fsm, client, options?.rerenderOn]
    );

    return useSyncExternalStoreWithSelector(
        store.subscribe,
        store.getSnapshot,
        undefined,
        selector,
        options?.isEqual ?? objectIs
    );
};

export const useFsmEvent = <TFsm extends FsmLike, TEventName extends FsmEventName<TFsm> | "*">(
    fsm: TFsm,
    eventName: TEventName,
    callback: FsmEventCallback<TFsm, TEventName>
): void => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const subscription =
            eventName === "*"
                ? fsm.on("*", (emittedEventName, data) => {
                      const wildcardCallback = callbackRef.current as (
                          eventName: string,
                          data: unknown
                      ) => void;
                      wildcardCallback(emittedEventName, data);
                  })
                : fsm.on(eventName, payload => {
                      const namedCallback = callbackRef.current as (payload: unknown) => void;
                      namedCallback(payload);
                  });

        return () => {
            subscription.off();
        };
    }, [fsm, eventName]);
};

export const useBehavioralFsmEvent = <
    TFsm extends BehavioralFsmLike,
    TEventName extends BehavioralFsmEventName<TFsm> | "*",
>(
    fsm: TFsm,
    client: ClientOf<TFsm>,
    eventName: TEventName,
    callback: BehavioralFsmEventCallback<TFsm, TEventName>
): void => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const subscription =
            eventName === "*"
                ? fsm.on("*", (emittedEventName, data) => {
                      if (shouldNotifyBehavioralEvent(data, client)) {
                          const wildcardCallback = callbackRef.current as (
                              eventName: string,
                              data: unknown
                          ) => void;
                          wildcardCallback(emittedEventName, data);
                      }
                  })
                : fsm.on(eventName, payload => {
                      if (shouldNotifyBehavioralEvent(payload, client)) {
                          const namedCallback = callbackRef.current as (payload: unknown) => void;
                          namedCallback(payload);
                      }
                  });

        return () => {
            subscription.off();
        };
    }, [fsm, client, eventName]);
};

const shouldNotifyBehavioralEvent = <TClient>(payload: unknown, client: TClient): boolean => {
    if (!payload || typeof payload !== "object" || !("client" in payload)) {
        return true;
    }
    return payload.client === client;
};
