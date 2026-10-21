import type {
    BehavioralFsmEventMap,
    ClientOf,
    ContextOf,
    EventMapOfInstance,
    FsmEventMap,
    InputCall,
    InputMapLike,
    InputMapOfInstance,
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

/**
 * The full argument list for a hook result's `handle`: core's `InputCall`,
 * derived from the instance, so a typed FSM's payload enforcement survives
 * the hook boundary (machina #195). The split conditional exists because
 * `InputCall` bounds its map parameter with `InputMapLike`, and a deferred
 * `InputMapOfInstance<TFsm>` cannot prove that bound while `TFsm` is still an
 * unresolved type parameter. Inferring the map first and re-checking the
 * bound defers the proof to each call site, where `TFsm` is concrete. An
 * untyped FSM resolves to the wide map, which keeps its calls as loose as
 * core's own `handle`.
 */
type HandleCall<TFsm> =
    InputMapOfInstance<TFsm> extends infer TInputs
        ? TInputs extends InputMapLike<TInputs>
            ? InputCall<InputNamesOfInstance<TFsm> & string, TInputs>
            : [inputName: InputNamesOfInstance<TFsm>, ...args: unknown[]]
        : never;

export type FsmHookResult<TFsm extends FsmLike> = FsmSnapshot<
    StateNamesOfInstance<TFsm>,
    ContextOf<TFsm>
> & {
    handle(...call: HandleCall<TFsm>): void;
    canHandle(inputName: string): boolean;
};

export type BehavioralFsmHookResult<TFsm extends BehavioralFsmLike> = BehavioralFsmSnapshot<
    StateNamesOfInstance<TFsm>,
    ClientOf<TFsm>
> & {
    handle(...call: HandleCall<TFsm>): void;
    canHandle(inputName: string): boolean;
};

/**
 * Every event an instance can deliver, keyed by name: the built-in map plus
 * the instance's declared event map (machina #183). An FSM without an event
 * map contributes the wide map, so every custom name is present with an
 * `unknown` payload.
 */
export type FsmEventMapOf<TFsm extends FsmLike> = FsmEventMap<StateNamesOfInstance<TFsm>> &
    EventMapOfInstance<TFsm>;

export type BehavioralFsmEventMapOf<TFsm extends BehavioralFsmLike> = BehavioralFsmEventMap<
    ClientOf<TFsm>,
    StateNamesOfInstance<TFsm>
> &
    EventMapOfInstance<TFsm>;

/**
 * The event names `useFsmEvent` accepts for an instance. Under a declared
 * event map this is the built-in names plus the declared names; without one
 * it is `string`.
 */
export type FsmEventName<TFsm extends FsmLike> = keyof FsmEventMapOf<TFsm> & string;

export type BehavioralFsmEventName<TFsm extends BehavioralFsmLike> =
    keyof BehavioralFsmEventMapOf<TFsm> & string;
