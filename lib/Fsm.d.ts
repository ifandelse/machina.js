export function constructor(...args: any[]): void;
export function initClient(): void;
export function ensureClientMeta(): {
    constructor: (...args: any[]) => void;
    initClient(): void;
    ensureClientMeta(): any;
    ensureClientArg: (args: any) => any;
    getHandlerArgs: (args: any, isCatchAll: any) => any;
    getSystemHandlerArgs: (args: any, client: any) => any;
    buildEventPayload: (...args: any[]) => any;
};
export function ensureClientArg(args: any): any;
export function getHandlerArgs(args: any, isCatchAll: any): any;
export function getSystemHandlerArgs(args: any, client: any): any;
export function buildEventPayload(...args: any[]): any;
//# sourceMappingURL=Fsm.d.ts.map