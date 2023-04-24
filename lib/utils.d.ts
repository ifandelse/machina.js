export function createUUID(): string;
export function extend(protoProps: any, staticProps: any): any;
export function getDefaultBehavioralOptions(): {
    initialState: string;
    eventListeners: {
        "*": any[];
    };
    states: {};
    namespace: string;
    useSafeEmit: boolean;
    hierarchy: {};
    pendingDelegations: {};
};
export function getDefaultClientMeta(): {
    inputQueue: any[];
    targetReplayState: string;
    state: any;
    priorState: any;
    priorAction: string;
    currentAction: string;
    currentActionArgs: any;
    inExitHandler: boolean;
};
export function getChildFsmInstance(config: any): {
    instance: any;
    factory(): any;
};
export function getLeaklessArgs(args: any, startIdx: any): any[];
export function listenToChild(fsm: any, child: any): any;
export function makeFsmNamespace(): string;
export { getDefaultBehavioralOptions as getDefaultOptions };
//# sourceMappingURL=utils.d.ts.map