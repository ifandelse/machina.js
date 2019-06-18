declare module 'machina' {
  interface BehavioralFsmInstance<S> {
    __machina__?: {
      [namespace: string]: {
        targetReplayState: S;
        state: S;
        priorState: S;
        priorAction: string;
        currentAction: string;
        currentActionArgs: any[];
        inputQueue: any[];
        inExitHandler: boolean;
      }
    }
  }

  type TransitionHandler<T, S> = BehavioralFsmHandler<T, S> | S;

  interface StateTransitions<T, S> {
    [state: string]: {
      '*'?: TransitionHandler<T, S>;
      _onEnter?: TransitionHandler<T, S>;
      _onExit?: TransitionHandler<T, S>;
      timeout?: TransitionHandler<T, S>;

      [handler: string]: TransitionHandler<T, S> | undefined;
    }
  }

  interface BehavioralFsmHandler<T extends BehavioralFsmInstance<S>, S> {
    (this: BehavioralFsm<T, S>, client: T,  ...additionalProps: any[]): any;
  }

  interface BehavioralFsmOptions<T extends BehavioralFsmInstance<S>, S, M = StateTransitions<T, S>> {
    namespace: string;
    initialState: string;

    states: M;

    [handler: string]: string  | M | BehavioralFsmHandler<T, S>;
  }

  class BehavioralFsm<T extends BehavioralFsmInstance<S>, S> {
    constructor(options: BehavioralFsmOptions<T, S>);

    static extend
      <T extends BehavioralFsmInstance<S>, S>
      (options: object): BehavioralFsm<T, S>;

    initialize(options: object): void;

    deferUntilTransition(client: T, state?: S): void;

    handle(client: T, action: string, ...additionalProps: any[]): void;
    transition(client: T, state: S): void;

    emit(event: string, options?: any): void;
    off(event: string, callback?: (data?: any) => void): void;
    on(event: string, callback: (data?: any) => void): void;
  }
}
