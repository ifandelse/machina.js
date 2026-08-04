import type {
    BehavioralFsmEventMap,
    ClientOf,
    ContextOf,
    FsmEventMap,
    InputNamesOfInstance,
    StateNamesOfInstance,
} from "machina";

export type RerenderOn = "settled" | "transitioned" | "handled" | "all";

export interface UseFsmOptions {
    rerenderOn?: RerenderOn;
}

export interface UseFsmSelectorOptions<TSelected> extends UseFsmOptions {
    isEqual?: (a: TSelected, b: TSelected) => boolean;
}

export interface FsmSnapshot<TState extends string, TContext> {
    state: TState;
    compositeState: string;
    context: TContext;
    version: number;
}

export interface BehavioralFsmSnapshot<TState extends string, TClient> {
    state: TState | undefined;
    compositeState: string;
    client: TClient;
    version: number;
}

export interface FsmLike {
    readonly context: object;
    currentState(): string;
    compositeState(): string;
    handle(inputName: string, ...args: unknown[]): void;
    canHandle(inputName: string): boolean;
    on(
        eventName: "handled" | "transitioned",
        callback: (payload: unknown) => void
    ): { off(): void };
    on(eventName: "*", callback: (eventName: string, data: unknown) => void): { off(): void };
    on(eventName: string, callback: (payload: unknown) => void): { off(): void };
}

export interface BehavioralFsmLike {
    currentState(client: object): string | undefined;
    compositeState(client: object): string;
    handle(client: object, inputName: string, ...args: unknown[]): void;
    canHandle(client: object, inputName: string): boolean;
    on(
        eventName: "handled" | "transitioned",
        callback: (payload: unknown) => void
    ): { off(): void };
    on(eventName: "*", callback: (eventName: string, data: unknown) => void): { off(): void };
    on(eventName: string, callback: (payload: unknown) => void): { off(): void };
}

export type FsmHookResult<TFsm extends FsmLike> = FsmSnapshot<
    StateNamesOfInstance<TFsm>,
    ContextOf<TFsm>
> & {
    handle(inputName: InputNamesOfInstance<TFsm>, ...args: unknown[]): void;
    canHandle(inputName: string): boolean;
};

export type BehavioralFsmHookResult<TFsm extends BehavioralFsmLike> = BehavioralFsmSnapshot<
    StateNamesOfInstance<TFsm>,
    ClientOf<TFsm>
> & {
    handle(inputName: InputNamesOfInstance<TFsm>, ...args: unknown[]): void;
    canHandle(inputName: string): boolean;
};

export type FsmEventName<TFsm extends FsmLike> = keyof FsmEventMap<StateNamesOfInstance<TFsm>> &
    string;

export type BehavioralFsmEventName<TFsm extends BehavioralFsmLike> = keyof BehavioralFsmEventMap<
    ClientOf<TFsm>,
    StateNamesOfInstance<TFsm>
> &
    string;
